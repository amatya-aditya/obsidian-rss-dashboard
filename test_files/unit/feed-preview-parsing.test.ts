import { describe, expect, it } from "vitest";
import { parseFeedPreviewFromXmlText } from "../../src/services/feed-parser";

describe("feed preview parsing", () => {
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
});

