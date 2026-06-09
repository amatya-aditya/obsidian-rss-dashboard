import { describe, it, expect, vi, beforeEach } from "vitest";
import * as obsidian from "obsidian";
import { resolvePodcastPlatformUrl } from "../../../../src/services/feed-parser/podcast-platform-resolver.js";

describe("resolvePodcastPlatformUrl", () => {
  const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");

  beforeEach(() => {
    requestUrlSpy.mockReset();
  });

  it("returns null for non-podcast URLs", async () => {
    const result = await resolvePodcastPlatformUrl("https://example.com/feed.xml");
    expect(result).toBeNull();
    expect(requestUrlSpy).not.toHaveBeenCalled();
  });

  it("resolves Apple Podcasts URLs via iTunes lookup", async () => {
    requestUrlSpy.mockResolvedValueOnce({
      text: JSON.stringify({
        resultCount: 1,
        results: [{ feedUrl: "https://feeds.example.com/podcast.rss" }],
      }),
      status: 200,
      headers: {},
      arrayBuffer: async () => new ArrayBuffer(0),
      json: async () => ({}),
    });

    const result = await resolvePodcastPlatformUrl(
      "https://podcasts.apple.com/us/podcast/test/id123456789",
    );
    expect(result).toBe("https://feeds.example.com/podcast.rss");
    const call = requestUrlSpy.mock.calls[0]?.[0] as { url?: string } | undefined;
    expect(call?.url).toContain("itunes.apple.com/lookup");
  });
});
