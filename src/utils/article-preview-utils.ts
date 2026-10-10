import { FeedItem } from "../types/types";
import { guardFeedBlurb } from "./article-metadata";
import { htmlToReadableText } from "./html-text";
import { isLatexFormulaImage } from "./image-url-utils";

export const CARD_PREVIEW_SUMMARY_MAX_CHARS = 420;
export const CARD_PREVIEW_HIGHLIGHT_MAX_CHARS = 900;

const TRACKING_PIXEL_PATTERNS = [
  "tracking/",
  "pixel.gif",
  "beacon.",
  "1x1",
  "/track/",
  "rss-pixel",
];

export function isTrackingPixel(url: string): boolean {
  return TRACKING_PIXEL_PATTERNS.some((p) => url.includes(p));
}

export function extractFirstImageSrc(html: string): string | null {
  if (!html) return null;

  // Scan tags so rejected formula/tracking images do not hide a later photo.
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const imageTag of imageTags) {
    const srcMatch = imageTag.match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) continue;

    const src = srcMatch[1]?.trim() ?? "";
    const className = imageTag.match(/\bclass=["']([^"']*)["']/i)?.[1];

    // Reject literal placeholder values that some feeds (e.g. NPR CDATA) emit.
    if (
      !src ||
      src === "undefined" ||
      src === "null" ||
      src === "#" ||
      src === "about:blank"
    ) {
      continue;
    }

    // Only accept HTTP/HTTPS or protocol-relative URLs.
    if (
      !src.startsWith("http://") &&
      !src.startsWith("https://") &&
      !src.startsWith("//")
    ) {
      continue;
    }

    if (isLatexFormulaImage(src, className) || isTrackingPixel(src)) continue;

    return src;
  }

  return null;
}

type StoredArticleImageField = "coverImage" | "image";

function getEligiblePreviewImageUrl(raw: string | null | undefined): string {
  const src = raw?.trim() || "";
  if (!src) return "";
  if (
    !src.startsWith("http://") &&
    !src.startsWith("https://") &&
    !src.startsWith("//")
  ) {
    return "";
  }
  if (isLatexFormulaImage(src) || isTrackingPixel(src)) return "";
  return src;
}

/** Resolves one preview image while preserving the caller's stored-field order. */
export function resolveArticlePreviewImage(
  article: FeedItem,
  storedFieldOrder: readonly StoredArticleImageField[],
): string | undefined {
  for (const field of storedFieldOrder) {
    const storedImage = getEligiblePreviewImageUrl(article[field]);
    if (storedImage) return storedImage;
  }

  const contentImage = extractFirstImageSrc(article.content || "");
  if (contentImage) return contentImage;

  const summaryImage = extractFirstImageSrc(article.summary || "");
  if (summaryImage) return summaryImage;

  if (article.enclosure?.type?.startsWith("image/")) {
    const enclosureImage = getEligiblePreviewImageUrl(article.enclosure.url);
    if (enclosureImage) return enclosureImage;
  }

  return undefined;
}

export function looksLikeStylesheetText(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  return (
    /^\.[\w-]+[\s,{.#[\w-]*]*\{\s*[\w-]+\s*:/i.test(normalized) ||
    /(?:^|[\s;}])(?:border|padding|background(?:-color)?|font-family|color|overflow-wrap)\s*:/i.test(
      normalized,
    )
  );
}

export function getCardPreviewSummaryText(summary: string): string {
  if (!summary) {
    return "";
  }

  const readableText = summary.includes("<")
    ? htmlToReadableText(summary)
    : summary;
  const normalized = readableText.replace(/\s+/g, " ").trim();
  if (normalized.length <= CARD_PREVIEW_SUMMARY_MAX_CHARS) {
    return normalized;
  }

  return `${normalized.slice(0, CARD_PREVIEW_SUMMARY_MAX_CHARS - 1)}…`;
}

interface BlurbCacheEntry {
  description: string;
  content: string;
  title: string;
  blurb: string;
}

// The guard reads the item's full `content`, so cache its verdict per item.
// The entry records its inputs, so an item rewritten on refresh recomputes.
const blurbCache = new WeakMap<FeedItem, BlurbCacheEntry>();

/**
 * The item blurb as preview text (#829): only when the item also ships a body
 * (without one the blurb is the body) and the blurb passes the resolver's
 * degenerate-value guard. Empty otherwise.
 */
function getGuardedBlurbPreview(article: FeedItem): string {
  const description = article.description || "";
  const content = article.content || "";
  const title = article.title || "";
  if (!description || !content.trim()) return "";

  const cached = blurbCache.get(article);
  if (
    cached &&
    cached.description === description &&
    cached.content === content &&
    cached.title === title
  ) {
    return cached.blurb;
  }

  const blurb = guardFeedBlurb({
    title,
    description,
    articleHtml: content,
  });
  blurbCache.set(article, { description, content, title, blurb });
  return blurb;
}

interface PreviewCacheEntry {
  title: string;
  summary: string;
  description: string;
  content: string;
  publisherDescription: string;
  text: string;
}

// The views and the highlight count both ask for every article's preview on
// each render, and building it converts HTML to text. The entry records its
// inputs, so an item rewritten on refresh recomputes.
const previewCache = new WeakMap<FeedItem, PreviewCacheEntry>();

export function getArticlePreviewSummaryText(article: FeedItem): string {
  const title = article.title || "";
  const summary = article.summary || "";
  const description = article.description || "";
  const content = article.content || "";
  const publisherDescription = article.publisherDescription || "";

  const cached = previewCache.get(article);
  if (
    cached &&
    cached.title === title &&
    cached.summary === summary &&
    cached.description === description &&
    cached.content === content &&
    cached.publisherDescription === publisherDescription
  ) {
    return cached.text;
  }

  const text = resolveArticlePreviewSummaryText(article);
  previewCache.set(article, {
    title,
    summary,
    description,
    content,
    publisherDescription,
    text,
  });
  return text;
}

function resolveArticlePreviewSummaryText(article: FeedItem): string {
  const blurb = getGuardedBlurbPreview(article);
  if (blurb) return getCardPreviewSummaryText(blurb);

  // For items with no usable blurb, the reader-fetched page description outranks
  // the feed's raw text and is the only text for feeds that publish empty
  // descriptions (#959). A guarded blurb still wins so keyword filters on the
  // summary scope do not flip once the reader stores it (#888).
  const candidates = [
    article.publisherDescription || "",
    article.summary || "",
    article.description || "",
    article.content || "",
  ];

  for (const candidate of candidates) {
    const previewText = getCardPreviewSummaryText(candidate);
    if (previewText && !looksLikeStylesheetText(previewText)) {
      return previewText;
    }
  }

  return "";
}

export function shouldHighlightCardPreviewSummary(
  summaryText: string,
): boolean {
  return summaryText.length <= CARD_PREVIEW_HIGHLIGHT_MAX_CHARS;
}
