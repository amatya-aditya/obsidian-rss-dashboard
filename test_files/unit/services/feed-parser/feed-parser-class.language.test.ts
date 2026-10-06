// The feed's declared language lands on the stored Feed (#247 slice 7, #246).
import { afterEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import type { RequestUrlResponse } from "obsidian";
import { DEFAULT_SETTINGS, type Feed } from "../../../../src/types/types.js";
import { FeedParser } from "../../../../src/services/feed-parser/feed-parser-class.js";

const FEED_URL = "https://example.com/feed.xml";

function rss(language: string): string {
  return `<?xml version="1.0"?>
<rss version="2.0"><channel><title>T</title><link>https://example.com</link>${language}
<item><title>A</title><link>https://example.com/a</link><guid>a</guid>
<pubDate>Sun, 14 Jun 2026 00:00:00 GMT</pubDate><description>x</description></item>
</channel></rss>`;
}

async function parse(body: string, existing: Feed | null = null) {
  const response: RequestUrlResponse = {
    status: 200,
    text: body,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    json: null,
  };
  vi.spyOn(obsidian, "requestUrl").mockResolvedValue(response);
  const parser = new FeedParser(DEFAULT_SETTINGS.display, []);
  return parser.parseFeed(FEED_URL, existing);
}

describe("FeedParser.parseFeed feed language", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores the language the feed declares", async () => {
    const feed = await parse(rss("<language>de-DE</language>"));
    expect(feed.language).toBe("de-DE");
  });

  it("leaves the language unset when the feed declares none", async () => {
    const feed = await parse(rss(""));
    expect(feed.language).toBeUndefined();
  });

  it("updates the stored language when the feed changes it", async () => {
    const existing: Feed = {
      title: "T",
      url: FEED_URL,
      folder: "Uncategorized",
      items: [],
      lastUpdated: 1,
      language: "en",
    };
    const feed = await parse(rss("<language>fr</language>"), existing);
    expect(feed.language).toBe("fr");
  });

  it("keeps the stored language when a refresh finds none declared", async () => {
    const existing: Feed = {
      title: "T",
      url: FEED_URL,
      folder: "Uncategorized",
      items: [],
      lastUpdated: 1,
      language: "en",
    };
    const feed = await parse(rss(""), existing);
    expect(feed.language).toBe("en");
  });
});
