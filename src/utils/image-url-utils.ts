import { hostMatches } from "./url-host";

// Image sources in feed HTML are often protocol-relative ("//host/path").
function imageHostMatches(url: string, domain: string): boolean {
  return hostMatches(url.startsWith("//") ? `https:${url}` : url, domain);
}

export function optimizeImageUrl(url: string, maxWidth = 600): string {
  if (!url) return url;

  // NPR / Brightspot CDN
  if (
    imageHostMatches(url, "brightspotcdn.com") ||
    imageHostMatches(url, "media.npr.org")
  ) {
    return url
      .replace(/\/resize\/\d+x\d+!?\//g, `/resize/${maxWidth}x/`)
      .replace(/\/(?:crop\/)?\d+x\d+(?:[+]\d+[+]\d*)?\//g, "/");
  }

  // WordPress Photon / Jetpack CDN
  if (
    imageHostMatches(url, "i0.wp.com") ||
    imageHostMatches(url, "i1.wp.com") ||
    imageHostMatches(url, "i2.wp.com")
  ) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("w", String(maxWidth));
      parsed.searchParams.delete("h");
      return parsed.toString();
    } catch {
      return url;
    }
  }

  // Cloudinary
  if (imageHostMatches(url, "cloudinary.com")) {
    return url.replace(/\/upload\//, `/upload/w_${maxWidth},c_scale/`);
  }

  // Generic: return unchanged (unknown CDN, no safe transform)
  return url;
}

const LATEX_PATH = "latex.php?";
const LATEX_PARAM = "latex=";

function asciiLower(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

function isWordCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95
  );
}

/** Index of `needle` (lowercase ASCII) in `text[from, limit)`, ignoring ASCII case, or -1. */
function indexOfAsciiInsensitive(
  text: string,
  needle: string,
  from: number,
  limit = text.length,
): number {
  const last = limit - needle.length;
  for (let i = from; i <= last; i++) {
    let j = 0;
    while (
      j < needle.length &&
      asciiLower(text.charCodeAt(i + j)) === needle.charCodeAt(j)
    ) {
      j++;
    }
    if (j === needle.length) return i;
  }
  return -1;
}

/** True when a `latex=` parameter (not part of a longer word) sits in `text[from, end)`. */
function hasLatexParam(text: string, from: number, end: number): boolean {
  let at = indexOfAsciiInsensitive(text, LATEX_PARAM, from, end);
  while (at >= 0) {
    if (!isWordCode(text.charCodeAt(at - 1))) return true;
    at = indexOfAsciiInsensitive(text, LATEX_PARAM, at + 1, end);
  }
  return false;
}

/**
 * Text-only check for a `latex.php?...latex=` URL, used when the source will
 * not parse as a URL. `latex.php?` must start the text or follow a `/`, and no
 * `#` may sit between it and the `latex=` parameter. Each query span is
 * scanned once, so the cost grows linearly with the input length.
 */
export function hasLatexPhpQuery(text: string): boolean {
  let scannedTo = 0;
  let at = indexOfAsciiInsensitive(text, LATEX_PATH, 0);
  while (at >= 0) {
    const from = at + LATEX_PATH.length;
    // A span inside one already scanned cannot hold a match the first missed.
    if (from >= scannedTo && (at === 0 || text.charCodeAt(at - 1) === 47)) {
      const hash = text.indexOf("#", from);
      const end = hash < 0 ? text.length : hash;
      if (hasLatexParam(text, from, end)) return true;
      scannedTo = end;
    }
    at = indexOfAsciiInsensitive(text, LATEX_PATH, at + 1);
  }
  return false;
}

/** Returns whether an image is a WordPress-rendered LaTeX formula. */
export function isLatexFormulaImage(
  src: string | null | undefined,
  className?: string | null,
): boolean {
  const hasLatexClass = (className ?? "")
    .split(/\s+/)
    .some((token) => token.toLowerCase() === "latex");
  if (hasLatexClass) return true;

  const trimmedSrc = src?.trim();
  if (!trimmedSrc) return false;

  try {
    const parsed = new URL(trimmedSrc, "https://rss-dashboard.invalid");
    return (
      parsed.pathname.toLowerCase().endsWith("/latex.php") &&
      parsed.searchParams.has("latex")
    );
  } catch {
    return hasLatexPhpQuery(trimmedSrc);
  }
}

/** DOM convenience wrapper for {@link isLatexFormulaImage}. */
export function isLatexFormulaImageElement(image: Element): boolean {
  return isLatexFormulaImage(
    image.getAttribute("src"),
    image.getAttribute("class"),
  );
}

/** Returns the first non-empty URL that is not a rendered formula image. */
export function firstNonFormulaImageUrl(
  candidates: readonly (string | null | undefined)[],
): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && !isLatexFormulaImage(trimmed)) return trimmed;
  }
  return undefined;
}

/** Returns the first image element that is eligible for an article-media role. */
export function findFirstNonFormulaImage(
  root: ParentNode,
): HTMLImageElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLImageElement>("img")).find(
      (image) => !isLatexFormulaImageElement(image),
    ) ?? null
  );
}

/** Returns whether an element is or contains a rendered formula image. */
export function containsLatexFormulaImage(root: Element): boolean {
  if (
    root.tagName.toLowerCase() === "img" &&
    isLatexFormulaImageElement(root)
  ) {
    return true;
  }

  return Array.from(root.querySelectorAll("img")).some((image) =>
    isLatexFormulaImageElement(image),
  );
}

export function optimizeImageUrlsInContent(
  content: string,
  maxWidth = 600,
): string {
  if (!content) return content;

  return content.replace(
    /<img([^>]+)src=["']([^"']+)["']/gi,
    (match: string, attributes: string, src: string) => {
      const optimizedSrc = optimizeImageUrl(src, maxWidth);
      return `<img${attributes}src="${optimizedSrc}"`;
    },
  );
}

export function sanitizeImageUrl(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return "";
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://"))
    return "";
  return trimmed;
}
