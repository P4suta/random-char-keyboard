/** Format a character's first code point as a "U+XXXX" label. */
export function toLabel(ch: string): string {
  // codePointAt(0) is correct for astral chars (2 UTF-16 units).
  const cp = ch.codePointAt(0) ?? 0;
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}
