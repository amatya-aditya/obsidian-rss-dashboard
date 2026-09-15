import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import { fetchFeedXml } from "../../../../src/services/feed-parser/feed-fetch.js";
import { RSS2_BASIC } from "./fixtures/rss-fixtures.js";

function mockRequestUrlResponse(text: string): RequestUrlResponse {
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    status: 200,
    headers: {},
    arrayBuffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    json: {},
  };
}

function mockWindows1251Response(declaration: boolean): RequestUrlResponse {
  const prefix = declaration
    ? '<?xml version="1.0" encoding="windows-1251"?><rss><channel><title>'
    : "<rss><channel><title>";
  const suffix = "</title></channel></rss>";
  const prefixBytes = new TextEncoder().encode(prefix);
  const suffixBytes = new TextEncoder().encode(suffix);
  const titleBytes = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
  const bytes = new Uint8Array(
    prefixBytes.length + titleBytes.length + suffixBytes.length,
  );
  bytes.set(prefixBytes);
  bytes.set(titleBytes, prefixBytes.length);
  bytes.set(suffixBytes, prefixBytes.length + titleBytes.length);
  return {
    text: "",
    status: 200,
    headers: { "content-type": "application/rss+xml" },
    arrayBuffer: bytes.buffer,
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

  it("decodes a declared windows-1251 feed from raw response bytes", async () => {
    vi.spyOn(obsidian, "requestUrl").mockResolvedValueOnce(
      mockWindows1251Response(true),
    );

    const xml = await fetchFeedXml("https://example.com/cp1251.xml");
    expect(xml).toContain("Привет");
  });

  it("applies a manual windows-1251 override to an undeclared feed", async () => {
    vi.spyOn(obsidian, "requestUrl").mockResolvedValueOnce(
      mockWindows1251Response(false),
    );

    const xml = await fetchFeedXml(
      "https://example.com/cp1251.xml",
      { enabled: false, url: "" },
      undefined,
      "windows-1251",
    );
    expect(xml).toContain("Привет");
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

  it("applies the manual encoding to a raw custom proxy response", async () => {
    vi.spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("direct fetch failed"))
      .mockResolvedValueOnce(mockWindows1251Response(false));

    const xml = await fetchFeedXml(
      "https://example.com/feed.xml",
      { enabled: true, url: "https://my-proxy.com/?url=" },
      undefined,
      "windows-1251",
    );

    expect(xml).toContain("Привет");
  });

  it("does not apply the feed override to an RSS2JSON envelope", async () => {
    vi.spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("direct fetch failed"))
      .mockResolvedValueOnce(
        mockRequestUrlResponse(
          JSON.stringify({
            status: "ok",
            feed: { title: "Привет", link: "https://example.com" },
            items: [{ title: "Item", link: "https://example.com/1" }],
          }),
        ),
      );

    const xml = await fetchFeedXml(
      "https://example.com/feed.xml",
      { enabled: true, url: "https://api.rss2json.com/v1/api.json?rss_url=" },
      undefined,
      "windows-1251",
    );

    expect(xml).toContain("Привет");
  });

  it("omits the channel language when the RSS2JSON feed reports none", async () => {
    vi.spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("direct fetch failed"))
      .mockResolvedValueOnce(
        mockRequestUrlResponse(
          JSON.stringify({
            status: "ok",
            feed: { title: "Sans langue", link: "https://example.com" },
            items: [{ title: "Item", link: "https://example.com/1" }],
          }),
        ),
      );

    const xml = await fetchFeedXml("https://example.com/feed.xml", {
      enabled: true,
      url: "https://api.rss2json.com/v1/api.json?rss_url=",
    });

    expect(xml).not.toContain("<language>");
  });

  it("preserves the channel language the RSS2JSON feed reports", async () => {
    vi.spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("direct fetch failed"))
      .mockResolvedValueOnce(
        mockRequestUrlResponse(
          JSON.stringify({
            status: "ok",
            feed: {
              title: "Blogue",
              link: "https://example.com",
              language: "fr",
            },
            items: [],
          }),
        ),
      );

    const xml = await fetchFeedXml("https://example.com/feed.xml", {
      enabled: true,
      url: "https://api.rss2json.com/v1/api.json?rss_url=",
    });

    expect(xml).toContain("<language>fr</language>");
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

describe("fetchFeedXml - RSS2JSON XML escaping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // The RSS2JSON fallback rebuilds an RSS document from proxy JSON. Every value
  // in that JSON is authored by whoever controls the subscribed feed, so these
  // tests drive the real fallback path: the direct fetch fails, then the
  // RSS2JSON proxy answers with the crafted envelope.
  async function fetchRebuiltRss(payload: unknown): Promise<string> {
    vi.spyOn(obsidian, "requestUrl")
      .mockRejectedValueOnce(new Error("direct fetch failed"))
      .mockResolvedValueOnce(
        mockRequestUrlResponse(JSON.stringify(payload)),
      );

    return fetchFeedXml("https://example.com/feed.xml", {
      enabled: true,
      url: "https://api.rss2json.com/v1/api.json?rss_url=",
    });
  }

  function parseXml(xml: string): Document {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
    return doc;
  }

  it("produces a parseable document when the feed title contains reserved XML characters", async () => {
    const title = 'Tips & Tricks <news> "daily"';

    const xml = await fetchRebuiltRss({
      status: "ok",
      feed: {
        title,
        description: "Bits & pieces",
        link: "https://example.com/?a=1&b=2",
      },
      items: [{ title: "Item & more", link: "https://example.com/1?x=1&y=2" }],
    });

    const doc = parseXml(xml);
    expect(doc.querySelector("channel > title")?.textContent).toBe(title);
    expect(doc.querySelector("channel > description")?.textContent).toBe(
      "Bits & pieces",
    );
    expect(doc.querySelector("channel > link")?.textContent).toBe(
      "https://example.com/?a=1&b=2",
    );
    expect(doc.querySelector("item > title")?.textContent).toBe("Item & more");
    expect(doc.querySelector("item > link")?.textContent).toBe(
      "https://example.com/1?x=1&y=2",
    );
  });

  it("keeps a feed title that mimics markup as text instead of injecting elements", async () => {
    // A title crafted to close <title> early and append an extra <item> plus a
    // publisher-controlled <language> declaration the parser would trust.
    const title =
      "</title><language>zz</language><item><title>Injected article</title>" +
      "<link>https://attacker.example/</link></item><title>";

    const xml = await fetchRebuiltRss({
      status: "ok",
      feed: { title, link: "https://example.com" },
      items: [{ title: "Real article", link: "https://example.com/1" }],
    });

    // The crafted markup survives only as escaped text in the serialized XML.
    expect(xml).toContain("&lt;item&gt;");
    expect(xml).not.toContain("<link>https://attacker.example/</link>");

    const doc = parseXml(xml);
    expect(doc.querySelector("channel > title")?.textContent).toBe(title);

    const items = doc.querySelectorAll("item");
    expect(items).toHaveLength(1);
    expect(items[0].querySelector("title")?.textContent).toBe("Real article");
    expect(items[0].querySelector("link")?.textContent).toBe(
      "https://example.com/1",
    );

    // #277 removed the fabricated "en" default, so a feed declaring no
    // language must produce no <language> element at all - least of all the
    // one smuggled in through the title.
    expect(doc.querySelectorAll("channel > language")).toHaveLength(0);
  });

  it("keeps an item description from escaping its CDATA section", async () => {
    // CDATA has no escape mechanism, so a literal "]]>" in the description is
    // the item-level equivalent of closing an element early.
    const description =
      "Legit body]]><item><title>Injected article</title>" +
      "<link>https://attacker.example/</link></item><![CDATA[";

    const xml = await fetchRebuiltRss({
      status: "ok",
      feed: { title: "Escaping feed", link: "https://example.com" },
      items: [
        { title: "Real article", link: "https://example.com/1", description },
      ],
    });

    const doc = parseXml(xml);
    const items = doc.querySelectorAll("item");
    expect(items).toHaveLength(1);
    expect(items[0].querySelector("description")?.textContent).toBe(
      description,
    );
    expect(doc.querySelector("channel > title")?.textContent).toBe(
      "Escaping feed",
    );
  });

  it("escapes the channel image url and reuses the escaped channel title", async () => {
    const title = "Photos & <b>more</b>";
    const image = "https://cdn.example.com/logo.png?w=1&h=2";

    const xml = await fetchRebuiltRss({
      status: "ok",
      feed: { title, link: "https://example.com", image },
      items: [{ title: "Real article", link: "https://example.com/1" }],
    });

    const doc = parseXml(xml);
    expect(doc.querySelector("image > url")?.textContent).toBe(image);
    expect(doc.querySelector("image > title")?.textContent).toBe(title);
  });
});
