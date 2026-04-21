import type { FeedItem } from "../types/types";
import { isOpenableHttpUrl } from "./url-utils";

export function resolveItemExternalUrl(item: FeedItem): string | null {
  const candidates = [
    item.link,
    item.guid,
    item.audioUrl,
    item.enclosure?.url,
    item.videoUrl,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed === "#") continue;
    if (isOpenableHttpUrl(trimmed)) return trimmed;
  }

  return null;
}
