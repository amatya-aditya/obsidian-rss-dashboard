import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import {
  loadFeedForPreview,
  parseFeedPreviewFromXmlText,
} from "../../../../src/services/feed-parser/feed-preview.js";
import { JSON_FEED_BASIC } from "./fixtures/rss-fixtures.js";

function mockRequestUrlResponse(
  text: string,
  contentType = "application/feed+json",
): RequestUrlResponse {
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    status: 200,
    headers: { "content-type": contentType },
    arrayBuffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    json: {},
  };
}

// An HTML page that is not a feed but advertises one, mirroring the WordPress
// page the preview could not load before (GitHub #1201).
const WEB_PAGE_WITH_FEED_LINK = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Example Blog</title>
    <link rel="alternate" type="application/rss+xml" href="/posts.xml" />
  </head>
  <body><h1>Example Blog</h1></body>
</html>`;

const WEB_PAGE_WITHOUT_FEED_LINK = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Example Blog</title>
  </head>
  <body><h1>Example Blog</h1></body>
</html>`;

const DISCOVERED_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Discovered Feed</title>
    <description>Posts</description>
    <link>https://example.com</link>
    <item>
      <title>First post</title>
      <link>https://example.com/posts/first</link>
      <guid>https://example.com/posts/first</guid>
      <pubDate>Fri, 13 Mar 2026 12:45:44 GMT</pubDate>
      <description>Hello</description>
    </item>
  </channel>
</rss>`;

function requestUrls(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((call) => (call[0] as { url: string }).url);
}

function mockRss2JsonResponse(title: string): RequestUrlResponse {
  return mockRequestUrlResponse(
    JSON.stringify({
      status: "ok",
      feed: { title, description: "", link: "" },
      items: [],
    }),
  );
}

describe("feed preview parsing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("escapes bare ampersands so preview detects entries", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Feed</title>
    <description>AI & Data Science</description>
    <link>https://example.com</link>
    <item>
      <title>First</title>
      <link>https://example.com/first</link>
      <guid>https://example.com/first</guid>
      <pubDate>Fri, 13 Mar 2026 12:45:44 GMT</pubDate>
      <description>Hello</description>
    </item>
  </channel>
</rss>`;

    const parsed = parseFeedPreviewFromXmlText(
      xml,
      "https://example.com/rss.xml",
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("Example Feed");
    expect(parsed?.hasEntries).toBe(true);
    expect(parsed?.latestPubDate).toContain("2026");
  });

  it("returns null for empty xml text", () => {
    expect(
      parseFeedPreviewFromXmlText("", "https://example.com/feed.xml"),
    ).toBeNull();
  });

  it("loads title and latest entry from a JSON Feed", async () => {
    const requestUrlSpy = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(mockRequestUrlResponse(JSON_FEED_BASIC));

    const preview = await loadFeedForPreview("https://example.com/feed.json");

    expect(preview).toMatchObject({
      title: "JSON Feed",
      hasEntries: true,
      latestPubDate: "2024-01-01T00:00:00Z",
      feedUrl: "https://example.com/feed.json",
    });
    expect(obsidian.requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: expect.stringContaining("application/feed+json"),
        }),
      }),
    );
    // #1162: the preview fetch identifies as Obsidian, not as a browser.
    const sent = requestUrlSpy.mock.calls[0]?.[0] as
      { headers?: Record<string, string> } | undefined;
    expect(Object.keys(sent?.headers ?? {})).toEqual(["Accept"]);
  });

  it("falls back to RSS2JSON when the direct request fails", async () => {
    const requestUrlSpy = vi
      .spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce(
        mockRequestUrlResponse(
          JSON.stringify({
            status: "ok",
            feed: { title: "Via RSS2JSON", description: "", link: "" },
            items: [],
          }),
        ),
      );

    const preview = await loadFeedForPreview("https://example.com/feed.xml");

    expect(preview.title).toBe("Via RSS2JSON");
    expect(requestUrlSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("api.rss2json.com"),
      }),
    );
  });

  it("does not call RSS2JSON when the CORS proxy is disabled", async () => {
    const requestUrlSpy = vi
      .spyOn(obsidian, "requestUrl")
      .mockRejectedValue(new Error("blocked"));

    await expect(
      loadFeedForPreview("https://example.com/feed.xml", undefined, {
        allowRss2JsonFallback: false,
      }),
    ).rejects.toThrow("CORS proxy is disabled");

    const urls = requestUrlSpy.mock.calls.map(
      (call) => (call[0] as { url: string }).url,
    );
    expect(urls.some((url) => url.includes("rss2json"))).toBe(false);
  });

  it("says the request failed when the direct request rejects and the CORS proxy is disabled", async () => {
    vi.spyOn(obsidian, "requestUrl").mockRejectedValue(new Error("blocked"));

    await expect(
      loadFeedForPreview("https://example.com/feed.xml", undefined, {
        allowRss2JsonFallback: false,
      }),
    ).rejects.toThrow(/direct request failed/);
  });

  // GitHub #1201: Load on a page address failed while Save added the same
  // address, because the preview path skipped feed discovery.
  it("loads the feed an HTML page advertises when the direct response is not a feed", async () => {
    const requestUrlSpy = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(
        mockRequestUrlResponse(WEB_PAGE_WITH_FEED_LINK, "text/html"),
      )
      .mockResolvedValueOnce(
        mockRequestUrlResponse(WEB_PAGE_WITH_FEED_LINK, "text/html"),
      )
      .mockResolvedValueOnce(
        mockRequestUrlResponse(DISCOVERED_FEED_XML, "application/rss+xml"),
      );

    const preview = await loadFeedForPreview("https://example.com/blog");

    expect(preview).toMatchObject({
      title: "Discovered Feed",
      hasEntries: true,
      latestPubDate: "Fri, 13 Mar 2026 12:45:44 GMT",
      // The advertised address, not the page address, is the feed to keep.
      feedUrl: "https://example.com/posts.xml",
    });
    expect(requestUrls(requestUrlSpy)).toEqual([
      "https://example.com/blog",
      "https://example.com/blog",
      "https://example.com/posts.xml",
    ]);
    expect(
      requestUrls(requestUrlSpy).some((url) => url.includes("rss2json")),
    ).toBe(false);
  });

  it("says the address is a page with no feed when discovery finds nothing and the CORS proxy is disabled", async () => {
    const requestUrlSpy = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValue(
        mockRequestUrlResponse(WEB_PAGE_WITHOUT_FEED_LINK, "text/html"),
      );

    await expect(
      loadFeedForPreview("https://example.com/blog", undefined, {
        allowRss2JsonFallback: false,
      }),
    ).rejects.toThrow(/page with no feed/);

    expect(
      requestUrls(requestUrlSpy).some((url) => url.includes("rss2json")),
    ).toBe(false);
  });

  it("falls back to RSS2JSON for a page with no discoverable feed when the CORS proxy is on", async () => {
    const requestUrlSpy = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValueOnce(
        mockRequestUrlResponse(WEB_PAGE_WITHOUT_FEED_LINK, "text/html"),
      )
      .mockResolvedValueOnce(
        mockRequestUrlResponse(WEB_PAGE_WITHOUT_FEED_LINK, "text/html"),
      )
      .mockResolvedValueOnce(mockRss2JsonResponse("Via RSS2JSON"));

    const preview = await loadFeedForPreview("https://example.com/blog");

    expect(preview.title).toBe("Via RSS2JSON");
    expect(
      requestUrls(requestUrlSpy).some((url) => url.includes("rss2json")),
    ).toBe(true);
  });

  it("does not run discovery or RSS2JSON when the direct response is already a feed", async () => {
    const requestUrlSpy = vi
      .spyOn(obsidian, "requestUrl")
      .mockResolvedValue(
        mockRequestUrlResponse(DISCOVERED_FEED_XML, "application/rss+xml"),
      );

    const preview = await loadFeedForPreview("https://example.com/posts.xml");

    expect(preview.title).toBe("Discovered Feed");
    expect(requestUrls(requestUrlSpy)).toEqual([
      "https://example.com/posts.xml",
    ]);
  });
});
