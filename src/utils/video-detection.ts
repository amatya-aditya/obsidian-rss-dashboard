import type { FeedItem } from "../types/types";

const KNOWN_VIDEO_ROUTE_PATTERNS = [
  /\/news\/videos\//i,
  /\/videos?\//i,
  /\/video\//i,
  /-video(?:$|[/?#])/i,
];

export function isKnownVideoUrl(url: string | undefined): boolean {
  if (!url) return false;
  return KNOWN_VIDEO_ROUTE_PATTERNS.some((pattern) => pattern.test(url));
}

export function isLikelyVideoItem(item: FeedItem): boolean {
  return (
    item.mediaType === "video" ||
    item.mediaContentType?.startsWith("video/") === true ||
    isKnownVideoUrl(item.link)
  );
}