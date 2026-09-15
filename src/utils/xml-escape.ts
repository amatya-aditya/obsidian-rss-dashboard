/**
 * Escaping helpers for the few places where the plugin has to build XML by
 * string concatenation (OPML export, and rebuilding RSS from proxy JSON).
 *
 * Values passed here often originate from third-party feeds, so they must be
 * treated as untrusted: unescaped markup would either corrupt the document or
 * let a feed publisher inject elements the downstream parser would trust.
 */

/**
 * Escape a value for use as XML character data or inside a quoted attribute.
 */
export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

/**
 * Make a value safe to embed inside a `<![CDATA[ ... ]]>` section.
 *
 * CDATA has no escape mechanism, so the only way to keep a literal `]]>` in the
 * payload is to close the section and immediately reopen it around the `>`.
 */
export function escapeCdata(unsafe: string): string {
  return unsafe.replace(/\]\]>/g, "]]]]><![CDATA[>");
}
