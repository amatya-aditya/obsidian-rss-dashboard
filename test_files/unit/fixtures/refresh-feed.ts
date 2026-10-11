import type { Feed } from "../../../src/types/types";

export function createRefreshFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Example feed",
    url: "https://example.com/feed.xml",
    folder: "RSS",
    items: [],
    lastUpdated: 0,
    scanInterval: 5,
    lastRefreshAttemptCompletedAt: 0,
    ...overrides,
  };
}
