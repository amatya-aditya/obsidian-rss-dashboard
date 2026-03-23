import { describe, expect, it } from "vitest";
import { MediaService } from "../../src/services/media-service";

describe("MediaService.normalizeNitterUrlToRss", () => {
  it("converts a Nitter profile URL to /rss", () => {
    expect(
      MediaService.normalizeNitterUrlToRss("https://nitter.net/alliekmiller"),
    ).toBe("https://nitter.net/alliekmiller/rss");
  });

  it("converts a trailing-slash profile URL to /rss", () => {
    expect(
      MediaService.normalizeNitterUrlToRss("https://nitter.net/alliekmiller/"),
    ).toBe("https://nitter.net/alliekmiller/rss");
  });

  it("keeps an existing /rss URL stable", () => {
    expect(
      MediaService.normalizeNitterUrlToRss("https://nitter.net/alliekmiller/rss"),
    ).toBe("https://nitter.net/alliekmiller/rss");
  });

  it("strips query/hash from Nitter URLs", () => {
    expect(
      MediaService.normalizeNitterUrlToRss(
        "https://nitter.net/alliekmiller?foo=bar#baz",
      ),
    ).toBe("https://nitter.net/alliekmiller/rss");
  });

  it("returns null for non-profile Nitter paths", () => {
    expect(
      MediaService.normalizeNitterUrlToRss("https://nitter.net/alliekmiller/status/1"),
    ).toBeNull();
  });

  it("returns null for non-nitter hosts", () => {
    expect(
      MediaService.normalizeNitterUrlToRss("https://example.com/alliekmiller"),
    ).toBeNull();
  });

  it("returns null for common non-user pages", () => {
    expect(MediaService.normalizeNitterUrlToRss("https://nitter.net/home")).toBeNull();
  });
});

