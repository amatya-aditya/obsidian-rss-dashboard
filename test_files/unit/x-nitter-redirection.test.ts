import { describe, it, expect } from "vitest";
import { MediaService } from "../../src/services/media-service";

describe("MediaService - X to Nitter Redirection", () => {
  it("should detect X and Twitter URLs", () => {
    expect(MediaService.isXUrl("https://x.com/officiallogank")).toBe(true);
    expect(MediaService.isXUrl("https://twitter.com/officiallogank")).toBe(true);
    expect(MediaService.isXUrl("https://t.co/something")).toBe(true);
    expect(MediaService.isXUrl("https://google.com")).toBe(false);
  });

  it("should convert X/Twitter URLs to Nitter RSS feeds", () => {
    expect(MediaService.getNitterRssFeed("https://x.com/officiallogank")).toBe(
      "https://nitter.net/officiallogank/rss"
    );
    expect(MediaService.getNitterRssFeed("https://twitter.com/officiallogank")).toBe(
      "https://nitter.net/officiallogank/rss"
    );
  });

  it("should ignore common X/Twitter pages", () => {
    expect(MediaService.getNitterRssFeed("https://x.com/home")).toBe(null);
    expect(MediaService.getNitterRssFeed("https://twitter.com/explore")).toBe(null);
    expect(MediaService.getNitterRssFeed("https://x.com/settings")).toBe(null);
  });

  it("should handle URLs with query parameters or fragments", () => {
    expect(MediaService.getNitterRssFeed("https://x.com/officiallogank?s=20")).toBe(
      "https://nitter.net/officiallogank/rss"
    );
    expect(MediaService.getNitterRssFeed("https://twitter.com/officiallogank#main")).toBe(
      "https://nitter.net/officiallogank/rss"
    );
  });
});
