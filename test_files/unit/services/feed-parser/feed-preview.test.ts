import { afterEach, describe, expect, it, vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";
import {
  loadFeedForPreview,
  parseFeedPreviewFromXmlText,
} from "../../../../src/services/feed-parser/feed-preview.js";
import { JSON_FEED_BASIC } from "./fixtures/rss-fixtures.js";

function mockRequestUrlResponse(text: string): RequestUrlResponse {
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    status: 200,
    headers: { "content-type": "application/feed+json" },
    arrayBuffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    json: {},
  };
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

    const parsed = parseFeedPreviewFromXmlText(xml, "https://example.com/rss.xml");
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("Example Feed");
    expect(parsed?.hasEntries).toBe(true);
    expect(parsed?.latestPubDate).toContain("2026");
  });

  it("returns null for empty xml text", () => {
    expect(parseFeedPreviewFromXmlText("", "https://example.com/feed.xml")).toBeNull();
  });

  it("loads title and latest entry from a JSON Feed", async () => {
    vi.spyOn(obsidian, "requestUrl").mockResolvedValueOnce(
      mockRequestUrlResponse(JSON_FEED_BASIC),
    );

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
  });
});
