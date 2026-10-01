import {
  isLatexFormulaImage,
  isLatexFormulaImageElement,
  optimizeImageUrl,
} from "../../utils/image-url-utils.js";

/**
 * Resolves an image URL against the feed URL. `FeedParser` supplies it, because
 * the resolver reads its XML parser (it normalizes double-encoded URLs).
 */
export type AbsoluteUrlResolver = (
  relativeUrl: string,
  baseUrl: string,
) => string;

const TRACKING_PIXEL_PATTERNS = [
  "tracking/",
  "pixel.gif",
  "beacon.",
  "1x1",
  "/track/",
  "rss-pixel",
];

function isTrackingPixel(url: string): boolean {
  return TRACKING_PIXEL_PATTERNS.some((p) => url.includes(p));
}

/** Reject known junk/placeholder src values before any URL resolution. */
function isJunkSrc(src: string | null): boolean {
  if (!src) return true;
  const t = src.trim();
  return (
    !t ||
    t === "undefined" ||
    t === "null" ||
    t === "#" ||
    t === "about:blank"
  );
}

/** An image extension, or the word "image" anywhere in the URL. */
function hasImageLikeSrc(src: string): boolean {
  return (
    src.endsWith(".jpg") ||
    src.endsWith(".jpeg") ||
    src.endsWith(".png") ||
    src.endsWith(".gif") ||
    src.endsWith(".webp") ||
    src.includes("image")
  );
}

/** Debug: log a URL for troubleshooting double-encoding. */
function warnDoubleEncoded(label: string, value: string | null): void {
  if (value && value.includes("%25")) {
    console.debug(
      `[RSS Dashboard] extractCoverImage: ${label} contains double-encoded: ${value}`,
    );
  }
}

/**
 * The cover from an `og:image` meta tag. Returns undefined to keep looking,
 * and a string (possibly empty) to stop.
 */
function coverFromOgImage(
  doc: Document,
  baseUrl: string,
  toAbsoluteUrl: AbsoluteUrlResolver,
): string | undefined {
  const ogImage = doc.querySelector('meta[property="og:image"]');
  if (!ogImage?.getAttribute("content")) return undefined;

  const content = ogImage.getAttribute("content");
  warnDoubleEncoded("og:image", content);
  const resolvedContent = content?.startsWith("http")
    ? content
    : content && baseUrl
      ? toAbsoluteUrl(content, baseUrl)
      : "";
  if (resolvedContent && !isLatexFormulaImage(resolvedContent)) {
    return optimizeImageUrl(resolvedContent);
  }
  return undefined;
}

/** The cover from the first non-formula `<img>`, unless its src is junk or a tracking pixel. */
function coverFromFirstImage(
  doc: Document,
  baseUrl: string,
  toAbsoluteUrl: AbsoluteUrlResolver,
): string | undefined {
  const firstImg = Array.from(doc.querySelectorAll("img")).find(
    (image) => !isLatexFormulaImageElement(image),
  );
  if (!firstImg) return undefined;

  const src = firstImg.getAttribute("src");
  warnDoubleEncoded("first img src", src);
  if (isJunkSrc(src)) return undefined;

  if (src && src.startsWith("http") && !isTrackingPixel(src)) {
    return optimizeImageUrl(src);
  } else if (src && baseUrl && !isTrackingPixel(src)) {
    return optimizeImageUrl(toAbsoluteUrl(src, baseUrl));
  }
  return undefined;
}

/** One image of the scan: its URL when it qualifies, undefined to go on to the next. */
function coverFromScannedImage(
  img: Element,
  baseUrl: string,
  toAbsoluteUrl: AbsoluteUrlResolver,
): string | undefined {
  const src = img.getAttribute("src");
  warnDoubleEncoded("img src", src);
  if (isJunkSrc(src) || isLatexFormulaImageElement(img)) return undefined;

  if (
    src &&
    src.startsWith("http") &&
    hasImageLikeSrc(src) &&
    !isTrackingPixel(src)
  ) {
    return optimizeImageUrl(src);
  } else if (
    src &&
    baseUrl &&
    hasImageLikeSrc(src) &&
    !isTrackingPixel(src)
  ) {
    return optimizeImageUrl(toAbsoluteUrl(src, baseUrl));
  }
  return undefined;
}

/** The cover from the first image that qualifies, skipping junk, formulas and tracking pixels. */
function coverFromImageScan(
  doc: Document,
  baseUrl: string,
  toAbsoluteUrl: AbsoluteUrlResolver,
): string | undefined {
  const imgTags = doc.querySelectorAll("img");
  for (const img of Array.from(imgTags)) {
    const cover = coverFromScannedImage(img, baseUrl, toAbsoluteUrl);
    if (cover !== undefined) return cover;
  }
  return undefined;
}

/**
 * The cover image of an item's HTML: an `og:image` meta tag, else the first
 * non-formula `<img>`, else the first image the scan accepts. A relative URL
 * is resolved with `toAbsoluteUrl` against `baseUrl`. Returns "" when nothing
 * qualifies or the HTML cannot be parsed.
 */
export function extractCoverImage(
  html: string,
  baseUrl: string,
  toAbsoluteUrl: AbsoluteUrlResolver,
): string {
  if (!html) return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    return (
      coverFromOgImage(doc, baseUrl, toAbsoluteUrl) ??
      coverFromFirstImage(doc, baseUrl, toAbsoluteUrl) ??
      coverFromImageScan(doc, baseUrl, toAbsoluteUrl) ??
      ""
    );
  } catch {
    // Image extraction failed
  }

  return "";
}
