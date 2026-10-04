/**
 * Exact decimal arithmetic as a digit string and a power of ten. A single
 * separator with three following digits is ambiguous (decimal vs grouping),
 * so that spelling is only comparable literally. No rounding or locale guess.
 */
function numberKey(value: string, scale: number): string {
  const unsigned = value.replace(/^[-+]/u, "");
  const parts = unsigned.split(/[.,]/u);
  if (parts.length > 2 || parts[1]?.length === 3) return `literal:${value}:${scale}`;
  const fraction = parts[1] ?? "";
  let digits = `${parts[0]}${fraction}`.replace(/^0+/u, "");
  if (!digits) return "number:0";
  let exponent = scale - fraction.length;
  while (digits.endsWith("0")) {
    digits = digits.slice(0, -1);
    exponent += 1;
  }
  return `number:${value.startsWith("-") ? "-" : ""}${digits}e${exponent}`;
}

/**
 * Ground only the number, not the surrounding assertion or its unit. The
 * caller still enforces source provenance. Compact M/B is monetary only;
 * identifiers and unknown suffixes do not provide partial-number evidence.
 */
export function exactSourceNumericClaims(normalized: string): Set<string> {
  const claims = new Set<string>();
  // Inspect the right boundary AFTER consuming the full number. Putting it in
  // this regex would backtrack $272.5M into the incorrect evidence token 272.
  const numbers = /(?<![\p{L}\p{N}_])(?<![\p{L}\p{N}_][.,])[-+]?[0-9]+(?:[.,][0-9]+)*/gu;
  for (const match of normalized.matchAll(numbers)) {
    const value = match[0];
    const leadingSeparator = /[.,]/u.test(normalized[match.index - 1] ?? "");
    const end = match.index + value.length;
    const tail = normalized.slice(end);
    // The caller already collapses whitespace. A two-character lookbehind
    // avoids rescanning the whole source prefix for every number.
    const monetary = /[$€£]\s?$/u.test(normalized.slice(Math.max(0, match.index - 2), match.index));
    const compact = monetary ? /^(m|b)(?![\p{L}\p{N}_])/u.exec(tail) : null;
    if (!compact && /^[\p{L}\p{N}_]/u.test(tail)) {
      // A decimal with an unknown suffix must not disappear from the candidate
      // check either. Keep it opaque rather than accepting its integer prefix.
      if (/[.,]/u.test(value))
        claims.add(`opaque:${value}${/^[\p{L}\p{N}_]+/u.exec(tail)?.[0] ?? ""}`);
      continue;
    }
    const written = /^\s+(million|milyon|billion|milyar)(?![\p{L}\p{N}_])/u.exec(tail);
    const magnitude = compact?.[1] ?? written?.[1];
    const scale =
      magnitude === "m" || magnitude === "million" || magnitude === "milyon"
        ? 6
        : magnitude === "b" || magnitude === "billion" || magnitude === "milyar"
          ? 9
          : 0;
    const magnitudeLength = compact?.[0].length ?? written?.[0].length ?? 0;
    const percent = /^\s*%/u.test(tail.slice(magnitudeLength));
    const key = leadingSeparator
      ? `literal:${normalized[match.index - 1]}${value}:${scale}`
      : numberKey(value, scale);
    claims.add(`${key}${percent ? "%" : ""}`);
  }
  return claims;
}
