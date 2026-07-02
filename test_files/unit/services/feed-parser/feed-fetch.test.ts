import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import { fetchFeedXml } from "../../../../src/services/feed-parser/feed-fetch.js";
import { RSS2_BASIC } from "./fixtures/rss-fixtures.js";

function mockRequestUrlResponse(text: string): RequestUrlResponse {
  return {
    text,
    status: 200,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: {},
  };
}

describe("fetchFeedXml", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns valid feed text on direct fetch", async () => {
    vi.spyOn(obsidian, "requestUrl").mockResolvedValueOnce(
      mockRequestUrlResponse(RSS2_BASIC),
    );

    const xml = await fetchFeedXml("https://example.com/feed.xml");
    expect(xml).toContain("<rss");
  });

  it("throws on Android when direct fetch fails without proxy chain", async () => {
    vi.spyOn(obsidian.Platform, "isAndroidApp", "get").mockReturnValue(true);
    vi.spyOn(obsidian, "requestUrl").mockRejectedValue(
      new Error("network error"),
    );

    await expect(
      fetchFeedXml("https://example.com/feed.xml"),
    ).rejects.toThrow();
  });

  it("does not use proxies if proxyConfig.enabled is false", async () => {
    vi.spyOn(obsidian, "requestUrl").mockRejectedValueOnce(
      new Error("direct fetch failed"),
    );

    await expect(
      fetchFeedXml("https://example.com/feed.xml", { enabled: false, url: "" }),
    ).rejects.toThrow("direct fetch failed");

    // requestUrl should only be called once (for the direct fetch)
    expect(obsidian.requestUrl).toHaveBeenCalledTimes(1);
  });

  it("uses a specific proxy if proxyConfig.url is a specific URL", async () => {
    // 1st call: direct fetch fails
    vi.spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("direct fetch failed"))
      // 2nd call: proxy succeeds
      .mockResolvedValueOnce(mockRequestUrlResponse(RSS2_BASIC));

    const xml = await fetchFeedXml("https://example.com/feed.xml", {
      enabled: true,
      url: "https://my-proxy.com/?url=",
    });

    expect(xml).toContain("<rss");
    expect(obsidian.requestUrl).toHaveBeenCalledTimes(2);
    expect(obsidian.requestUrl).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: "https://my-proxy.com/?url=https%3A%2F%2Fexample.com%2Ffeed.xml",
      }),
    );
  });

  it("cycles through PREDEFINED_PROXIES if proxyConfig.url is 'auto'", async () => {
    // 1st call: direct fetch fails
    vi.spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("direct fetch failed"))
      // 2nd call: 1st proxy fails
      .mockRejectedValueOnce(new Error("proxy 1 failed"))
      // 3rd call: 2nd proxy fails
      .mockRejectedValueOnce(new Error("proxy 2 failed"))
      // 4th call: 3rd proxy succeeds
      .mockResolvedValueOnce(mockRequestUrlResponse(RSS2_BASIC));

    const xml = await fetchFeedXml("https://example.com/feed.xml", {
      enabled: true,
      url: "auto",
    });

    expect(xml).toContain("<rss");
    // Direct + 3 proxy attempts
    expect(obsidian.requestUrl).toHaveBeenCalledTimes(4);
  });

  it("falls back to RSS2JSON correctly during auto cycling", async () => {
    // 1st call: direct fetch fails, then 5 more proxy failures (total 6 failures)
    // 7th call: RSS2JSON succeeds
    vi.spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("fail")) // call 1
      .mockRejectedValueOnce(new Error("fail")) // call 2
      .mockRejectedValueOnce(new Error("fail")) // call 3
      .mockRejectedValueOnce(new Error("fail")) // call 4
      .mockRejectedValueOnce(new Error("fail")) // call 5
      .mockRejectedValueOnce(new Error("fail")) // call 6
      .mockResolvedValueOnce(
        mockRequestUrlResponse(
          JSON.stringify({
            status: "ok",
            feed: { title: "JSON Feed", link: "https://example.com" },
            items: [{ title: "Item 1", link: "https://example.com/1" }],
          }),
        ),
      ); // call 7

    const xml = await fetchFeedXml("https://example.com/feed.xml", {
      enabled: true,
      url: "auto",
    });

    expect(xml).toContain("<rss");
    expect(xml).toContain("JSON Feed");
    expect(xml).toContain("Item 1");
    // Direct + 6 proxies (last being RSS2JSON)
    expect(obsidian.requestUrl).toHaveBeenCalledTimes(7);
  });
});
