const BLOCKED_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
]);

const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "code",
  "pre",
  "blockquote",
  "a",
]);

function isSafeHref(href: string): boolean {
  const trimmed = (href || "").trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:")) return false;

  if (lower.startsWith("http://")) return true;
  if (lower.startsWith("https://")) return true;
  if (lower.startsWith("mailto:")) return true;

  return false;
}

function sanitizeAndAppendNode(
  ownerDoc: Document,
  parent: HTMLElement,
  node: Node,
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (text) parent.appendChild(ownerDoc.createTextNode(text));
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tag)) {
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    Array.from(el.childNodes).forEach((child) =>
      sanitizeAndAppendNode(ownerDoc, parent, child),
    );
    return;
  }

  const next = ownerDoc.createElement(tag);

  if (tag === "a") {
    const href = el.getAttribute("href") || "";
    if (isSafeHref(href)) {
      next.setAttribute("href", href.trim());
      next.setAttribute("target", "_blank");
      next.setAttribute("rel", "noopener noreferrer");
    }
  }

  Array.from(el.childNodes).forEach((child) =>
    sanitizeAndAppendNode(ownerDoc, next, child),
  );

  parent.appendChild(next);
}

export function sanitizeAndAppendHtml(
  container: HTMLElement,
  rawHtml: string,
): void {
  const html = (rawHtml || "").trim();
  if (!html) return;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const ownerDoc = container.ownerDocument || document;

  Array.from(doc.body.querySelectorAll("*")).forEach((element) => {
    Array.from(element.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attr.name);
      }
    });
  });

  Array.from(doc.body.childNodes).forEach((node) =>
    sanitizeAndAppendNode(ownerDoc, container, node),
  );
}
