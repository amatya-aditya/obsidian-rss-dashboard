import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as Obsidian from "obsidian";
import { MastodonService } from "../../../src/services/mastodon-service";

describe("MastodonService", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isMastodonProfileUrl", () => {
    it("detects @username profile URLs", () => {
      expect(
        MastodonService.isMastodonProfileUrl(
          "https://mastodon.social/@Gargron",
        ),
      ).toBe(true);
    });

    it("detects /users/username profile URLs", () => {
      expect(
        MastodonService.isMastodonProfileUrl(
          "https://example.social/users/gargron",
        ),
      ).toBe(true);
    });

    it("rejects status URLs", () => {
      expect(
        MastodonService.isMastodonProfileUrl(
          "https://mastodon.social/@Gargron/114438053345377351",
        ),
      ).toBe(false);
    });

    it("rejects non-profile URLs", () => {
      expect(
        MastodonService.isMastodonProfileUrl(
          "https://mastodon.social/tags/technology",
        ),
      ).toBe(false);
    });

    it("rejects .rss feed URLs as profile URLs", () => {
      expect(
        MastodonService.isMastodonProfileUrl(
          "https://mastodon.social/@zackwhittaker.rss",
        ),
      ).toBe(false);
    });

    it("rejects /users/username.rss feed URLs as profile URLs", () => {
      expect(
        MastodonService.isMastodonProfileUrl(
          "https://example.social/users/gargron.rss",
        ),
      ).toBe(false);
    });
  });

  describe("resolveProfileFeed", () => {
    it("extracts an absolute RSS URL from profile auto-discovery", async () => {
      vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
        status: 200,
        text: `
          <html>
            <head>
              <link rel="alternate" type="application/rss+xml" title="RSS" href="https://mastodon.social/@Gargron.rss">
            </head>
          </html>
        `,
      });

      await expect(
        MastodonService.resolveProfileFeed("https://mastodon.social/@Gargron"),
      ).resolves.toBe("https://mastodon.social/@Gargron.rss");
    });

    it("resolves a relative RSS URL against the profile page", async () => {
      vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
        status: 200,
        text: `
          <html>
            <head>
              <link href="/users/gargron.rss" rel="alternate" type="application/rss+xml">
            </head>
          </html>
        `,
      });

      await expect(
        MastodonService.resolveProfileFeed("https://example.social/users/gargron"),
      ).resolves.toBe("https://example.social/users/gargron.rss");
    });

    it("returns null when the page does not advertise an RSS feed", async () => {
      vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
        status: 200,
        text: "<html><head></head><body>No feed</body></html>",
      });

      await expect(
        MastodonService.resolveProfileFeed("https://mastodon.social/@Gargron"),
      ).resolves.toBeNull();
    });

    it("returns null when the network request fails", async () => {
      vi.spyOn(Obsidian, "requestUrl").mockRejectedValue(
        new Error("Network error"),
      );

      await expect(
        MastodonService.resolveProfileFeed("https://mastodon.social/@Gargron"),
      ).resolves.toBeNull();
    });
  });

  describe("isResolvedFeedUrl", () => {
    it("detects @username RSS URLs", () => {
      expect(
        MastodonService.isResolvedFeedUrl("https://mastodon.social/@Gargron.rss"),
      ).toBe(true);
    });

    it("detects /users/username.rss URLs", () => {
      expect(
        MastodonService.isResolvedFeedUrl(
          "https://example.social/users/gargron.rss",
        ),
      ).toBe(true);
    });

    it("rejects non-Mastodon RSS URLs", () => {
      expect(
        MastodonService.isResolvedFeedUrl("https://example.com/feed.xml"),
      ).toBe(false);
    });
  });
});
