//! Offline font-coverage planner — the fast Rust half of the hybrid pipeline.
//!
//! Reads every source font in `tools/sources/`, computes the printable code
//! points each one renders (cmap entry to a non-.notdef glyph), de-duplicates
//! across fonts by a fixed priority, and emits:
//!   - `tools/plan.json`       per-font owned code-point ranges (for fontTools)
//!   - `tools/coverage.json`   the merged union of all owned ranges
//!   - `crate/src/coverage.rs` `COVERED_RANGES` baked into the wasm crate
//!
//! Coverage definition (MUST match `tools/verify_fonts.py`): a cmap entry to a
//! NON-ZERO glyph id (.notdef = not covered), mirroring how browsers do
//! per-character font fallback. This keeps the guarantee order-independent.
//!
//! Run from the repo root:
//!   cargo run --release --manifest-path tools/planner/Cargo.toml

use std::fs;
use std::path::PathBuf;

use unicode_general_category::{get_general_category, GeneralCategory as GC};

const MAX_CP: u32 = 0x10FFFF;

/// Same printable whitelist as `crate/src/lib.rs::is_printable`, kept in sync by
/// hand. Drift is harmless: the wasm sampler re-checks `is_printable_char`, so
/// this only decides which glyphs are worth shipping (not what can be emitted).
fn is_printable(c: char) -> bool {
    matches!(
        get_general_category(c),
        GC::UppercaseLetter
            | GC::LowercaseLetter
            | GC::TitlecaseLetter
            | GC::ModifierLetter
            | GC::OtherLetter
            | GC::DecimalNumber
            | GC::LetterNumber
            | GC::OtherNumber
            | GC::ConnectorPunctuation
            | GC::DashPunctuation
            | GC::OpenPunctuation
            | GC::ClosePunctuation
            | GC::InitialPunctuation
            | GC::FinalPunctuation
            | GC::OtherPunctuation
            | GC::MathSymbol
            | GC::CurrencySymbol
            | GC::ModifierSymbol
            | GC::OtherSymbol
    )
}

/// Lower value = higher priority (owns shared code points first). The base
/// Noto Sans owns Latin/Greek/Cyrillic; symbols/math own their blocks; CJK and
/// emoji come last so a dedicated script font wins any overlap.
fn priority(name: &str) -> i32 {
    if name.starts_with("NotoSans[") {
        0
    } else if name.starts_with("NotoSansSymbols2") {
        70
    } else if name.starts_with("NotoSansSymbols") {
        71
    } else if name.starts_with("NotoSansMath") {
        72
    } else if name.starts_with("NotoSansSC") {
        90
    } else if name.starts_with("NotoSansKR") {
        91
    } else if name.starts_with("NotoEmoji") {
        100
    } else {
        50
    }
}

fn to_ranges(sorted: &[u32]) -> Vec<(u32, u32)> {
    let mut out = Vec::new();
    let mut it = sorted.iter().copied();
    if let Some(first) = it.next() {
        let (mut lo, mut hi) = (first, first);
        for cp in it {
            if cp == hi + 1 {
                hi = cp;
            } else {
                out.push((lo, hi));
                lo = cp;
                hi = cp;
            }
        }
        out.push((lo, hi));
    }
    out
}

fn ranges_json(ranges: &[(u32, u32)]) -> String {
    let parts: Vec<String> = ranges
        .iter()
        .map(|(lo, hi)| format!("[{lo},{hi}]"))
        .collect();
    format!("[{}]", parts.join(","))
}

fn main() {
    let sources_dir = PathBuf::from("tools/sources");
    let mut files: Vec<PathBuf> = fs::read_dir(&sources_dir)
        .expect("read tools/sources (run from repo root, after fetching sources)")
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension()
                .map_or(false, |x| x == "ttf" || x == "otf")
        })
        .collect();
    files.sort_by_key(|p| {
        let n = p.file_name().unwrap().to_string_lossy().into_owned();
        (priority(&n), n)
    });

    let mut owned_flag = vec![false; (MAX_CP + 1) as usize];
    let mut union: Vec<u32> = Vec::new();
    let mut plan_entries: Vec<String> = Vec::new();
    let mut skipped: Vec<String> = Vec::new();

    for path in &files {
        let name = path.file_name().unwrap().to_string_lossy().into_owned();
        let data = match fs::read(path) {
            Ok(d) => d,
            Err(_) => {
                skipped.push(name);
                continue;
            }
        };
        let face = match ttf_parser::Face::parse(&data, 0) {
            Ok(f) => f,
            Err(_) => {
                skipped.push(name);
                continue;
            }
        };
        let cmap = match face.tables().cmap {
            Some(c) => c,
            None => {
                skipped.push(name);
                continue;
            }
        };

        let mut owned: Vec<u32> = Vec::new();
        for st in cmap.subtables {
            if !st.is_unicode() {
                continue;
            }
            st.codepoints(|cp| {
                if cp > MAX_CP {
                    return;
                }
                let idx = cp as usize;
                if owned_flag[idx] {
                    return;
                }
                let Some(c) = char::from_u32(cp) else {
                    return;
                };
                if !is_printable(c) {
                    return;
                }
                if st.glyph_index(cp).map_or(false, |g| g.0 != 0) {
                    owned_flag[idx] = true;
                    owned.push(cp);
                }
            });
        }

        if owned.is_empty() {
            continue;
        }
        owned.sort_unstable();
        owned.dedup();
        union.extend_from_slice(&owned);
        let ranges = to_ranges(&owned);
        plan_entries.push(format!(
            "{{\"file\":\"{}\",\"ranges\":{}}}",
            name.replace('\\', "\\\\").replace('"', "\\\""),
            ranges_json(&ranges)
        ));
        eprintln!(
            "{name:<46} owned {:>6} cps in {} ranges",
            owned.len(),
            ranges.len()
        );
    }

    union.sort_unstable();
    union.dedup();
    let union_ranges = to_ranges(&union);

    let plan = format!(
        "{{\n  \"fonts\": [\n    {}\n  ],\n  \"total\": {}\n}}\n",
        plan_entries.join(",\n    "),
        union.len()
    );
    fs::write("tools/plan.json", plan).expect("write tools/plan.json");
    fs::write(
        "tools/coverage.json",
        format!("{}\n", ranges_json(&union_ranges)),
    )
    .expect("write tools/coverage.json");

    let mut rs = String::new();
    rs.push_str("// @generated by tools/planner — DO NOT EDIT.\n");
    rs.push_str("// Inclusive code-point ranges covered (non-.notdef glyph) by the bundled\n");
    rs.push_str("// woff2 glyph fonts, intersected with the printable whitelist: the no-tofu set.\n");
    rs.push_str("pub static COVERED_RANGES: &[(u32, u32)] = &[\n");
    for (lo, hi) in &union_ranges {
        rs.push_str(&format!("    (0x{lo:X}, 0x{hi:X}),\n"));
    }
    rs.push_str("];\n");
    fs::write("crate/src/coverage.rs", rs).expect("write crate/src/coverage.rs");

    eprintln!("\n== plan complete ==");
    eprintln!("fonts used:   {}", plan_entries.len());
    eprintln!("skipped:      {} {skipped:?}", skipped.len());
    eprintln!("covered cps:  {}", union.len());
    eprintln!("union ranges: {}", union_ranges.len());
}
