import { describe, it, expect } from "vitest";
import { isValidFeed } from "../../../../src/services/feed-parser/feed-validation.js";
import { RSS2_BASIC, ATOM_BASIC, JSON_FEED_BASIC } from "./fixtures/rss-fixtures.js";

describe("isValidFeed", () => {
  it("identifies RSS feeds", () => {
    expect(isValidFeed(RSS2_BASIC)).toBe(true);
  });

  it("identifies Atom feeds", () => {
    expect(isValidFeed(ATOM_BASIC)).toBe(true);
  });

  it("rejects HTML content", () => {
    expect(isValidFeed("<html><body>Not a feed</body></html>")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidFeed("")).toBe(false);
  });

  it("rejects JSON content", () => {
    expect(isValidFeed(JSON_FEED_BASIC)).toBe(false);
  });
});
