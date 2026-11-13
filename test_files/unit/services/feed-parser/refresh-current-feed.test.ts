import { afterEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { DEFAULT_SETTINGS, type Feed } from "../../../../src/types/types";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class";

describe("refresh against the current feed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not mutate the current feed if cancellation occurs while settings are loading", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const feed: Feed = {
      title: "Feed",
      url: feedUrl,
      folder: "",
      lastUpdated: 0,
      items: [],
    };
    const xml = `<rss version="2.0"><channel><title>Feed</title><item><guid>new</guid><title>New</title><link>https://example.com/new</link></item></channel></rss>`;
    vi.spyOn(obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      text: xml,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: null,
    });
    let release!: () => void;
    let notify!: () => void;
    const started = new Promise<void>((resolve) => {
      notify = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = new AbortController();
    const parser = new FeedParser(DEFAULT_SETTINGS.display, []);
    const refresh = parser.refreshFeed(feed, {
      signal: controller.signal,
      getCurrentFeed: async () => {
        notify();
        await gate;
        return feed;
      },
    });
    await started;
    controller.abort();
    release();
    await expect(refresh).rejects.toBeDefined();
    expect(feed.items).toEqual([]);
    expect(feed.lastUpdated).toBe(0);
  });

  it("carries a completed page outcome to a later item with the same URL", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const articleUrl = "https://example.com/article";
    const existing: Feed = {
      title: "Feed",
      url: feedUrl,
      folder: "",
      lastUpdated: 0,
      refreshEnrichment: true,
      items: [
        {
          guid: "https://example.com/one",
          title: "One",
          link: articleUrl,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl,
          coverImage: "",
          refreshEnrichment: {
            url: articleUrl,
            description: "Page preview",
            suppressDescription: true,
          },
        },
      ],
    };
    const xml = `<rss version="2.0"><channel><title>Feed</title><item><guid>https://example.com/one</guid><title>One</title><link>${articleUrl}</link></item><item><guid>https://example.com/two</guid><title>Two</title><link>${articleUrl}</link></item></channel></rss>`;
    vi.spyOn(obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      text: xml,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: null,
    });
    const parser = new FeedParser(DEFAULT_SETTINGS.display, []);
    const refreshed = await parser.refreshFeed(existing);
    expect(
      refreshed.items.find((item) => item.guid === "https://example.com/two")
        ?.refreshEnrichment,
    ).toEqual({
      url: articleUrl,
      description: "Page preview",
      suppressDescription: true,
    });
  });

  it("retains a preview saved while the RSS request was in flight", async () => {
    const feedUrl = "https://example.com/feed.xml";
    const articleUrl = "https://example.com/article";
    const original: Feed = {
      title: "Feed",
      url: feedUrl,
      folder: "",
      lastUpdated: 0,
      refreshEnrichment: true,
      items: [
        {
          guid: "one",
          title: "One",
          link: articleUrl,
          description: "",
          pubDate: "",
          feedTitle: "Feed",
          feedUrl,
          coverImage: "",
        },
      ],
    };
    let current = original;
    let release!: (response: obsidian.RequestUrlResponse) => void;
    const request = vi.spyOn(obsidian, "requestUrl").mockImplementation(() => {
      const pending = new Promise<obsidian.RequestUrlResponse>((resolve) => {
        release = resolve;
      });
      return Object.defineProperties(pending, {
        arrayBuffer: { get: () => pending.then((value) => value.arrayBuffer) },
        json: { get: () => pending.then((value) => value.json) },
        text: { get: () => pending.then((value) => value.text) },
      }) as obsidian.RequestUrlResponsePromise;
    });
    const parser = new FeedParser(DEFAULT_SETTINGS.display, []);
    const refresh = parser.refreshFeed(original, {
      getCurrentFeed: () => current,
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    current = structuredClone(original);
    current.items[0].refreshEnrichment = {
      url: articleUrl,
      description: "Saved page preview",
    };
    release({
      status: 200,
      text: `<rss version="2.0"><channel><title>Feed</title><item><guid>one</guid><title>One</title><link>${articleUrl}</link></item></channel></rss>`,
      headers: {},
      arrayBuffer: new ArrayBuffer(0),
      json: null,
    });
    const updated = await refresh;
    expect(updated.items[0]?.refreshEnrichment?.description).toBe(
      "Saved page preview",
    );
    expect(original.items[0]?.refreshEnrichment).toBeUndefined();
  });
});
