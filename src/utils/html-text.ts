const NON_CONTENT_SELECTOR = [
  "script",
  "style",
  "iframe",
  "noscript",
  "template",
  "svg",
  "link",
  "meta",
  "base",
  "object",
  "embed",
].join(", ");

function parseHtml(html: string): Document | null {
  if (!html) return null;

  try {
    const htmlWithBlockSpacing = html.replace(
      /<\/(address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)>/gi,
      "$& ",
    );
    return new DOMParser().parseFromString(htmlWithBlockSpacing, "text/html");
  } catch {
    return null;
  }
}

export function stripNonContentHtmlNodes(html: string): string {
  const doc = parseHtml(html);
  if (!doc) return html;

  doc.querySelectorAll(NON_CONTENT_SELECTOR).forEach((node) => node.remove());
  return doc.body.innerHTML;
}

export function htmlToReadableText(html: string): string {
  const doc = parseHtml(html);
  if (!doc) return "";

  doc.querySelectorAll(NON_CONTENT_SELECTOR).forEach((node) => node.remove());

  return (doc.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
