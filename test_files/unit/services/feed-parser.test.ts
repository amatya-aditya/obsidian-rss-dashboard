import { describe, it, expect } from "vitest";
import { isValidFeed, FeedParser, CustomXMLParser } from "../../../src/services/feed-parser";
import { RSS2_BASIC } from "./feed-parser/fixtures/rss-fixtures.js";

describe("feed-parser barrel re-exports", () => {
  it("re-exports isValidFeed", () => {
    expect(isValidFeed(RSS2_BASIC)).toBe(true);
  });

  it("re-exports CustomXMLParser", () => {
    const parser = new CustomXMLParser();
    expect(parser.parseString(RSS2_BASIC).title).toBe("Test Feed");
  });

  it("re-exports FeedParser", () => {
    expect(FeedParser).toBeDefined();
  });
});
