import { describe, it, expect, vi, beforeEach } from "vitest";
import * as obsidian from "obsidian";
import { fetchFeedXml } from "../../../../src/services/feed-parser/feed-fetch.js";
import { RSS2_BASIC } from "./fixtures/rss-fixtures.js";

describe("fetchFeedXml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns valid feed text on direct fetch", async () => {
    vi.spyOn(obsidian, "requestUrl").mockResolvedValueOnce({
      text: RSS2_BASIC,
      status: 200,
      headers: {},
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({}),
    });

    const xml = await fetchFeedXml("https://example.com/feed.xml");
    expect(xml).toContain("<rss");
  });

  it("throws on Android when direct fetch fails without proxy chain", async () => {
    vi.spyOn(obsidian.Platform, "isAndroidApp", "get").mockReturnValue(true);
    vi.spyOn(obsidian, "requestUrl").mockRejectedValue(new Error("network error"));

    await expect(fetchFeedXml("https://example.com/feed.xml")).rejects.toThrow();
  });
});
