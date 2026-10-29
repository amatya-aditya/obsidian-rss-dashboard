import { describe, expect, it } from "vitest";
import discoverFeeds from "../../../src/discover/discover-feeds.json";

describe("Discover feed catalog", () => {
  it("does not offer Reddit feeds", () => {
    const redditFeeds = discoverFeeds.filter((feed) =>
      new URL(feed.url).hostname.endsWith("reddit.com"),
    );

    expect(redditFeeds).toEqual([]);
  });
});
