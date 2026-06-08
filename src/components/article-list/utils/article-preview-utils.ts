import { FeedItem } from '../../../types/types';
import { htmlToReadableText } from '../../../utils/html-text';

export const CARD_PREVIEW_SUMMARY_MAX_CHARS = 420;
export const CARD_PREVIEW_HIGHLIGHT_MAX_CHARS = 900;

export function extractFirstImageSrc(html: string): string | null {
  if (!html) return null;

  // Use a regex for rapid extraction without full DOM parsing
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? match[1] : null;
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
