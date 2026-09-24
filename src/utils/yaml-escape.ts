/**
 * Escaping helper for values substituted into the saved-note frontmatter
 * template.
 *
 * Those values (article title, author, link, feed title) usually originate from
 * third-party feeds and are interpolated inside double-quoted YAML scalars. An
 * unescaped `"` ends the scalar early, and an unescaped `\` or line break can
 * do the same or change what the value means, so a crafted feed can break the
 * frontmatter or inject extra keys into it. A character outside YAML's
 * printable set makes the whole frontmatter unparseable.
 */

const NAMED_ESCAPES: Record<number, string> = {
  0x85: "\\N",
  0x2028: "\\L",
  0x2029: "\\P",
};

function hex(code: number, digits: number): string {
  return code.toString(16).toUpperCase().padStart(digits, "0");
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Escape a value for use inside a double-quoted YAML scalar.
 *
 * Replacements, in order:
 * - `\` becomes `\\`, then `"` becomes `\"`.
 * - Line breaks (`\r\n`, `\r`, `\n`) become `\n`, so a multi-line value stays
 *   on one line instead of ending the scalar.
 * - C0 control characters other than tab and the line breaks (U+0000–U+0008,
 *   U+000B, U+000C, U+000E–U+001F) and DEL (U+007F) become `\xNN`.
 * - Next line (U+0085) becomes `\N`, line separator (U+2028) `\L`, and
 *   paragraph separator (U+2029) `\P`.
 * - U+FEFF, U+FFFE, U+FFFF, and unpaired surrogates become `\uNNNN`.
 *
 * Tab, valid surrogate pairs, and every other character pass through. Leading
 * and trailing spaces are preserved by a double-quoted scalar as written, so
 * they need no escaping.
 */
export function escapeYamlDoubleQuoted(unsafe: string): string {
  const escaped = unsafe
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, "\\n");

  let result = "";
  for (let i = 0; i < escaped.length; i++) {
    const code = escaped.charCodeAt(i);

    if ((code < 0x20 && code !== 0x09) || code === 0x7f) {
      result += `\\x${hex(code, 2)}`;
    } else if (code in NAMED_ESCAPES) {
      result += NAMED_ESCAPES[code];
    } else if (
      isHighSurrogate(code) &&
      isLowSurrogate(escaped.charCodeAt(i + 1))
    ) {
      result += escaped.slice(i, i + 2);
      i++;
    } else if (
      code === 0xfeff ||
      code === 0xfffe ||
      code === 0xffff ||
      isHighSurrogate(code) ||
      isLowSurrogate(code)
    ) {
      result += `\\u${hex(code, 4)}`;
    } else {
      result += escaped[i];
    }
  }
  return result;
}
