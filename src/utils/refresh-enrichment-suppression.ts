import type { Feed, FeedItem } from "../types/types";
import { normalizeRefreshEnrichmentValue } from "./refresh-enrichment-value";

export function suppressRefreshBoilerplate(feed: Feed): Set<FeedItem> {
  const changed = new Set<FeedItem>();
  const items = feed.items.filter(
    (item) => item.refreshEnrichment?.url === item.link,
  );
  for (const field of ["description", "image"] as const) {
    suppressField(items, field, changed);
  }
  return changed;
}

function suppressField(
  items: FeedItem[],
  field: "description" | "image",
  changed: Set<FeedItem>,
): void {
  const counts = new Map<string, Set<string>>();
  const known = new Set<string>();
  for (const item of items) {
    const data = item.refreshEnrichment;
    const value = data?.[field];
    if (!value) continue;
    const key = normalizeRefreshEnrichmentValue(field, value);
    const urls = counts.get(key) ?? new Set<string>();
    urls.add(item.link);
    counts.set(key, urls);
    if (
      field === "description" ? data?.suppressDescription : data?.suppressImage
    )
      known.add(key);
  }
  for (const item of items) {
    const data = item.refreshEnrichment;
    const value = data?.[field];
    if (!data || !value) continue;
    const key = normalizeRefreshEnrichmentValue(field, value);
    if (!known.has(key) && (counts.get(key)?.size ?? 0) < 3) continue;
    if (field === "description" ? data.suppressDescription : data.suppressImage)
      continue;
    if (field === "description") data.suppressDescription = true;
    else data.suppressImage = true;
    changed.add(item);
  }
}
