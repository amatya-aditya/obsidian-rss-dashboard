import { FeedItem } from '../../../types/types';
import { htmlToReadableText } from '../../../utils/html-text';
import { isLatexFormulaImage } from '../../../utils/image-url-utils';

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

    const src = srcMatch[1].trim();
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

export function getArticlePreviewSummaryText(article: FeedItem): string {
  const candidates = [
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

export function shouldHighlightCardPreviewSummary(summaryText: string): boolean {
  return summaryText.length <= CARD_PREVIEW_HIGHLIGHT_MAX_CHARS;
}
