import {
  normalizeSubstackImageSrcset,
  normalizeSubstackImageUrl,
} from "./substack-image-url";

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

const STRICT_ALLOWED_TAGS = new Set([
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

export interface SafeHtmlOptions {
  mode?: "strict" | "rich";
}

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

function isSafeSrc(src: string): boolean {
  const trimmed = (src || "").trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:")) return false;
  if (lower.startsWith("vbscript:")) return false;

  if (lower.startsWith("http://")) return true;
  if (lower.startsWith("https://")) return true;
  if (lower.startsWith("data:image/")) return true;

  return false;
}

function sanitizeSrcset(srcset: string): string {
  const entries = srcset
    .split(/,\s+(?=(?:https?:\/\/|data:image\/))/i)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const safeEntries: string[] = [];

  for (const entry of entries) {
    const firstSpace = entry.search(/\s/);
    const url = firstSpace === -1 ? entry : entry.slice(0, firstSpace);
    const descriptor = firstSpace === -1 ? "" : entry.slice(firstSpace).trim();

    // Browser srcset parsing treats commas as candidate separators, so
    // comma-bearing URL tokens like Substack CDN fetch URLs are not reliable
    // inside srcset even when they are valid plain src URLs.
    if (url.includes(",")) {
      continue;
    }

    if (!isSafeSrc(url)) {
      continue;
    }

    safeEntries.push(descriptor ? `${url} ${descriptor}` : url);
  }

  return safeEntries.join(", ");
}

/**
 * Validates if an attribute name is a valid HTML attribute name.
 * Rejects names containing quotes, whitespace, control characters, or other invalid characters.
 * @param name - The attribute name to validate
 * @returns true if the name is valid for use with setAttribute, false otherwise
 */
function isValidAttributeName(name: string): boolean {
  if (!name || name.length === 0) return false;

  // HTML attribute names must not contain:
  // - Spaces, tabs, line feeds, form feeds, carriage returns
  // - Null characters
  // - Quotes (single or double)
  // - Forward slash (/)
  // - Greater-than (>) sign
  // - Equals (=) sign
  const invalidChars = /[\s\0"'/>=/]/;

  // Also reject control characters (0x00-0x1F, 0x7F)
  const hasControlChars = /[\x00-\x1F\x7F]/.test(name);

  return !invalidChars.test(name) && !hasControlChars;
}

function copySafeAttributes(fromEl: HTMLElement, toEl: HTMLElement): void {
  Array.from(fromEl.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase();
    const value = attr.value || "";

    if (name.startsWith("on")) {
      return;
    }

    if (name === "style") {
      return;
    }

    if (name === "href") {
      const normalizedHref = normalizeSubstackImageUrl(value);
      if (isSafeHref(normalizedHref)) {
        toEl.setAttribute("href", normalizedHref.trim());
      }
      return;
    }

    if (name === "src" || name === "poster") {
      const normalizedSrc = normalizeSubstackImageUrl(value);
      if (isSafeSrc(normalizedSrc)) {
        toEl.setAttribute(name, normalizedSrc.trim());
      }
      return;
    }

    if (name === "srcset") {
      const safeSrcset = sanitizeSrcset(normalizeSubstackImageSrcset(value));
      if (safeSrcset) {
        toEl.setAttribute("srcset", safeSrcset);
      }
      return;
    }

    // For generic attributes, validate the name and wrap in try-catch
    // to handle malformed attribute names that would throw InvalidCharacterError
    if (isValidAttributeName(attr.name)) {
      try {
        toEl.setAttribute(attr.name, attr.value);
      } catch (error) {
        // Silently drop attributes that cannot be set (e.g., from malformed HTML)
        // This prevents one bad attribute from truncating the entire DOM subtree
      }
    }
    // If name is invalid, silently skip it instead of throwing
  });

  if (toEl.tagName.toLowerCase() === "a" && toEl.getAttribute("href")) {
    toEl.setAttribute("target", "_blank");
    toEl.setAttribute("rel", "noopener noreferrer");
  }
}

function copyStrictAttributes(fromEl: HTMLElement, toEl: HTMLElement): void {
  if (toEl.tagName.toLowerCase() !== "a") {
    return;
  }

  const href = fromEl.getAttribute("href") || "";
  if (!isSafeHref(href)) {
    return;
  }

  toEl.setAttribute("href", href.trim());
  toEl.setAttribute("target", "_blank");
  toEl.setAttribute("rel", "noopener noreferrer");
}

function sanitizeAndAppendNode(
  ownerDoc: Document,
  parent: HTMLElement,
  node: Node,
  mode: "strict" | "rich",
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

  if (mode === "strict" && !STRICT_ALLOWED_TAGS.has(tag)) {
    Array.from(el.childNodes).forEach((child) =>
      sanitizeAndAppendNode(ownerDoc, parent, child, mode),
    );
    return;
  }

  // Use standard DOM element creation for use Obsidian's createEl)
  const next = ownerDoc.createElement(tag);
  if (mode === "rich") {
    copySafeAttributes(el, next);
  } else {
    copyStrictAttributes(el, next);
  }

  Array.from(el.childNodes).forEach((child) =>
    sanitizeAndAppendNode(ownerDoc, next, child, mode),
  );

  parent.appendChild(next);
}

export function sanitizeAndAppendHtml(
  container: HTMLElement,
  rawHtml: string,
  options: SafeHtmlOptions = {},
): void {
  const html = (rawHtml || "").trim();
  if (!html) return;
  const mode = options.mode ?? "strict";

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const ownerDoc = container.ownerDocument || document;

  Array.from(doc.body.childNodes).forEach((node) =>
    sanitizeAndAppendNode(ownerDoc, container, node, mode),
  );
}
