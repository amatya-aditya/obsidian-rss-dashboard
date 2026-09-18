import { describe, it, expect } from "vitest";
import type { Feed, FeedItem } from "../../../../src/types/types";
import {
  mergeFeedHistoryItems,
  applyFeedRetentionLimits,
  isProtectedItem,
  getEffectiveDateMs,
  getPubDateMs,
  normalizeRfc822Zone,
  resolveDisplayDate,
  compareGuidOrdinal,
} from "../../../../src/services/feed-parser/feed-retention.js";

describe("compareGuidOrdinal", () => {
  it("orders strings by plain UTF-16 code-unit comparison", () => {
    expect(compareGuidOrdinal("a", "b")).toBeLessThan(0);
    expect(compareGuidOrdinal("b", "a")).toBeGreaterThan(0);
    expect(compareGuidOrdinal("a", "a")).toBe(0);
  });

  it("does not depend on Intl/locale-sensitive collation", () => {
    // Under locale-aware collation (e.g. Swedish/German), "z" < "ä" is a
    // classic example of ordering that flips relative to plain code-unit
    // comparison. The ordinal comparator must ignore that entirely.
    expect(compareGuidOrdinal("z", "ä")).toBeLessThan(0);
    expect(compareGuidOrdinal("ä", "z")).toBeGreaterThan(0);
  });
});

describe("isProtectedItem", () => {
  const makeItem = (overrides?: Partial<FeedItem>): FeedItem => ({
    title: "Test",
    link: "https://example.com/item",
    description: "",
    pubDate: "2024-01-01T00:00:00Z",
    guid: "test-item",
    read: true,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    saved: false,
    ...overrides,
  });

  it("evaluates default protections (starred and saved protected, tagged and unread not protected)", () => {
    expect(isProtectedItem(makeItem({ starred: true }))).toBe(true);
    expect(isProtectedItem(makeItem({ saved: true }))).toBe(true);
    expect(isProtectedItem(makeItem({ tags: ["tag1"] }))).toBe(false);
    expect(isProtectedItem(makeItem({ read: false }))).toBe(false);
    expect(isProtectedItem(makeItem())).toBe(false);
  });

  it("respects protectStarred toggle", () => {
    const item = makeItem({ starred: true });
    expect(isProtectedItem(item, { protectStarred: true })).toBe(true);
    expect(isProtectedItem(item, { protectStarred: false })).toBe(false);
  });

  it("respects protectSaved toggle", () => {
    const item = makeItem({ saved: true });
    expect(isProtectedItem(item, { protectSaved: true })).toBe(true);
    expect(isProtectedItem(item, { protectSaved: false })).toBe(false);
  });

  it("respects protectTagged toggle", () => {
    const tagged = makeItem({ tags: ["focus"] });
    const emptyTags = makeItem({ tags: [] });
    const noTags = makeItem({ tags: undefined });

    expect(isProtectedItem(tagged, { protectTagged: true })).toBe(true);
    expect(isProtectedItem(emptyTags, { protectTagged: true })).toBe(false);
    expect(isProtectedItem(noTags, { protectTagged: true })).toBe(false);
    expect(isProtectedItem(tagged, { protectTagged: false })).toBe(false);
  });

  it("respects protectUnread toggle", () => {
    const unread = makeItem({ read: false });
    const read = makeItem({ read: true });

    expect(isProtectedItem(unread, { protectUnread: true })).toBe(true);
    expect(isProtectedItem(read, { protectUnread: true })).toBe(false);
    expect(isProtectedItem(unread, { protectUnread: false })).toBe(false);
  });
});

describe("mergeFeedHistoryItems", () => {
  const makeItem = (
    guid: string,
    pubDate: string,
    overrides?: Partial<FeedItem>,
  ): FeedItem => ({
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate,
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    saved: false,
    ...overrides,
  });

  it("preserves existing history items outside the server's latest-N window", () => {
    const existingItems: FeedItem[] = Array.from({ length: 60 }, (_, i) => {
      const n = i + 1;
      const pubDate = new Date(Date.UTC(2024, 0, n)).toISOString();
      return makeItem(`id-${n}`, pubDate);
    });

    const refreshedItems: FeedItem[] = Array.from({ length: 25 }, (_, i) => {
      const n = 36 + i;
      const pubDate = new Date(Date.UTC(2024, 0, n)).toISOString();
      return makeItem(`id-${n}`, pubDate, { title: `updated-${n}` });
    });

    const merged = mergeFeedHistoryItems(existingItems, refreshedItems);
    expect(merged).toHaveLength(60);
    expect(new Set(merged.map((i) => i.guid)).size).toBe(60);
    expect(merged.some((i) => i.guid === "id-1")).toBe(true);
    expect(merged.some((i) => i.guid === "id-60")).toBe(true);
  });

  it("stamps firstSeenMs once for a newly observed item, dated or not", () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const dated = makeItem("dated", "2024-01-01T00:00:00Z");
    const undated = makeItem("undated", "");

    const merged = mergeFeedHistoryItems([], [dated, undated], { nowMs });

    expect(merged.find((i) => i.guid === "dated")?.firstSeenMs).toBe(nowMs);
    expect(merged.find((i) => i.guid === "undated")?.firstSeenMs).toBe(nowMs);
  });

  it("never regenerates firstSeenMs for an item that already has one", () => {
    const originalFirstSeenMs = Date.UTC(2025, 5, 1);
    const existingItems: FeedItem[] = [
      makeItem("id-1", "", { firstSeenMs: originalFirstSeenMs }),
    ];
    const refreshedItems: FeedItem[] = [
      makeItem("id-1", "", { title: "updated title" }),
    ];

    const merged = mergeFeedHistoryItems(existingItems, refreshedItems, {
      nowMs: Date.UTC(2026, 0, 1),
    });

    expect(merged).toHaveLength(1);
    expect(merged[0].firstSeenMs).toBe(originalFirstSeenMs);
  });

  it("lazily backfills firstSeenMs for a pre-existing undated item that predates this field", () => {
    const nowMs = Date.UTC(2026, 0, 1);
    // Simulates an item written before firstSeenMs existed: falls out of the
    // server's latest-N window (not in refreshedItems), so it is carried
    // forward rather than replaced.
    const existingItems: FeedItem[] = [makeItem("legacy-undated", "")];

    const merged = mergeFeedHistoryItems(existingItems, [], { nowMs });

    expect(merged).toHaveLength(1);
    expect(merged[0].firstSeenMs).toBe(nowMs);
  });
});

describe("getPubDateMs RFC822 named-zone handling", () => {
  it("rewrites obsolete US zone abbreviations to explicit offsets", () => {
    expect(normalizeRfc822Zone("Fri, 06 May 1983 09:00:00 CST")).toBe(
      "Fri, 06 May 1983 09:00:00 -0600",
    );
    expect(normalizeRfc822Zone("Fri, 06 May 1983 09:00:00 PDT")).toBe(
      "Fri, 06 May 1983 09:00:00 -0700",
    );
    expect(normalizeRfc822Zone("Fri, 06 May 1983 09:00:00 GMT")).toBe(
      "Fri, 06 May 1983 09:00:00 +0000",
    );
  });

  it("leaves dates with a numeric offset or no trailing zone name untouched", () => {
    expect(normalizeRfc822Zone("Fri, 06 May 1983 09:00:00 -0600")).toBe(
      "Fri, 06 May 1983 09:00:00 -0600",
    );
    expect(normalizeRfc822Zone("2024-01-01T00:00:00Z")).toBe(
      "2024-01-01T00:00:00Z",
    );
  });

  it("resolves a CST-zoned date to the correct UTC instant regardless of engine-native zone support", () => {
    // CST = UTC-6, so 09:00 CST is 15:00 UTC.
    expect(getPubDateMs("Fri, 06 May 1983 09:00:00 CST")).toBe(
      Date.UTC(1983, 4, 6, 15, 0, 0),
    );
  });
});

describe("getEffectiveDateMs", () => {
  it("returns the real pubDate when present, ignoring firstSeenMs", () => {
    const pubDateMs = Date.parse("2024-01-01T00:00:00Z");
    expect(
      getEffectiveDateMs(
        { pubDate: "2024-01-01T00:00:00Z", firstSeenMs: 999 },
        true,
      ),
    ).toBe(pubDateMs);
  });

  it("falls back to firstSeenMs when pubDate is missing and the fallback is enabled", () => {
    expect(
      getEffectiveDateMs({ pubDate: "", firstSeenMs: 12345 }, true),
    ).toBe(12345);
  });

  it("returns 0 when pubDate is missing and the fallback is disabled", () => {
    expect(
      getEffectiveDateMs({ pubDate: "", firstSeenMs: 12345 }, false),
    ).toBe(0);
  });

  it("returns 0 when pubDate is missing and firstSeenMs is absent, fallback enabled or not", () => {
    expect(getEffectiveDateMs({ pubDate: "" }, true)).toBe(0);
    expect(getEffectiveDateMs({ pubDate: "" }, false)).toBe(0);
  });
});

describe("resolveDisplayDate", () => {
  it("returns the real pubDate when present, regardless of the fallback setting", () => {
    const pubDateMs = Date.parse("2024-01-01T00:00:00Z");
    expect(
      resolveDisplayDate(
        { pubDate: "2024-01-01T00:00:00Z", firstSeenMs: 999 },
        false,
      ),
    ).toEqual(new Date(pubDateMs));
  });

  it("falls back to firstSeenMs when pubDate is missing and the fallback setting is on", () => {
    expect(
      resolveDisplayDate({ pubDate: "", firstSeenMs: 12345 }, true),
    ).toEqual(new Date(12345));
  });

  it("returns null (not a first-seen substitution) when pubDate is missing and the fallback setting is off", () => {
    expect(
      resolveDisplayDate({ pubDate: "", firstSeenMs: 12345 }, false),
    ).toBeNull();
  });

  it("returns null when pubDate is missing and firstSeenMs is absent, fallback on or off", () => {
    expect(resolveDisplayDate({ pubDate: "" }, true)).toBeNull();
    expect(resolveDisplayDate({ pubDate: "" }, false)).toBeNull();
  });
});

describe("applyFeedRetentionLimits", () => {
  const makeItem = (
    guid: string,
    pubDate: string,
    overrides?: Partial<FeedItem>,
  ): FeedItem => ({
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate,
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    saved: false,
    ...overrides,
  });

  it("keeps newest non-protected items up to maxItemsLimit (protected do not count)", () => {
    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      maxItemsLimit: 1,
      items: [
        makeItem("saved-old", "2024-01-01T00:00:00Z", {
          saved: true,
          read: true,
        }),
        makeItem("old", "2024-01-02T00:00:00Z", { read: true }),
        makeItem("new", "2024-01-03T00:00:00Z", { read: false }),
      ],
    };

    const updated = applyFeedRetentionLimits(feed, {
      nowMs: Date.parse("2024-01-10T00:00:00Z"),
    });
    expect(updated.items.map((i) => i.guid)).toEqual(["new", "saved-old"]);
  });

  it("breaks ties between same-effective-date items by ordinal guid, independent of locale", () => {
    const sameDate = "2024-01-05T00:00:00Z";
    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      items: [
        makeItem("z-item", sameDate),
        makeItem("a-item", sameDate),
        makeItem("ä-item", sameDate),
      ],
    };

    const updated = applyFeedRetentionLimits(feed, {
      nowMs: Date.parse("2024-01-10T00:00:00Z"),
    });

    // Ordinal (code-unit) order: "a-item" < "z-item" < "ä-item". A
    // locale-aware collation (e.g. Swedish) would sort "ä-item" before
    // "z-item" instead — this asserts the ordinal, locale-independent order.
    expect(updated.items.map((i) => i.guid)).toEqual([
      "a-item",
      "z-item",
      "ä-item",
    ]);
  });

  it("auto-deletes unread and read items older than cutoff by default while keeping protected items", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const tenDaysAgo = "2024-01-10T00:00:00Z";
    const oneDayAgo = "2024-01-19T00:00:00Z";

    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      maxItemsLimit: 0,
      items: [
        makeItem("read-old", tenDaysAgo, { read: true }),
        makeItem("unread-old", tenDaysAgo, { read: false }),
        makeItem("saved-old", tenDaysAgo, { read: true, saved: true }),
        makeItem("read-new", oneDayAgo, { read: true }),
      ],
    };

    const updated = applyFeedRetentionLimits(feed, { nowMs });
    expect(updated.items[0]?.guid).toBe("read-new");
    expect(new Set(updated.items.map((i) => i.guid))).toEqual(
      new Set(["read-new", "saved-old"]),
    );
  });

  it("retains unread items older than cutoff when protectUnread is true", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const tenDaysAgo = "2024-01-10T00:00:00Z";
    const oneDayAgo = "2024-01-19T00:00:00Z";

    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      maxItemsLimit: 0,
      items: [
        makeItem("read-old", tenDaysAgo, { read: true }),
        makeItem("unread-old", tenDaysAgo, { read: false }),
        makeItem("saved-old", tenDaysAgo, { read: true, saved: true }),
        makeItem("read-new", oneDayAgo, { read: true }),
      ],
    };

    const updated = applyFeedRetentionLimits(feed, {
      nowMs,
      protections: { protectUnread: true },
    });
    expect(new Set(updated.items.map((i) => i.guid))).toEqual(
      new Set(["read-new", "unread-old", "saved-old"]),
    );
  });

  it("retains tagged items older than cutoff when protectTagged is true", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const tenDaysAgo = "2024-01-10T00:00:00Z";

    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      items: [
        makeItem("tagged-old", tenDaysAgo, { read: true, tags: ["research"] }),
        makeItem("untagged-old", tenDaysAgo, { read: true, tags: [] }),
      ],
    };

    const prunedByDefault = applyFeedRetentionLimits(feed, { nowMs });
    expect(prunedByDefault.items).toHaveLength(0);

    const protectedWithToggle = applyFeedRetentionLimits(feed, {
      nowMs,
      protections: { protectTagged: true },
    });
    expect(protectedWithToggle.items.map((i) => i.guid)).toEqual(["tagged-old"]);
  });

  it("purges starred and saved items older than cutoff when their protections are disabled", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const tenDaysAgo = "2024-01-10T00:00:00Z";

    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      items: [
        makeItem("starred-old", tenDaysAgo, { read: true, starred: true }),
        makeItem("saved-old", tenDaysAgo, { read: true, saved: true }),
      ],
    };

    const protectedByDefault = applyFeedRetentionLimits(feed, { nowMs });
    expect(protectedByDefault.items).toHaveLength(2);

    const unprotectedStarred = applyFeedRetentionLimits(feed, {
      nowMs,
      protections: { protectStarred: false, protectSaved: true },
    });
    expect(unprotectedStarred.items.map((i) => i.guid)).toEqual(["saved-old"]);

    const unprotectedSaved = applyFeedRetentionLimits(feed, {
      nowMs,
      protections: { protectStarred: true, protectSaved: false },
    });
    expect(unprotectedSaved.items.map((i) => i.guid)).toEqual(["starred-old"]);
  });

  it("preserves unread and tagged items under maxItemsLimit when protected", () => {
    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      maxItemsLimit: 1,
      items: [
        makeItem("unread-old", "2024-01-01T00:00:00Z", { read: false }),
        makeItem("tagged-old", "2024-01-02T00:00:00Z", { read: true, tags: ["important"] }),
        makeItem("read-mid", "2024-01-03T00:00:00Z", { read: true }),
        makeItem("read-new", "2024-01-04T00:00:00Z", { read: true }),
      ],
    };

    // By default unread & tagged are NOT protected; only 1 newest non-protected item kept
    const defaultPruning = applyFeedRetentionLimits(feed);
    expect(defaultPruning.items.map((i) => i.guid)).toEqual(["read-new"]);

    // With protectUnread and protectTagged enabled, both survive and do not count against maxItemsLimit
    const protectedPruning = applyFeedRetentionLimits(feed, {
      protections: { protectUnread: true, protectTagged: true },
    });
    expect(new Set(protectedPruning.items.map((i) => i.guid))).toEqual(
      new Set(["read-new", "unread-old", "tagged-old"]),
    );
  });

  it("does not collapse to the server window size when maxItemsLimit > 25", () => {
    const existingItems: FeedItem[] = Array.from({ length: 60 }, (_, i) => {
      const n = i + 1;
      const pubDate = new Date(Date.UTC(2024, 0, n)).toISOString();
      return makeItem(`id-${n}`, pubDate);
    });

    const refreshedItems: FeedItem[] = Array.from({ length: 25 }, (_, i) => {
      const n = 36 + i;
      const pubDate = new Date(Date.UTC(2024, 0, n)).toISOString();
      return makeItem(`id-${n}`, pubDate, { title: `updated-${n}` });
    });

    const feedBase: Omit<Feed, "items"> = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      maxItemsLimit: 50,
      autoDeleteDuration: 0,
    };

    const firstMerged = mergeFeedHistoryItems(existingItems, refreshedItems);
    const first = applyFeedRetentionLimits({
      ...feedBase,
      items: firstMerged,
    } as Feed);
    expect(first.items).toHaveLength(50);
    expect(first.items[0]?.guid).toBe("id-60");

    const secondMerged = mergeFeedHistoryItems(first.items, refreshedItems);
    const second = applyFeedRetentionLimits({
      ...feedBase,
      items: secondMerged,
    } as Feed);
    expect(second.items).toHaveLength(50);
    expect(second.items[0]?.guid).toBe("id-60");
  });

  it("deletes an undated item immediately when useFirstSeenDateFallback is off (default/prior behavior)", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      maxItemsLimit: 0,
      items: [makeItem("undated", "", { firstSeenMs: nowMs })],
    };

    const updated = applyFeedRetentionLimits(feed, { nowMs });
    expect(updated.items).toHaveLength(0);
  });

  it("retains and correctly sorts an undated item by firstSeenMs when useFirstSeenDateFallback is on", () => {
    const nowMs = Date.parse("2024-01-20T00:00:00Z");
    const oneDayAgo = Date.parse("2024-01-19T00:00:00Z");
    const feed: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      maxItemsLimit: 0,
      items: [
        makeItem("dated-older", "2024-01-15T00:00:00Z"),
        makeItem("undated-recent", "", { firstSeenMs: oneDayAgo }),
      ],
    };

    const updated = applyFeedRetentionLimits(feed, {
      nowMs,
      useFirstSeenDateFallback: true,
    });

    // Undated item's firstSeenMs (one day ago) is more recent than the dated
    // item's pubDate (five days ago), so it sorts first and both survive the
    // 7-day cutoff.
    expect(updated.items.map((i) => i.guid)).toEqual([
      "undated-recent",
      "dated-older",
    ]);
  });

  it("survives multiple refresh cycles with useFirstSeenDateFallback on, keeping a stable firstSeenMs", () => {
    const feedBase: Omit<Feed, "items"> = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      lastUpdated: Date.now(),
      autoDeleteDuration: 7,
      maxItemsLimit: 0,
    };

    const day0 = Date.UTC(2026, 0, 1);
    const undatedFromFeed = makeItem("undated", "");

    const firstMerge = mergeFeedHistoryItems([], [undatedFromFeed], {
      nowMs: day0,
    });
    const firstRetained = applyFeedRetentionLimits(
      { ...feedBase, items: firstMerge } as Feed,
      { nowMs: day0, useFirstSeenDateFallback: true },
    );
    expect(firstRetained.items).toHaveLength(1);
    expect(firstRetained.items[0].firstSeenMs).toBe(day0);

    // Three days later: item is still undated in the feed, still within the
    // 7-day cutoff measured from its stable firstSeenMs, so it survives.
    const day3 = day0 + 3 * 24 * 60 * 60 * 1000;
    const secondMerge = mergeFeedHistoryItems(
      firstRetained.items,
      [makeItem("undated", "")],
      { nowMs: day3 },
    );
    const secondRetained = applyFeedRetentionLimits(
      { ...feedBase, items: secondMerge } as Feed,
      { nowMs: day3, useFirstSeenDateFallback: true },
    );
    expect(secondRetained.items).toHaveLength(1);
    expect(secondRetained.items[0].firstSeenMs).toBe(day0);
  });
});
