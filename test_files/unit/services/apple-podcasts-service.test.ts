import { describe, it, expect, beforeEach, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  clearApplePodcastsUrlCacheForTests,
  resolveApplePodcastsShowUrl,
} from "../../../src/services/apple-podcasts-service";

// Define the interface locally
interface ItunesSearchResult {
  feedUrl?: string;
  collectionViewUrl?: string;
  trackViewUrl?: string;
  collectionName?: string;
}

// Helper to create iTunes search response
function createSearchResponse(results: ItunesSearchResult[]): string {
  return JSON.stringify({
    resultCount: results.length,
    results: results,
  });
}

describe("apple-podcasts-service", () => {
  let requestUrlSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearApplePodcastsUrlCacheForTests();
    requestUrlSpy = vi.spyOn(obsidian, "requestUrl");
  });

  describe("resolveApplePodcastsShowUrl", () => {
    it("returns collectionViewUrl for matching feedUrl", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl,
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
          },
        ]),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
      );
      expect(requestUrlSpy).toHaveBeenCalledTimes(1);
    });

    it("returns trackViewUrl when collectionViewUrl is missing", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl,
            trackViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
          },
        ]),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
      );
    });

    it("returns null when neither collectionViewUrl nor trackViewUrl is present", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl,
            // No collectionViewUrl or trackViewUrl
          },
        ]),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBeNull();
    });

    it("matches feedUrl when candidate differs only by query string", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl: "https://example.com/podcast/feed.xml?ref=apple",
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
          },
        ]),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
      );
    });

    it("returns null when no feedUrl matches", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl: "https://different.com/feed.xml",
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/other/id99999",
          },
        ]),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBeNull();
    });

    it("returns null when result has missing feedUrl (guard rail)", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl: undefined as unknown as string,
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
          },
        ]),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBeNull();
    });

    it("returns null when response has no results", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: JSON.stringify({
          resultCount: 0,
          results: [],
        }),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBeNull();
    });

    it("returns null when response results is not an array", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: JSON.stringify({
          resultCount: 1,
          results: "not an array",
        }),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBeNull();
    });

    it("caches result on successful match", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl,
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
          },
        ]),
      });

      const result1 = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);
      const result2 = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result1).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
      );
      expect(result2).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
      );
      expect(requestUrlSpy).toHaveBeenCalledTimes(1);
    });

    it("does not cache null result on successful search with no match", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl: "https://different.com/feed.xml",
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/other/id99999",
          },
        ]),
      });

      const result1 = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);
      const result2 = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      // Should call requestUrl again since null was not cached
      expect(requestUrlSpy).toHaveBeenCalledTimes(2);
    });

    it("returns null and does not cache when requestUrl throws", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockRejectedValue(new Error("Network error"));

      const result1 = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);
      const result2 = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      // Should call requestUrl again since error was not cached
      expect(requestUrlSpy).toHaveBeenCalledTimes(2);
    });

    it("returns null when requestUrl returns non-200 status", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 500,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: "Internal Server Error",
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBeNull();
    });

    it("uses different cache entries for different feedUrls", async () => {
      const feedUrl1 = "https://example.com/podcast/feed1.xml";
      const feedUrl2 = "https://example.com/podcast/feed2.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl: feedUrl1,
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast-1/id12345",
          },
        ]),
      });

      const result1 = await resolveApplePodcastsShowUrl(feedUrl1, feedTitle);

      // Mock different response for second URL
      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl: feedUrl2,
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast-2/id67890",
          },
        ]),
      });

      const result2 = await resolveApplePodcastsShowUrl(feedUrl2, feedTitle);

      expect(result1).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast-1/id12345",
      );
      expect(result2).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast-2/id67890",
      );
      expect(requestUrlSpy).toHaveBeenCalledTimes(2);
    });

    it("finds match among multiple results", async () => {
      const feedUrl = "https://example.com/podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl: "https://unrelated1.com/feed.xml",
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/unrelated-1/id11111",
          },
          {
            feedUrl: "https://unrelated2.com/feed.xml",
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/unrelated-2/id22222",
          },
          {
            feedUrl,
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
          },
          {
            feedUrl: "https://unrelated3.com/feed.xml",
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/unrelated-3/id33333",
          },
        ]),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
      );
    });

    it("normalizes URLs for comparison (case insensitive)", async () => {
      const feedUrl = "https://Example.COM/Podcast/feed.xml";
      const feedTitle = "Test Podcast";

      requestUrlSpy.mockResolvedValue({
        status: 200,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
        json: {},
        text: createSearchResponse([
          {
            feedUrl: "https://example.com/podcast/feed.xml",
            collectionViewUrl:
              "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
          },
        ]),
      });

      const result = await resolveApplePodcastsShowUrl(feedUrl, feedTitle);

      expect(result).toBe(
        "https://podcasts.apple.com/us/podcast/test-podcast/id12345",
      );
    });
  });
});
