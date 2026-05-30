#!/usr/bin/env python3
"""The no-tofu CI pre-check (runs against the committed artifacts).

Independently re-reads every emitted woff2 chunk's cmap and proves the guarantee
chain end to end:

    crate/src/coverage.rs  ==  tools/coverage.json  ==  union(woff2 chunk cmaps)

plus: each chunk renders exactly the code points the plan assigned it, and the
chunks are pairwise disjoint (clean unicode-range, no surprise fallback). Because
the wasm sampler only ever emits code points in COVERED_RANGES, and those equal
the union of glyphs actually present in the served fonts, no output can render as
a tofu box.

Coverage definition MUST match the Rust planner: a cmap entry to a NON-.notdef
glyph.

Run from the repo root:
    tools/.venv/bin/python tools/verify_fonts.py
"""

import json
import os
import re
import sys

from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GEN = os.path.join(ROOT, "frontend", "src", "fonts", "gen")


def ranges_to_set(ranges):
    s = set()
    for lo, hi in ranges:
        s.update(range(lo, hi + 1))
    return s


def parse_coverage_rs(path):
    text = open(path).read()
    ranges = [
        (int(lo, 16), int(hi, 16))
        for lo, hi in re.findall(r"\(0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)\)", text)
    ]
    return ranges


def chunk_codepoints(path):
    tt = TTFont(path)
    cmap = tt.getBestCmap()  # best Unicode subtable: cp -> glyph name
    return {cp for cp, name in cmap.items() if name != ".notdef"}


def main():
    errors = []

    rs_ranges = parse_coverage_rs(os.path.join(ROOT, "crate", "src", "coverage.rs"))
    json_ranges = [tuple(r) for r in json.load(open(os.path.join(ROOT, "tools", "coverage.json")))]
    if rs_ranges != json_ranges:
        errors.append("crate/src/coverage.rs ranges != tools/coverage.json ranges")
    expected = ranges_to_set(json_ranges)

    plan = json.load(open(os.path.join(ROOT, "tools", "plan.json")))

    seen = set()
    union = set()
    for i, entry in enumerate(plan["fonts"]):
        chunk = os.path.join(GEN, f"chunk{i:03d}.woff2")
        if not os.path.exists(chunk):
            errors.append(f"missing chunk: {chunk}")
            continue
        cps = chunk_codepoints(chunk)
        planned = ranges_to_set(entry["ranges"])

        if cps != planned:
            dropped = planned - cps
            extra = cps - planned
            errors.append(
                f"chunk{i:03d} ({entry['file']}) cmap != plan: "
                f"dropped {len(dropped)}, extra {len(extra)}"
            )
        overlap = cps & seen
        if overlap:
            errors.append(f"chunk{i:03d} overlaps earlier chunks at {len(overlap)} code points")
        seen |= cps
        union |= cps

    if union != expected:
        only_cov = expected - union
        only_fonts = union - expected
        errors.append(
            f"union(woff2) != COVERED_RANGES: "
            f"{len(only_cov)} covered-but-not-served, {len(only_fonts)} served-but-not-covered"
        )

    if errors:
        print("FAIL — no-tofu verification failed:")
        for e in errors[:20]:
            print(f"  - {e}")
        return 1

    print(
        f"OK — {len(plan['fonts'])} chunks, {len(union)} code points served, "
        f"all == COVERED_RANGES, pairwise disjoint. No tofu possible."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
