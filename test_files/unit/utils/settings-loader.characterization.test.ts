/**
 * Characterization tests for `src/utils/settings-loader.ts` (#1167).
 *
 * These pin the current observable behavior of `loadAndNormalizeSettings`,
 * `migrateSettings` and `dedupeAndNormalizeFeedItems` before the extraction in
 * #1167. They call the real collaborators (`./settings-migration`,
 * `./url-utils`, `./validation`, `../services/feed-parser/feed-retention`), so
 * the assertions describe what production loads rather than a mock. They stay
 * read-only during the extraction: a red result means the move changed
 * behavior.
 */
import { describe, expect, it } from "vitest";
import {
  dedupeAndNormalizeFeedItems,
  loadAndNormalizeSettings,
  migrateSettings,
} from "../../../src/utils/settings-loader";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import type { DeepPartial } from "../../../src/types/deep-partial";

function rawSettings(
  overrides: Record<string, unknown>,
): DeepPartial<RssDashboardSettings> {
  return overrides as unknown as DeepPartial<RssDashboardSettings>;
}

/** A fresh, mutable copy of the defaults with `overrides` applied on top. */
function mutableSettings(
  overrides: Record<string, unknown> = {},
): RssDashboardSettings & Record<string, unknown> {
  return Object.assign(structuredClone(DEFAULT_SETTINGS), overrides);
}

function feedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Item",
    link: "https://example.com/item",
    description: "",
    pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
    guid: "item-guid",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    content: "",
    ...overrides,
  };
}

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    title: "Feed",
    url: "https://example.com/feed.xml",
    folder: "Inbox",
    items: [],
    lastUpdated: 0,
    mediaType: "article",
    ...overrides,
  };
}

describe("loadAndNormalizeSettings", () => {
  it("infers legacy-json when feeds or refresh history exist and storageMode is unset", () => {
    expect(
      loadAndNormalizeSettings(rawSettings({ feeds: [feed()] })).storageMode,
    ).toBe("legacy-json");
    expect(
      loadAndNormalizeSettings(rawSettings({ lastRefreshTimestamp: 123 }))
        .storageMode,
    ).toBe("legacy-json");
    expect(loadAndNormalizeSettings(rawSettings({})).storageMode).toBe(
      "vault-shards-v2",
    );
  });

  it("keeps an explicitly stored storageMode even when feeds exist", () => {
    const result = loadAndNormalizeSettings(
      rawSettings({ storageMode: "vault-shards-v2", feeds: [feed()] }),
    );

    expect(result.storageMode).toBe("vault-shards-v2");
  });

  it("coerces refreshInterval through normalizeRefreshIntervalMinutes", () => {
    expect(
      loadAndNormalizeSettings(rawSettings({ refreshInterval: 12.9 }))
        .refreshInterval,
    ).toBe(12);
    expect(
      loadAndNormalizeSettings(rawSettings({ refreshInterval: -5 }))
        .refreshInterval,
    ).toBe(0);
    expect(
      loadAndNormalizeSettings(rawSettings({ refreshInterval: "nope" }))
        .refreshInterval,
    ).toBe(DEFAULT_SETTINGS.refreshInterval);
  });

  it("resets malformed scalar fields to their defaults and keeps valid ones", () => {
    const malformed = loadAndNormalizeSettings(
      rawSettings({
        lastGlobalRefreshCompletedAt: -1,
        startupRefreshDelaySeconds: -3,
        defaultAutoDeleteDuration: "x",
      }),
    );
    expect(malformed.lastGlobalRefreshCompletedAt).toBe(0);
    expect(malformed.startupRefreshDelaySeconds).toBe(5);
    expect(malformed.defaultAutoDeleteDuration).toBe(30);

    expect(
      loadAndNormalizeSettings(
        rawSettings({ lastGlobalRefreshCompletedAt: Number.NaN }),
      ).lastGlobalRefreshCompletedAt,
    ).toBe(0);

    const valid = loadAndNormalizeSettings(
      rawSettings({
        lastGlobalRefreshCompletedAt: 456,
        startupRefreshDelaySeconds: 2,
        defaultAutoDeleteDuration: 7,
      }),
    );
    expect(valid.lastGlobalRefreshCompletedAt).toBe(456);
    expect(valid.startupRefreshDelaySeconds).toBe(2);
    expect(valid.defaultAutoDeleteDuration).toBe(7);
  });

  it("defaults the four retention-protection booleans when they are not booleans", () => {
    const malformed = loadAndNormalizeSettings(
      rawSettings({
        protectStarred: "invalid",
        protectSaved: null,
        protectTagged: 123,
        protectUnread: undefined,
      }),
    );
    expect(malformed.protectStarred).toBe(true);
    expect(malformed.protectSaved).toBe(true);
    expect(malformed.protectTagged).toBe(false);
    expect(malformed.protectUnread).toBe(false);

    const valid = loadAndNormalizeSettings(
      rawSettings({
        protectStarred: false,
        protectSaved: false,
        protectTagged: true,
        protectUnread: true,
      }),
    );
    expect(valid.protectStarred).toBe(false);
    expect(valid.protectSaved).toBe(false);
    expect(valid.protectTagged).toBe(true);
    expect(valid.protectUnread).toBe(true);
  });

  it("fills an empty readerViewLocation and migrates external-browser to main", () => {
    expect(
      loadAndNormalizeSettings(rawSettings({ readerViewLocation: "" }))
        .readerViewLocation,
    ).toBe("right-sidebar");

    const legacy = loadAndNormalizeSettings(
      rawSettings({ readerViewLocation: "external-browser" }),
    );
    expect(legacy.readerViewLocation).toBe("main");
  });

  it("splits savedArticleOpenLocation into inherit-from-reader and explicit override", () => {
    // Not provided: inherit from readerViewLocation (external-browser already
    // converted to main above it).
    const inherit = loadAndNormalizeSettings(
      rawSettings({ readerViewLocation: "left-sidebar" }),
    );
    expect(inherit.savedArticleOpenLocation).toBe("left-sidebar");

    const inheritedFromMain = loadAndNormalizeSettings(
      rawSettings({ readerViewLocation: "external-browser" }),
    );
    expect(inheritedFromMain.savedArticleOpenLocation).toBe("main");

    // Provided: keep the explicit value, but migrate external-browser to main.
    const override = loadAndNormalizeSettings(
      rawSettings({ savedArticleOpenLocation: "left-sidebar" }),
    );
    expect(override.savedArticleOpenLocation).toBe("left-sidebar");

    const legacyOverride = loadAndNormalizeSettings(
      rawSettings({
        readerViewLocation: "right-sidebar",
        savedArticleOpenLocation: "external-browser",
      }),
    );
    expect(legacyOverride.savedArticleOpenLocation).toBe("main");
  });

  it("carries the legacy media Focus mode and autoTagVideos before default-filling", () => {
    expect(
      loadAndNormalizeSettings(
        rawSettings({ media: { hideYouTubeDescriptions: true } }),
      ).media.youtubeFocusMode,
    ).toBe(true);

    expect(
      loadAndNormalizeSettings(
        rawSettings({
          media: { youtubeFocusMode: false, hideYouTubeDescriptions: true },
        }),
      ).media.youtubeFocusMode,
    ).toBe(false);

    // #919: the legacy auto-tag flag is read during normalization, before the
    // default `defaultVideoTag` is filled in, so "off" survives as "".
    expect(
      loadAndNormalizeSettings(rawSettings({ media: { autoTagVideos: false } }))
        .media.defaultVideoTag,
    ).toBe("");
    expect(
      loadAndNormalizeSettings(rawSettings({ media: { autoTagVideos: true } }))
        .media.defaultVideoTag,
    ).toBe("Video");
  });

  it("re-fills partial nested groups and clamps the display cache values", () => {
    const result = loadAndNormalizeSettings(
      rawSettings({
        articleSaving: { addSavedTag: false },
        readerFormat: { fontScalePct: 120 },
        keywordRules: { bypassAll: true },
        autoBackup: { backupDataJson: true },
        display: {
          imageCacheLimitMiB: 0,
          imageCacheUnlimited: "yes",
          tagChipRadius: "bogus",
        },
        useWebViewer: false,
      }),
    );

    expect(result.articleSaving.addSavedTag).toBe(false);
    expect(result.articleSaving.defaultFolder).toBe("RSS articles/");
    expect(result.readerFormat.fontScalePct).toBe(120);
    expect(result.readerFormat.textAlign).toBe("justify");
    expect(result.keywordRules.bypassAll).toBe(true);
    expect(result.autoBackup.backupDataJson).toBe(true);
    expect(result.autoBackup.backupOpml).toBe(true);
    expect(result.display.imageCacheLimitMiB).toBe(100);
    expect(result.display.imageCacheUnlimited).toBe(false);
    expect(result.display.tagChipRadius).toBe("999px");
    expect(result.useWebViewer).toBe(false);
  });

  it("caps an oversized image cache limit and defaults invalid availableTags", () => {
    expect(
      loadAndNormalizeSettings(
        rawSettings({ display: { imageCacheLimitMiB: 2_048 } }),
      ).display.imageCacheLimitMiB,
    ).toBe(1_024);

    const result = loadAndNormalizeSettings(
      rawSettings({ availableTags: null as unknown as [] }),
    );
    expect(Array.isArray(result.availableTags)).toBe(true);
    expect(result.availableTags.map((tag) => tag.name.toLowerCase())).toContain(
      "video",
    );
  });

  it("defaults useWebViewer to true when it is undefined", () => {
    const result = loadAndNormalizeSettings(
      rawSettings({ useWebViewer: undefined }),
    );

    expect(result.useWebViewer).toBe(true);
  });

  it("normalizes each feed's items, keywordRules, limits and refresh timestamp", () => {
    const result = loadAndNormalizeSettings(
      rawSettings({
        maxItems: 75,
        defaultAutoDeleteDuration: 14,
        feeds: [
          feed({ title: "bare" }),
          feed({
            title: "configured",
            url: "https://example.com/2.xml",
            lastUpdated: 999,
            autoDeleteDuration: 3,
            maxItemsLimit: 5,
            lastRefreshAttemptCompletedAt: 42,
          }),
        ],
      }),
    );

    const [bare, configured] = result.feeds;
    expect(bare.items).toEqual([]);
    expect(bare.keywordRules).toEqual({
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [],
    });
    expect(bare.autoDeleteDuration).toBe(14);
    expect(bare.maxItemsLimit).toBe(75);
    expect(bare.lastRefreshAttemptCompletedAt).toBe(0);
    expect(configured.autoDeleteDuration).toBe(3);
    expect(configured.maxItemsLimit).toBe(5);
    expect(configured.lastRefreshAttemptCompletedAt).toBe(42);

    // A missing attempt timestamp is seeded from a successful parse.
    const seeded = loadAndNormalizeSettings(
      rawSettings({ feeds: [feed({ lastUpdated: 999 })] }),
    );
    expect(seeded.feeds[0].lastRefreshAttemptCompletedAt).toBe(999);
  });

  it("unifies all five page-size fields to allArticlesPageSize and defaults an invalid one", () => {
    const unified = loadAndNormalizeSettings(
      rawSettings({
        allArticlesPageSize: 20,
        unreadArticlesPageSize: 99,
        readArticlesPageSize: 50,
        savedArticlesPageSize: 10,
        starredArticlesPageSize: 30,
      }),
    );
    expect([
      unified.allArticlesPageSize,
      unified.unreadArticlesPageSize,
      unified.readArticlesPageSize,
      unified.savedArticlesPageSize,
      unified.starredArticlesPageSize,
    ]).toEqual([20, 20, 20, 20, 20]);

    const invalid = loadAndNormalizeSettings(
      rawSettings({ allArticlesPageSize: -1 }),
    );
    expect(invalid.allArticlesPageSize).toBe(50);
    expect(invalid.unreadArticlesPageSize).toBe(50);
  });

  it("normalizes the feed objects it was handed in place, without cloning them", () => {
    const raw = {
      feeds: [feed({ title: "aliased" })],
    } as Partial<RssDashboardSettings>;
    const result = loadAndNormalizeSettings(
      raw as DeepPartial<RssDashboardSettings>,
    );

    expect(result.feeds[0]).toBe(raw.feeds?.[0]);
    expect(raw.feeds?.[0].autoDeleteDuration).toBe(
      DEFAULT_SETTINGS.defaultAutoDeleteDuration,
    );
    expect(raw.feeds?.[0].items).toEqual([]);
  });
});

describe("migrateSettings", () => {
  it("reports no change for an object the defaults already satisfy", () => {
    const settings = mutableSettings();

    expect(migrateSettings(settings)).toBe(false);
    expect(migrateSettings(settings)).toBe(false);
  });

  it("drops a permanent storage-migration dismissal and reports the change", () => {
    const settings = mutableSettings({
      storageMigrationDismissedPermanently: true,
    });

    expect(migrateSettings(settings)).toBe(true);
    expect(settings.storageMigrationDismissedPermanently).toBeUndefined();
  });

  it("relocates savePath, template and addSavedTag into articleSaving", () => {
    const settings = mutableSettings({
      savePath: "/vault/Articles",
      template: "# {{title}}",
      addSavedTag: true,
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        addSavedTag: undefined,
      },
    });

    expect(migrateSettings(settings)).toBe(true);
    expect(settings.articleSaving.defaultFolder).toBe("/vault/Articles");
    expect(settings.articleSaving.defaultTemplate).toBe("# {{title}}");
    expect(settings.articleSaving.addSavedTag).toBe(true);
    expect(settings.savePath).toBeUndefined();
    expect(settings.template).toBeUndefined();
    expect(settings.addSavedTag).toBeUndefined();
  });

  it("relocates a nested articleSaving.template when defaultTemplate is empty", () => {
    const settings = mutableSettings({
      articleSaving: {
        ...DEFAULT_SETTINGS.articleSaving,
        defaultTemplate: "",
        template: "# nested",
      },
    });

    expect(migrateSettings(settings)).toBe(true);
    expect(settings.articleSaving.defaultTemplate).toBe("# nested");
    expect(
      (settings.articleSaving as unknown as Record<string, unknown>).template,
    ).toBeUndefined();
  });

  it("migrates display.useDomainFavicons to useDomainIconsRss", () => {
    const settings = mutableSettings({
      display: { ...DEFAULT_SETTINGS.display, useDomainFavicons: true },
    });

    expect(migrateSettings(settings)).toBe(true);
    expect(
      (settings.display as unknown as Record<string, unknown>)
        .useDomainIconsRss,
    ).toBe(true);
    expect(
      (settings.display as unknown as Record<string, unknown>)
        .useDomainFavicons,
    ).toBeUndefined();
  });

  it("re-clamps the image cache limit and repairs an unsupported tag radius", () => {
    const high = mutableSettings({
      display: {
        ...DEFAULT_SETTINGS.display,
        imageCacheLimitMiB: 2_048,
        tagChipRadius: "bogus",
      },
    });
    expect(migrateSettings(high)).toBe(true);
    expect(high.display.imageCacheLimitMiB).toBe(1_024);
    expect(high.display.tagChipRadius).toBe("999px");

    const low = mutableSettings({
      display: {
        ...DEFAULT_SETTINGS.display,
        imageCacheLimitMiB: 0,
        imageCacheUnlimited: "yes",
      },
    });
    expect(migrateSettings(low)).toBe(true);
    expect(low.display.imageCacheLimitMiB).toBe(100);
    expect(low.display.imageCacheUnlimited).toBe(false);
  });

  it("normalizes dashboardMultiFilters and defaults a missing group", () => {
    const settings = mutableSettings({
      dashboardMultiFilters: {
        statusFilters: ["unread", 7],
        tagFilters: ["tech", null],
        logic: "INVALID",
      },
    });
    migrateSettings(settings);
    expect(settings.dashboardMultiFilters).toEqual({
      statusFilters: ["unread"],
      tagFilters: ["tech"],
      logic: "OR",
    });

    const missing = mutableSettings({ dashboardMultiFilters: undefined });
    migrateSettings(missing);
    expect(missing.dashboardMultiFilters).toEqual(
      DEFAULT_SETTINGS.dashboardMultiFilters,
    );
  });

  it("folds a legacy display defaultFilter into empty dashboardMultiFilters only", () => {
    const folded = mutableSettings({
      display: { ...DEFAULT_SETTINGS.display, defaultFilter: "starred" },
      dashboardMultiFilters: { statusFilters: [], tagFilters: [], logic: "OR" },
    });
    migrateSettings(folded);
    expect(folded.dashboardMultiFilters.statusFilters).toEqual(["starred"]);

    const kept = mutableSettings({
      display: { ...DEFAULT_SETTINGS.display, defaultFilter: "starred" },
      dashboardMultiFilters: {
        statusFilters: ["unread"],
        tagFilters: [],
        logic: "OR",
      },
    });
    migrateSettings(kept);
    expect(kept.dashboardMultiFilters.statusFilters).toEqual(["unread"]);
  });

  it("re-fills keywordRules, per-feed keywordRules and autoBackup", () => {
    const settings = mutableSettings({
      keywordRules: undefined,
      autoBackup: undefined,
      feeds: [feed({ keywordRules: undefined })],
    });

    migrateSettings(settings);

    expect(settings.keywordRules).toEqual(DEFAULT_SETTINGS.keywordRules);
    expect(settings.autoBackup).toEqual(DEFAULT_SETTINGS.autoBackup);
    expect(settings.feeds[0].keywordRules).toEqual({
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [],
    });
  });

  it("drops the legacy media tag key the load path already read (#919)", () => {
    const loaded = loadAndNormalizeSettings(
      rawSettings({ media: { autoTagVideos: false } }),
    );
    expect(loaded.media.defaultVideoTag).toBe("");

    expect(migrateSettings(loaded)).toBe(true);
    expect(
      (loaded.media as unknown as Record<string, unknown>).autoTagVideos,
    ).toBeUndefined();
    expect(loaded.media.defaultVideoTag).toBe("");
  });
});

describe("dedupeAndNormalizeFeedItems", () => {
  it("merges duplicate identities, unions state, dedupes tags and keeps the longer text", () => {
    const feeds: Feed[] = [
      feed({
        items: [
          feedItem({
            guid: "https://example.com/a",
            link: "https://example.com/a",
            title: "Short",
            description: "d",
            content: "short",
            read: false,
            starred: true,
            saved: true,
            savedFilePath: "notes/a.md",
            coverImage: "cover-a",
            image: "img-a",
            tags: [{ name: "Tech", color: "#111111" }],
            pubDate: "2024-01-01T00:00:00Z",
          }),
          feedItem({
            guid: "https://example.com/a",
            link: "https://example.com/a",
            title: "A much longer title",
            description: "a longer description",
            content: "a much longer body",
            read: true,
            starred: false,
            saved: false,
            savedFilePath: "",
            coverImage: "cover-b",
            image: "img-b",
            summary: "A summary",
            tags: [
              { name: "tech", color: "#222222" },
              { name: "News", color: "#333333" },
            ],
            pubDate: "2024-01-02T00:00:00Z",
          }),
        ],
      }),
    ];

    expect(dedupeAndNormalizeFeedItems(feeds)).toBe(true);
    expect(feeds[0].items).toHaveLength(1);
    const merged = feeds[0].items[0];
    expect(merged.guid).toBe("https://example.com/a");
    expect(merged.read).toBe(true);
    expect(merged.starred).toBe(true);
    expect(merged.saved).toBe(true);
    expect(merged.title).toBe("A much longer title");
    expect(merged.description).toBe("a longer description");
    expect(merged.content).toBe("a much longer body");
    expect(merged.summary).toBe("A summary");
    expect(merged.savedFilePath).toBe("notes/a.md");
    expect(merged.coverImage).toBe("cover-a");
    expect(merged.image).toBe("img-a");
    expect(merged.tags?.map((tag) => tag.name)).toEqual(["Tech", "News"]);
  });

  it("re-keys a guid to its canonical form and reports the change without a duplicate", () => {
    const feeds: Feed[] = [
      feed({
        items: [
          feedItem({
            guid: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          }),
        ],
      }),
    ];

    expect(dedupeAndNormalizeFeedItems(feeds)).toBe(true);
    expect(feeds[0].items[0].guid).toBe("yt:video:dQw4w9WgXcQ");
  });

  it("collapses the three YouTube identity forms for one video", () => {
    const feeds: Feed[] = [
      feed({
        items: [
          feedItem({
            guid: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            starred: true,
            pubDate: "2024-03-02T00:00:00Z",
          }),
          feedItem({
            guid: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            read: true,
            pubDate: "2024-03-01T00:00:00Z",
          }),
          feedItem({
            guid: "yt:video:dQw4w9WgXcQ",
            link: "",
            pubDate: "2024-03-03T00:00:00Z",
          }),
        ],
      }),
    ];

    dedupeAndNormalizeFeedItems(feeds);

    expect(feeds[0].items).toHaveLength(1);
    expect(feeds[0].items[0].guid).toBe("yt:video:dQw4w9WgXcQ");
    expect(feeds[0].items[0].read).toBe(true);
    expect(feeds[0].items[0].starred).toBe(true);
  });

  it("groups by link when the guid is empty", () => {
    const feeds: Feed[] = [
      feed({
        items: [
          feedItem({
            guid: "",
            link: "https://example.com/only-link",
            title: "First",
          }),
          feedItem({
            guid: "",
            link: "https://example.com/only-link",
            title: "First and longer",
          }),
        ],
      }),
    ];

    expect(dedupeAndNormalizeFeedItems(feeds)).toBe(true);
    expect(feeds[0].items).toHaveLength(1);
    expect(feeds[0].items[0].guid).toBe("https://example.com/only-link");
    expect(feeds[0].items[0].title).toBe("First and longer");
  });

  it("keeps two identity-less items separate under their index keys", () => {
    const feeds: Feed[] = [
      feed({
        items: [
          feedItem({ guid: "", link: "", title: "No identity" }),
          feedItem({ guid: "", link: "", title: "No identity either" }),
        ],
      }),
    ];

    expect(dedupeAndNormalizeFeedItems(feeds)).toBe(false);
    expect(feeds[0].items).toHaveLength(2);
  });

  it("drops a nullish entry and reports the change", () => {
    const feeds: Feed[] = [
      feed({
        items: [
          feedItem({ guid: "a", link: "https://example.com/a" }),
          null,
          feedItem({ guid: "b", link: "https://example.com/b" }),
        ] as unknown as FeedItem[],
      }),
    ];

    expect(dedupeAndNormalizeFeedItems(feeds)).toBe(true);
    expect(feeds[0].items.map((item) => item.guid)).toEqual(["a", "b"]);
  });

  it("reports no change and still sorts newest-first for a clean feed", () => {
    const feeds: Feed[] = [
      feed({
        items: [
          feedItem({
            guid: "b",
            link: "https://example.com/b",
            pubDate: "2024-02-01T00:00:00Z",
          }),
          feedItem({
            guid: "a",
            link: "https://example.com/a",
            pubDate: "2024-01-01T00:00:00Z",
          }),
        ],
      }),
    ];

    expect(dedupeAndNormalizeFeedItems(feeds)).toBe(false);
    expect(feeds[0].items.map((item) => item.guid)).toEqual(["b", "a"]);
  });

  it("sorts undated items by firstSeenMs only when the fallback is on", () => {
    const build = (): Feed[] => [
      feed({
        items: [
          feedItem({
            guid: "undated",
            link: "https://example.com/undated",
            pubDate: "",
            firstSeenMs: Date.parse("2024-04-01T00:00:00Z"),
          }),
          feedItem({
            guid: "older",
            link: "https://example.com/older",
            pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
          }),
        ],
      }),
    ];

    const off = build();
    dedupeAndNormalizeFeedItems(off);
    expect(off[0].items.map((item) => item.guid)).toEqual(["older", "undated"]);

    const on = build();
    dedupeAndNormalizeFeedItems(on, { useFirstSeenDateFallback: true });
    expect(on[0].items.map((item) => item.guid)).toEqual(["undated", "older"]);
  });

  it("leaves an empty feed untouched", () => {
    const feeds: Feed[] = [feed({ items: [] })];

    expect(dedupeAndNormalizeFeedItems(feeds)).toBe(false);
    expect(feeds[0].items).toEqual([]);
  });
});
