/**
 * Escaping helper for values substituted into the saved-note frontmatter
 * template.
 *
 * Those values (article title, author, link, feed title) usually originate from
 * third-party feeds and are interpolated inside double-quoted YAML scalars. An
 * unescaped `"` ends the scalar early, and an unescaped `\` or line break can
 * do the same or change what the value means, so a crafted feed can break the
 * frontmatter or inject extra keys into it.
 */

/**
 * Escape a value for use inside a double-quoted YAML scalar.
 *
 * Backslash and double quote are the characters YAML requires escaping there.
 * Line breaks are escaped as `\n` so a multi-line value stays on one line
 * instead of ending the scalar. Leading and trailing spaces are preserved by a
 * double-quoted scalar as written, so they need no escaping.
 */
export function escapeYamlDoubleQuoted(unsafe: string): string {
  return unsafe
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n|\r|\n/g, "\\n");
}
