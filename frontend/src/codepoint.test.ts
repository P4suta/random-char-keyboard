import { describe, expect, it } from "vitest";
import { toLabel } from "./codepoint";

describe("toLabel", () => {
  it("formats an ASCII letter", () => {
    expect(toLabel("A")).toBe("U+0041");
  });

  it("zero-pads to four hex digits", () => {
    expect(toLabel("\u0001")).toBe("U+0001");
  });

  it("uppercases the hex digits", () => {
    expect(toLabel("ÿ")).toBe("U+00FF");
  });

  it("handles a BMP CJK code point", () => {
    expect(toLabel("漢")).toBe("U+6F22");
  });

  it("uses codePointAt, not charCodeAt, for astral code points", () => {
    expect(toLabel("\u{1D11E}")).toBe("U+1D11E");
  });

  it("handles the maximum Unicode scalar value", () => {
    expect(toLabel("\u{10FFFF}")).toBe("U+10FFFF");
  });

  it("falls back to U+0000 for an empty string", () => {
    expect(toLabel("")).toBe("U+0000");
  });
});
