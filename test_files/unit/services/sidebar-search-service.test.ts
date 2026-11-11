import { describe, expect, it } from "vitest";
import { SidebarSearchService } from "../../../src/services/sidebar-search-service";
import type { Feed, FeedItem, Folder, Tag } from "../../../src/types/types";

const tag = (name: string): Tag => ({ name, color: "#6699cc" });
const article = (name: string, tags: string[] = []): FeedItem => ({
  title: name,
  link: `https://example.com/articles/${encodeURIComponent(name)}`,
  description: name,
  content: name,
  pubDate: "2026-01-01",
  guid: name,
  feedTitle: "",
  feedUrl: "",
  coverImage: "",
  tags: tags.map(tag),
});
const feed = (title: string, folder: string, items: FeedItem[]): Feed => ({
  title,
  url: `https://example.com/feeds/${encodeURIComponent(title)}`,
  folder,
  items,
  lastUpdated: 0,
});
const folder = (name: string, subfolders: Folder[] = []): Folder => ({
  name,
  subfolders,
});

describe("SidebarSearchService query parsing", () => {
  it.each(["tag:Saved", "tag:#Saved", " TAG: #SaVeD ", "tags:#Saved"])(
    "normalizes %s to a case-insensitive tag term",
    (raw) => {
      expect(SidebarSearchService.parseQuery(raw)).toMatchObject({
        scope: "tags",
        term: "saved",
      });
    },
  );

  it.each([
    ["feed:News", "feeds"],
    ["feeds:News", "feeds"],
    ["folder:News", "folders"],
    ["folders:News", "folders"],
    ["path:News", "folders"],
    ["tag:News", "tags"],
    ["tags:News", "tags"],
  ] as const)("maps the %s qualifier to the %s scope", (raw, scope) => {
    expect(SidebarSearchService.parseQuery(raw)).toMatchObject({
      scope,
      term: "news",
    });
  });

  it("trims the query and the term after a qualifier", () => {
    expect(
      SidebarSearchService.parseQuery("  feed:   Daily News   "),
    ).toMatchObject({ scope: "feeds", term: "daily news" });
  });

  it("recognizes one leading qualifier only", () => {
    expect(SidebarSearchService.parseQuery("feed:folder:Tech")).toMatchObject({
      scope: "feeds",
      term: "folder:tech",
    });
  });

  it.each([
    ["title:Saved", "title:saved"],
    ["#Saved", "#saved"],
    ["Saved", "saved"],
  ])(
    "keeps the unknown prefix or bare hash in %s as plain text",
    (raw, term) => {
      expect(SidebarSearchService.parseQuery(raw)).toMatchObject({
        scope: "all",
        term,
      });
    },
  );

  it.each([
    ["Saved", true],
    ["  sav  ", true],
    ["Sa", false],
    ["", false],
    ["   ", false],
    ["feed:A", true],
    ["folder:A", true],
    ["tag:#A", true],
    ["tag:#", false],
    ["feed:", false],
  ])("reports %s as active: %s", (raw, active) => {
    expect(
      SidebarSearchService.isActive(SidebarSearchService.parseQuery(raw)),
    ).toBe(active);
  });
});

describe("SidebarSearchService matching rules", () => {
  it.each(["tag:", "tag:#", "tag: # "])(
    "treats %s as an empty, unfiltered query",
    (raw) => {
      const query = SidebarSearchService.parseQuery(raw);
      expect(query.term).toBe("");
      expect(SidebarSearchService.matchesTag(query, "Anything")).toBe(true);
      expect(SidebarSearchService.matchesFeed(query, "Any feed")).toBe(true);
      expect(SidebarSearchService.matchesFolder(query, "Any folder")).toBe(
        true,
      );
    },
  );

  it.each([
    ["tag:Saved", "Saved", true],
    ["tag:#sAv", "SAVED/later", true],
    ["tag:A", "A", true],
    ["tag:A", "About", true],
    ["tag:#a", "About", true],
    ["tag:Saved", "Unsaved", false],
    ["tag:A", "Read", false],
    ["tag:Sa*", "Saved", false],
    ["tag:Sa*", "Sa*ved", true],
    ["tag:Sa?", "Saved", false],
    ["tag:Sa?", "Sa?ved", true],
    ["tag:Save later", "Save for later", false],
    ["tag:Save later", "Save later/today", true],
    ["Sav", "Saved", true],
    ["ave", "Saved", false],
    ["Save*", "Saved", false],
    ["Saved", "saved/later", true],
  ])(
    "matches %s against %s as a literal prefix: %s",
    (raw, tagName, matches) => {
      expect(
        SidebarSearchService.matchesTag(
          SidebarSearchService.parseQuery(raw),
          tagName,
        ),
      ).toBe(matches);
    },
  );

  it("does not match feed or folder names for a nonempty tag query", () => {
    const query = SidebarSearchService.parseQuery("tag:Saved");
    expect(SidebarSearchService.matchesFeed(query, "Saved", "Saved")).toBe(
      false,
    );
    expect(SidebarSearchService.matchesFolder(query, "Saved", "Saved")).toBe(
      false,
    );
  });

  it("requires every whitespace-separated word in a feed title or folder path", () => {
    const query = SidebarSearchService.parseQuery("daily news");
    expect(
      SidebarSearchService.matchesFeed(
        query,
        "Daily technology news",
        "Reading",
      ),
    ).toBe(true);
    expect(
      SidebarSearchService.matchesFeed(query, "Daily cooking", "News/Daily"),
    ).toBe(true);
    expect(SidebarSearchService.matchesFeed(query, "Daily cooking")).toBe(
      false,
    );
  });

  it("requires every whitespace-separated word in a folder name or path", () => {
    const query = SidebarSearchService.parseQuery("folder: read deep");
    expect(
      SidebarSearchService.matchesFolder(query, "Deep", "Reading/Deep"),
    ).toBe(true);
    expect(
      SidebarSearchService.matchesFolder(query, "Deep", "Archive/Deep"),
    ).toBe(false);
  });

  it("keeps scope-specific matching separate", () => {
    const feedQuery = SidebarSearchService.parseQuery("feed:Daily");
    expect(
      SidebarSearchService.matchesFolder(feedQuery, "Daily", "Daily"),
    ).toBe(false);
    expect(SidebarSearchService.matchesTag(feedQuery, "Daily")).toBe(false);

    const folderQuery = SidebarSearchService.parseQuery("folder:Daily");
    expect(
      SidebarSearchService.matchesFeed(folderQuery, "Daily", "Daily"),
    ).toBe(false);

    expect(SidebarSearchService.parseQuery("feed:#Saved").term).toBe("#saved");
    expect(SidebarSearchService.parseQuery("#Saved").term).toBe("#saved");
  });
});

describe("SidebarSearchService result summary", () => {
  const feeds = [
    feed("Saved feed", "", [article("First", ["Saved"])]),
    feed("Archive feed", "Saved archive", [article("Second")]),
    feed("Tagged feed", "News/Tech", [article("Third", ["Saved/later"])]),
    feed("Tech feed", "News/Tech", [article("Fourth")]),
  ];
  const folders = [
    folder("Saved archive"),
    folder("News", [folder("Tech")]),
    folder("Empty archive"),
  ];
  const availableTags = [tag("Saved"), tag("Saved/later"), tag("Orphan")];

  it("combines feed, folder, and tag matches without double-counting a feed", () => {
    const summary = SidebarSearchService.summarize(
      SidebarSearchService.parseQuery("Saved"),
      feeds,
      folders,
      availableTags,
    );

    expect(summary.matchingTags.map((item) => item.name)).toEqual([
      "Saved",
      "Saved/later",
    ]);
    expect(summary.directFolderPaths).toEqual(["Saved archive"]);
    expect([...summary.matchingFeedUrls].sort()).toEqual(
      [
        "https://example.com/feeds/Saved%20feed",
        "https://example.com/feeds/Archive%20feed",
        "https://example.com/feeds/Tagged%20feed",
      ].sort(),
    );
  });

  it("treats tag queries as catalog prefixes plus article tags", () => {
    const summary = SidebarSearchService.summarize(
      SidebarSearchService.parseQuery("tag:#Sav"),
      feeds,
      folders,
      availableTags,
    );

    expect(summary.matchingTags.map((item) => item.name)).toEqual([
      "Saved",
      "Saved/later",
    ]);
    expect(summary.directFolderPaths).toEqual([]);
    expect([...summary.matchingFeedUrls].sort()).toEqual(
      [
        "https://example.com/feeds/Saved%20feed",
        "https://example.com/feeds/Tagged%20feed",
      ].sort(),
    );
  });

  it("includes feeds in the subtree of a directly matched folder", () => {
    const summary = SidebarSearchService.summarize(
      SidebarSearchService.parseQuery("folder:News"),
      feeds,
      folders,
      availableTags,
    );

    expect(summary.matchingTags).toEqual([]);
    expect(summary.directFolderPaths).toEqual(["News", "News/Tech"]);
    expect([...summary.matchingFeedUrls].sort()).toEqual(
      [
        "https://example.com/feeds/Tagged%20feed",
        "https://example.com/feeds/Tech%20feed",
      ].sort(),
    );
  });

  it("returns no matches for an inactive query", () => {
    const summary = SidebarSearchService.summarize(
      SidebarSearchService.parseQuery("Sa"),
      feeds,
      folders,
      availableTags,
    );

    expect(summary.matchingTags).toEqual([]);
    expect(summary.directFolderPaths).toEqual([]);
    expect(summary.matchingFeedUrls.size).toBe(0);
  });
});
