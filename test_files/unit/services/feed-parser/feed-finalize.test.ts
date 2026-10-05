import { describe, expect, it } from "vitest";
import type { Feed, FeedItem } from "../../../../src/types/types.js";
import {
  applyFallbackIcons,
  applyMediaDefaultFolder,
  buildRefreshDiagnostics,
  clearSharedLogoCoverImages,
  collectFeedLogoCandidates,
  firstFeedLogoUrl,
} from "../../../../src/services/feed-parser/feed-finalize.js";
import type { ParsedFeed } from "../../../../src/services/feed-parser/types.js";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "T",
    link: "https://example.com/a",
    description: "",
    pubDate: "",
    guid: "g",
    feedTitle: "F",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    ...overrides,
  };
}

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "F",
    url: "https://example.com/feed.xml",
    folder: "Uncategorized",
    items: [],
    lastUpdated: 0,
    ...overrides,
  };
}

function parsedFeed(overrides: Partial<ParsedFeed> = {}): ParsedFeed {
  return {
    title: "P",
    items: [],
    type: "rss",
    feedItunesImage: "",
    feedImageUrl: "",
    ...overrides,
  };
}

describe("feed-finalize", () => {
  describe("buildRefreshDiagnostics", () => {
    it("derives the removed count and reports the auto-delete days only when positive", () => {
      const base = {
        fetchedItemCount: 5,
        mergedItemCountBeforeRetention: 8,
        retainedItemCount: 6,
        skippedByRefreshCutoffCount: 1,
      };

      expect(buildRefreshDiagnostics({ ...base, autoDeleteDays: 30 })).toEqual({
        ...base,
        retentionRemovedCount: 2,
        autoDeleteDurationDays: 30,
      });
      expect(
        buildRefreshDiagnostics({ ...base, autoDeleteDays: 0 })
          .autoDeleteDurationDays,
      ).toBeUndefined();
    });

    it("never reports a negative removed count", () => {
      const result = buildRefreshDiagnostics({
        fetchedItemCount: 1,
        mergedItemCountBeforeRetention: 1,
        retainedItemCount: 3,
        skippedByRefreshCutoffCount: 0,
        autoDeleteDays: 0,
      });

      expect(result.retentionRemovedCount).toBe(0);
    });
  });

  describe("collectFeedLogoCandidates", () => {
    it("lists the itunes image, image url, image object and image string in that order, dropping empties", () => {
      expect(
        collectFeedLogoCandidates(
          parsedFeed({
            feedItunesImage: "https://a.test/1.png",
            feedImageUrl: "https://a.test/2.png",
            image: { url: "https://a.test/3.png" },
          }),
        ),
      ).toEqual([
        "https://a.test/1.png",
        "https://a.test/2.png",
        "https://a.test/3.png",
      ]);

      expect(
        collectFeedLogoCandidates(
          parsedFeed({
            image: "https://a.test/4.png" as unknown as { url: string },
          }),
        ),
      ).toEqual(["https://a.test/4.png"]);

      expect(collectFeedLogoCandidates(parsedFeed())).toEqual([]);
    });
  });

  describe("firstFeedLogoUrl", () => {
    it("is the first candidate or an empty string", () => {
      expect(firstFeedLogoUrl(["a", "b"])).toBe("a");
      expect(firstFeedLogoUrl([])).toBe("");
    });
  });

  describe("clearSharedLogoCoverImages", () => {
    const LOGO = "https://img.example.com/logo.png";

    it("clears a logo cover shared by at least two items and 80% of them", () => {
      const items = [
        item({ coverImage: LOGO }),
        item({ coverImage: LOGO }),
        item({ coverImage: LOGO }),
        item({ coverImage: LOGO }),
        item({ coverImage: "https://img.example.com/own.png" }),
      ];

      clearSharedLogoCoverImages(items, [LOGO]);

      expect(items.map((entry) => entry.coverImage)).toEqual([
        "",
        "",
        "",
        "",
        "https://img.example.com/own.png",
      ]);
    });

    it("keeps a logo cover below the threshold, one item's, a non-logo, and a podcast's", () => {
      const below = [
        item({ coverImage: LOGO }),
        item({ coverImage: LOGO }),
        item({ coverImage: "x" }),
        item({ coverImage: "y" }),
      ];
      clearSharedLogoCoverImages(below, [LOGO]);
      expect(below.filter((entry) => entry.coverImage === LOGO)).toHaveLength(
        2,
      );

      const single = [item({ coverImage: LOGO })];
      clearSharedLogoCoverImages(single, [LOGO]);
      expect(single[0]?.coverImage).toBe(LOGO);

      const notLogo = [item({ coverImage: "z" }), item({ coverImage: "z" })];
      clearSharedLogoCoverImages(notLogo, [LOGO]);
      expect(notLogo.map((entry) => entry.coverImage)).toEqual(["z", "z"]);

      const podcasts = [
        item({ coverImage: LOGO, mediaType: "podcast" }),
        item({ coverImage: LOGO, mediaType: "podcast" }),
      ];
      clearSharedLogoCoverImages(podcasts, [LOGO]);
      expect(podcasts.map((entry) => entry.coverImage)).toEqual([LOGO, LOGO]);
    });

    it("matches any candidate, not only the first", () => {
      const items = [item({ coverImage: LOGO }), item({ coverImage: LOGO })];

      clearSharedLogoCoverImages(items, [
        "https://img.example.com/first.png",
        LOGO,
      ]);

      expect(items.map((entry) => entry.coverImage)).toEqual(["", ""]);
    });
  });

  describe("applyMediaDefaultFolder", () => {
    const media = {
      defaultYouTubeFolder: "Videos",
      defaultPodcastFolder: "Podcasts",
    };

    it("files a video or podcast feed of an unchosen folder under its default", () => {
      for (const existing of [null, feed({ folder: "Uncategorized" })]) {
        const video = feed({ mediaType: "video" });
        applyMediaDefaultFolder(video, existing, media);
        expect(video.folder).toBe("Videos");

        const podcast = feed({ mediaType: "podcast" });
        applyMediaDefaultFolder(podcast, existing, media);
        expect(podcast.folder).toBe("Podcasts");
      }
    });

    it("treats a stored feed with no folder field as unchosen", () => {
      const stored = feed();
      (stored as unknown as { folder: string | undefined }).folder = undefined;
      const podcast = feed({ mediaType: "podcast" });

      applyMediaDefaultFolder(podcast, stored, media);

      expect(podcast.folder).toBe("Podcasts");
    });

    it("leaves a chosen folder, including an explicit Root, and article feeds alone", () => {
      for (const folder of ["News", ""]) {
        const podcast = feed({ mediaType: "podcast", folder });
        applyMediaDefaultFolder(podcast, feed({ folder }), media);
        expect(podcast.folder).toBe(folder);
      }

      const article = feed({ mediaType: "article" });
      applyMediaDefaultFolder(article, null, media);
      expect(article.folder).toBe("Uncategorized");
    });
  });

  describe("applyFallbackIcons", () => {
    const toAbsolute = (relative: string, base: string): string =>
      new URL(relative, base).href;

    it("gives every item the absolute logo with a trailing slash after the extension removed", () => {
      const target = feed({ items: [item(), item()] });

      applyFallbackIcons(
        target,
        "/img/logo.png/",
        "https://example.com/feed.xml",
        toAbsolute,
      );

      expect(target.items.map((entry) => entry.fallbackIconUrl)).toEqual([
        "https://example.com/img/logo.png",
        "https://example.com/img/logo.png",
      ]);
    });

    it("leaves items untouched when there is no logo", () => {
      const target = feed({
        items: [item({ fallbackIconUrl: "https://example.com/old.png" })],
      });

      applyFallbackIcons(
        target,
        "",
        "https://example.com/feed.xml",
        toAbsolute,
      );

      expect(target.items[0]?.fallbackIconUrl).toBe(
        "https://example.com/old.png",
      );
    });
  });
});
