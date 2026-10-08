import { describe, it, expect, vi, beforeEach } from "vitest";
import * as obsidian from "obsidian";
import { resolvePodcastPlatformUrl } from "../../../../src/services/feed-parser/podcast-platform-resolver.js";

function mockResponse(
  data: unknown,
  status = 200,
): obsidian.RequestUrlResponse {
  return {
    text: JSON.stringify(data),
    status,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: data,
  };
}

describe("resolvePodcastPlatformUrl – pca.st short link", () => {
  const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");

  beforeEach(() => {
    requestUrlSpy.mockReset();
  });

  it("resolves a pca.st slug via iTunes search without CORS proxy", async () => {
    const itunesResult = {
      resultCount: 1,
      results: [
        {
          feedUrl: "https://feeds.example.com/darknet.rss",
          collectionName: "Darknet Diaries",
        },
      ],
    };
    requestUrlSpy.mockResolvedValueOnce(mockResponse(itunesResult));

    const result = await resolvePodcastPlatformUrl(
      "https://pca.st/darknetdiaries",
    );
    expect(result).toBe("https://feeds.example.com/darknet.rss");

    const searchCall = requestUrlSpy.mock.calls[0]?.[0] as
      { url?: string } | undefined;
    expect(searchCall?.url).toContain("itunes.apple.com/search");
    expect(searchCall?.url).toContain("darknetdiaries");
  });

  it("throws when iTunes search returns no results for the slug", async () => {
    requestUrlSpy.mockResolvedValue(
      mockResponse({ resultCount: 0, results: [] }),
    );

    await expect(
      resolvePodcastPlatformUrl("https://pca.st/unknownshow"),
    ).rejects.toThrow();
  });

  it("throws when iTunes search fails for pca.st link", async () => {
    requestUrlSpy.mockRejectedValue(new Error("network error"));

    await expect(
      resolvePodcastPlatformUrl("https://pca.st/darknetdiaries"),
    ).rejects.toThrow();
  });
});

describe("resolvePodcastPlatformUrl – iTunes match validation", () => {
  const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");

  beforeEach(() => {
    requestUrlSpy.mockReset();
  });

  it("rejects an unrelated first iTunes hit for an opaque pca.st code", async () => {
    requestUrlSpy.mockResolvedValue(
      mockResponse({
        resultCount: 1,
        results: [
          {
            feedUrl: "https://anchor.fm/s/10fe7b0c0/podcast/rss",
            collectionName: "THE A.B.U.N.D.A.N.C.E. Method Podcast",
          },
        ],
      }),
    );

    await expect(
      resolvePodcastPlatformUrl("https://pca.st/podcast/a/b"),
    ).rejects.toThrow();
  });

  it("picks the later hit whose name matches the slug", async () => {
    requestUrlSpy.mockResolvedValueOnce(
      mockResponse({
        resultCount: 2,
        results: [
          {
            feedUrl: "https://wrong.example/rss",
            collectionName: "Other Show",
          },
          {
            feedUrl: "https://right.example/rss",
            collectionName: "Darknet Diaries",
          },
        ],
      }),
    );

    const result = await resolvePodcastPlatformUrl(
      "https://pocketcasts.com/podcast/darknet-diaries/170a7610-948e-0135-9d21-5bb073f92b78",
    );
    expect(result).toBe("https://right.example/rss");
  });

  it("accepts a hyphen-less slug that matches the show name", async () => {
    requestUrlSpy.mockResolvedValueOnce(
      mockResponse({
        resultCount: 1,
        results: [
          {
            feedUrl: "https://right.example/rss",
            collectionName: "Darknet Diaries",
          },
        ],
      }),
    );

    const result = await resolvePodcastPlatformUrl(
      "https://pca.st/darknetdiaries",
    );
    expect(result).toBe("https://right.example/rss");
  });
});

describe("resolvePodcastPlatformUrl – pocketcasts.com slug-first strategy", () => {
  const requestUrlSpy = vi.spyOn(obsidian, "requestUrl");

  beforeEach(() => {
    requestUrlSpy.mockReset();
  });

  it("resolves a full pocketcasts.com URL via slug-first iTunes search", async () => {
    const itunesResult = {
      resultCount: 1,
      results: [
        {
          feedUrl: "https://feeds.example.com/darknet.rss",
          collectionName: "Darknet Diaries",
        },
      ],
    };
    requestUrlSpy.mockResolvedValueOnce(mockResponse(itunesResult));

    const result = await resolvePodcastPlatformUrl(
      "https://pocketcasts.com/podcast/darknet-diaries/170a7610-948e-0135-9d21-5bb073f92b78",
    );
    expect(result).toBe("https://feeds.example.com/darknet.rss");

    const searchCall = requestUrlSpy.mock.calls[0]?.[0] as
      { url?: string } | undefined;
    expect(searchCall?.url).toContain("itunes.apple.com/search");
    // Hyphens in the slug are converted to spaces before URL-encoding
    // so the term "darknet-diaries" becomes "darknet%20diaries"
    expect(decodeURIComponent(searchCall?.url ?? "")).toContain(
      "darknet diaries",
    );
  });

  it("falls through to proxy scraping if slug-first iTunes search yields no results", async () => {
    // iTunes search returns nothing
    const emptyItunes = { resultCount: 0, results: [] };
    requestUrlSpy.mockResolvedValueOnce(mockResponse(emptyItunes));

    // Proxy (allorigins) returns HTML with an RSS link tag
    const htmlWithRss = `<html><head>
      <link type="application/rss+xml" href="https://feeds.example.com/show.rss">
    </head></html>`;
    requestUrlSpy.mockResolvedValueOnce(
      mockResponse({ contents: htmlWithRss }),
    );

    const result = await resolvePodcastPlatformUrl(
      "https://pocketcasts.com/podcast/some-show/abc12345-0000-0000-0000-000000000000",
    );
    expect(result).toBe("https://feeds.example.com/show.rss");
  });
});
