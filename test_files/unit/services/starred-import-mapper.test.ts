import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildNewFeedRecord,
  DEFAULT_LABEL_TAG_COLOR,
  mapStarredExportToCandidates,
  type StarredJsonExport,
} from "../../../src/services/starred-import-mapper";
import type { Tag } from "../../../src/types/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadFixtureFile(fileName: string): StarredJsonExport {
  const fixturePath = path.resolve(
    __dirname,
    "..",
    "..",
    "fixtures",
    "starred",
    fileName,
  );
  return JSON.parse(readFileSync(fixturePath, "utf-8")) as StarredJsonExport;
}

function loadFixture(): StarredJsonExport {
  return loadFixtureFile("starred.json");
}

function loadUnimportableFixture(): StarredJsonExport {
  return loadFixtureFile("starred-unimportable.json");
}

const EXISTING_FEEDS = [
  { url: "https://example-feed.test/rss", title: "Example Feed" },
  { url: "https://example.com/blog/feed.xml", title: "Example Blog" },
];

describe("mapStarredExportToCandidates", () => {
  it("produces a candidate for every item that has an origin.streamId, matched or not", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.item.guid)).toEqual([
      "tag:google.com,2005:reader/item/0000000000000001",
      "tag:google.com,2005:reader/item/0000000000000002",
      "tag:google.com,2005:reader/item/0000000000000003",
    ]);
  });

  it("marks items matched to an already-subscribed feed as isNewFeed: false", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    const matched = candidates.filter((c) => !c.item.guid.endsWith("0003"));
    expect(matched).toHaveLength(2);
    for (const candidate of matched) {
      expect(candidate.isNewFeed).toBe(false);
      expect(candidate.feedSiteUrl).toBeUndefined();
    }
  });

  it("no longer excludes items whose origin.streamId does not match any local feed — it becomes a new-feed candidate", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);
    const unsubscribed = candidates.find(
      (c) => c.item.title === "Unsubscribed Source Article",
    );

    expect(unsubscribed).toBeDefined();
    expect(unsubscribed?.isNewFeed).toBe(true);
    expect(unsubscribed?.feedUrl).toBe(
      "https://not-subscribed.example.test/feed",
    );
    expect(unsubscribed?.feedTitle).toBe("Not Subscribed Source");
    expect(unsubscribed?.feedSiteUrl).toBe(
      "https://not-subscribed.example.test/",
    );
    expect(unsubscribed?.item.feedUrl).toBe(
      "https://not-subscribed.example.test/feed",
    );
    expect(unsubscribed?.item.feedTitle).toBe("Not Subscribed Source");
  });

  it("falls back to the normalized feed URL as the new feed's title when origin.title is missing", () => {
    const parsed: StarredJsonExport = {
      items: [
        {
          id: "tag:google.com,2005:reader/item/no-title",
          title: "No origin title",
          canonical: [{ href: "https://untitled.example.test/articles/x" }],
          origin: { streamId: "feed/https://untitled.example.test/rss" },
        },
      ],
    };

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].isNewFeed).toBe(true);
    expect(candidates[0].feedTitle).toBe(
      "https://untitled.example.test/rss",
    );
  });

  it("groups multiple starred items for the same unmatched source under one new-feed candidate group", () => {
    const parsed: StarredJsonExport = {
      items: [
        {
          id: "tag:google.com,2005:reader/item/new-a",
          title: "New A",
          canonical: [{ href: "https://new-source.example.test/a" }],
          origin: {
            streamId: "feed/https://new-source.example.test/rss",
            title: "New Source",
            htmlUrl: "https://new-source.example.test/",
          },
        },
        {
          id: "tag:google.com,2005:reader/item/new-b",
          title: "New B",
          canonical: [{ href: "https://new-source.example.test/b" }],
          origin: {
            streamId: "feed/https://new-source.example.test/rss",
            title: "New Source",
            htmlUrl: "https://new-source.example.test/",
          },
        },
      ],
    };

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(2);
    expect(candidates.every((c) => c.isNewFeed)).toBe(true);
    expect(candidates.every((c) => c.feedUrl === "https://new-source.example.test/rss")).toBe(true);
    expect(candidates.every((c) => c.feedTitle === "New Source")).toBe(true);
  });

  it("excludes items with no origin.streamId at all", () => {
    const parsed: StarredJsonExport = {
      items: [
        {
          id: "tag:google.com,2005:reader/item/no-origin",
          title: "No origin item",
          canonical: [{ href: "https://example-feed.test/articles/x" }],
        },
      ],
    };

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(0);
  });

  it("maps title, link (canonical preferred), content, author, published date, and guid", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);
    const first = candidates[0].item;

    expect(first.title).toBe("Existing Feed Article One");
    expect(first.link).toBe("https://example-feed.test/articles/one");
    expect(first.description).toBe(
      "<p>Placeholder summary content for article one.</p>",
    );
    expect(first.content).toBe(
      "<p>Placeholder summary content for article one.</p>",
    );
    expect(first.guid).toBe(
      "tag:google.com,2005:reader/item/0000000000000001",
    );
    expect(first.author).toBeUndefined();
    expect(new Date(first.pubDate).toISOString()).toBe(
      new Date(1699999000 * 1000).toISOString(),
    );
  });

  it("falls back to the alternate href when no canonical href is present", () => {
    const parsed: StarredJsonExport = {
      items: [
        {
          id: "tag:google.com,2005:reader/item/alt-only",
          title: "Alternate only",
          alternate: [{ href: "https://example-feed.test/alt-link", type: "text/html" }],
          origin: { streamId: "feed/https://example-feed.test/rss" },
        },
      ],
    };

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].item.link).toBe("https://example-feed.test/alt-link");
  });

  it("sets starred true unconditionally", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    for (const candidate of candidates) {
      expect(candidate.item.starred).toBe(true);
    }
  });

  it("passes through the exported read state", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);
    const readItem = candidates.find((c) => c.item.guid.endsWith("0001"));
    const unreadItem = candidates.find((c) => c.item.guid.endsWith("0002"));

    expect(readItem?.item.read).toBe(true);
    expect(unreadItem?.item.read).toBe(false);
  });

  it("maps an item's label categories to tags", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);
    const labeled = candidates.find((c) => c.item.guid.endsWith("0002"));

    expect(labeled).toBeDefined();
    expect(labeled?.item.author).toBe("Jane Example");
    expect(labeled?.item.tags).toEqual([
      { name: "Design", color: DEFAULT_LABEL_TAG_COLOR },
      { name: "art", color: DEFAULT_LABEL_TAG_COLOR },
    ]);
  });

  it("leaves tags undefined for an item with no label categories", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);
    const unlabeled = candidates.find((c) => c.item.guid.endsWith("0001"));

    expect(unlabeled).toBeDefined();
    expect(unlabeled?.item.tags).toBeUndefined();
  });

  it("reuses an existing availableTags color instead of creating a duplicate palette entry", () => {
    const parsed = loadFixture();
    const availableTags: Tag[] = [
      { name: "design", color: "#123456" },
      { name: "Unrelated", color: "#abcdef" },
    ];

    const { candidates } = mapStarredExportToCandidates(
      parsed,
      EXISTING_FEEDS,
      availableTags,
    );
    const labeled = candidates.find((c) => c.item.guid.endsWith("0002"));

    expect(labeled?.item.tags).toEqual([
      { name: "design", color: "#123456" },
      { name: "art", color: DEFAULT_LABEL_TAG_COLOR },
    ]);
    // The mapper is pure: it never mutates the availableTags it was given.
    expect(availableTags).toHaveLength(2);
  });

  it("never turns starred, read, or reading-list state categories into tags", () => {
    const parsed: StarredJsonExport = {
      items: [
        {
          id: "tag:google.com,2005:reader/item/state-only",
          title: "State only item",
          categories: [
            "user/1000000001/state/com.google/reading-list",
            "user/1000000001/state/com.google/read",
            "user/1000000001/state/com.google/starred",
          ],
          canonical: [{ href: "https://example-feed.test/articles/state-only" }],
          origin: { streamId: "feed/https://example-feed.test/rss" },
        },
      ],
    };

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].item.tags).toBeUndefined();
    expect(candidates[0].item.starred).toBe(true);
    expect(candidates[0].item.read).toBe(true);
  });

  it("groups candidates under the matching local feed's url and title", () => {
    const parsed = loadFixture();

    const { candidates } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(candidates[0].feedUrl).toBe("https://example-feed.test/rss");
    expect(candidates[0].feedTitle).toBe("Example Feed");
    expect(candidates[1].feedUrl).toBe("https://example.com/blog/feed.xml");
    expect(candidates[1].feedTitle).toBe("Example Blog");
  });

  it("returns no unimportable entries for a fixture where every entry is well-formed", () => {
    const parsed = loadFixture();

    const { unimportable } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

    expect(unimportable).toHaveLength(0);
  });

  describe("unimportable classification", () => {
    it("classifies an entry with no origin.streamId at all as no_source_feed", () => {
      const parsed = loadUnimportableFixture();

      const { unimportable } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

      expect(unimportable).toContainEqual({
        id: "tag:google.com,2005:reader/item/0000000000000004",
        title: "No Source Feed Article",
        reason: "no_source_feed",
      });
    });

    it("classifies an entry with a source feed but neither canonical nor alternate href as no_article_url", () => {
      const parsed = loadUnimportableFixture();

      const { unimportable } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

      expect(unimportable).toContainEqual({
        id: "tag:google.com,2005:reader/item/0000000000000005",
        title: "No Article Url Article",
        reason: "no_article_url",
      });
    });

    it("classifies an entry missing both origin.streamId and any article url as no_source_feed (checked first)", () => {
      const parsed = loadUnimportableFixture();

      const { unimportable } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

      expect(unimportable).toContainEqual({
        id: "tag:google.com,2005:reader/item/0000000000000006",
        title: "No Source Feed And No Article Url Article",
        reason: "no_source_feed",
      });
    });

    it("does not classify any of the unimportable-fixture entries as candidates", () => {
      const parsed = loadUnimportableFixture();

      const { candidates, unimportable } = mapStarredExportToCandidates(
        parsed,
        EXISTING_FEEDS,
      );

      expect(candidates).toHaveLength(0);
      expect(unimportable).toHaveLength(3);
    });

    it("does not classify an entry excluded only because its (valid) source feed isn't subscribed to locally", () => {
      const parsed = loadFixture();

      const { unimportable } = mapStarredExportToCandidates(parsed, EXISTING_FEEDS);

      expect(
        unimportable.some((entry) => entry.title === "Unsubscribed Source Article"),
      ).toBe(false);
    });
  });
});

describe("buildNewFeedRecord", () => {
  it("builds a Feed record from a new-feed candidate's url, title, folder, and site url", () => {
    const feed = buildNewFeedRecord({
      url: "https://not-subscribed.example.test/feed",
      title: "Not Subscribed Source",
      folder: "Imported",
      siteUrl: "https://not-subscribed.example.test/",
    });

    expect(feed.url).toBe("https://not-subscribed.example.test/feed");
    expect(feed.title).toBe("Not Subscribed Source");
    expect(feed.folder).toBe("Imported");
    expect(feed.siteUrl).toBe("https://not-subscribed.example.test/");
    expect(feed.items).toEqual([]);
    expect(typeof feed.lastUpdated).toBe("number");
  });

  it("omits siteUrl entirely when none was provided", () => {
    const feed = buildNewFeedRecord({
      url: "https://untitled.example.test/rss",
      title: "Untitled",
      folder: "Uncategorized",
    });

    expect(feed.siteUrl).toBeUndefined();
  });
});
