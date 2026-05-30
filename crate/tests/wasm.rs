#![cfg(target_arch = "wasm32")]
//! WASM integration tests for the REAL exported sampler.
//!
//! On the host target this file compiles to nothing (the crate-level
//! `cfg(target_arch = "wasm32")` gate makes it empty), so plain `cargo test`
//! never runs it natively. Run it with:
//!
//!     wasm-pack test --node
//!
//! Node is the default runner for `wasm-pack test --node`, so we deliberately
//! do NOT call `wasm_bindgen_test_configure!(run_in_browser)`.

use keyboard_core::{is_covered, is_printable_char, random_printable_char};
use wasm_bindgen_test::*;

/// The real sampler must only ever yield a single printable, non-control scalar
/// that is also covered by a bundled font (so it never renders as tofu).
#[wasm_bindgen_test]
fn sampler_only_returns_printable_scalars() {
    for _ in 0..3000 {
        let s = random_printable_char();
        assert!(!s.is_empty(), "sampler returned an empty string");
        assert_eq!(
            s.chars().count(),
            1,
            "sampler returned more than one scalar: {s:?}"
        );

        let c = s.chars().next().expect("non-empty string has a first char");
        assert!(
            is_printable_char(c),
            "{c:?} (U+{:04X}) from sampler is not printable",
            c as u32
        );
        assert!(
            !c.is_control(),
            "{c:?} (U+{:04X}) from sampler is a control char",
            c as u32
        );
        assert!(
            is_covered(c),
            "{c:?} (U+{:04X}) from sampler is not covered by a bundled font (would tofu)",
            c as u32
        );
    }
}

/// Sanity: the classifier behaves identically under wasm as on the host.
#[wasm_bindgen_test]
fn classifier_matches_in_wasm() {
    assert!(is_printable_char('A'), "a letter must be printable under wasm");
    assert!(
        !is_printable_char('\n'),
        "a newline must not be printable under wasm"
    );
}
