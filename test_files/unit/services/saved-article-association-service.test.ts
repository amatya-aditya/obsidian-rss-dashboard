import { describe, expect, it } from "vitest";
import type { Feed, FeedItem } from "../../../src/types/types";
import { SavedArticleAssociationService } from "../../../src/services/saved-article-association-service";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Saved article",
    link: "https://example.com/article",
    description: "Description",
    pubDate: "2026-01-01T00:00:00Z",
    guid: "article-1",
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
    saved: true,
    savedFilePath: "Saved/article.md",
    read: true,
    starred: true,
    tags: [
      { name: "SaVeD", color: "blue" },
      { name: "Research", color: "green" },
    ],
    ...overrides,
  };
}

function makeFeed(url: string, items: FeedItem[]): Feed {
  return {
    title: "Feed",
    url,
    folder: "",
    items,
    lastUpdated: 0,
  };
}

describe("SavedArticleAssociationService", () => {
  it("updates a renamed saved note while preserving its saved state and tags", () => {
    const current = makeItem();
    const other = makeItem({
      guid: "article-2",
      savedFilePath: "Saved/other.md",
    });
    const feed = makeFeed("https://example.com/feed.xml", [current, other]);

    const updates = new SavedArticleAssociationService().renameTrackedPath(
      [feed],
      "Saved/article.md",
      "Archive/renamed.md",
    );

    expect(updates).toEqual([{ feedUrl: feed.url, guid: current.guid }]);
    expect(current).toMatchObject({
      saved: true,
      savedFilePath: "Archive/renamed.md",
      read: true,
      starred: true,
      tags: [
        { name: "SaVeD", color: "blue" },
        { name: "Research", color: "green" },
      ],
    });
    expect(other.savedFilePath).toBe("Saved/other.md");
  });

  it("updates recorded descendants when a tracked folder is moved", () => {
    const descendant = makeItem({ savedFilePath: "Saved/Old/article.md" });
    const similarlyNamed = makeItem({
      guid: "article-2",
      savedFilePath: "Saved/Old copy/article.md",
    });
    const feed = makeFeed("https://example.com/feed.xml", [
      descendant,
      similarlyNamed,
    ]);

    const updates = new SavedArticleAssociationService().renameTrackedPath(
      [feed],
      "Saved/Old",
      "Archive/New",
      true,
    );

    expect(updates).toEqual([{ feedUrl: feed.url, guid: descendant.guid }]);
    expect(descendant.savedFilePath).toBe("Archive/New/article.md");
    expect(descendant.saved).toBe(true);
    expect(similarlyNamed.savedFilePath).toBe("Saved/Old copy/article.md");
  });

  it("keeps same-guid saved associations isolated by feed identity", () => {
    const first = makeItem({ feedUrl: "https://one.example/feed.xml" });
    const second = makeItem({
      feedUrl: "https://two.example/feed.xml",
      savedFilePath: "Saved/two.md",
    });

    const updates = new SavedArticleAssociationService().renameTrackedPath(
      [
        makeFeed("https://one.example/feed.xml", [first]),
        makeFeed("https://two.example/feed.xml", [second]),
      ],
      "Saved/article.md",
      "Archive/article.md",
    );

    expect(updates).toEqual([
      { feedUrl: "https://one.example/feed.xml", guid: "article-1" },
    ]);
    expect(first.savedFilePath).toBe("Archive/article.md");
    expect(second.savedFilePath).toBe("Saved/two.md");
  });

  it("clears only saved notes at a deleted file path and preserves other state", () => {
    const current = makeItem();
    const other = makeItem({
      guid: "article-2",
      savedFilePath: "Saved/other.md",
    });
    const feed = makeFeed("https://example.com/feed.xml", [current, other]);
    const service = new SavedArticleAssociationService();

    const updates = service.clearDeletedPath([feed], "Saved/article.md");

    expect(updates).toEqual([
      {
        feedUrl: feed.url,
        guid: current.guid,
        saved: false,
        savedFilePath: undefined,
        tags: [{ name: "Research", color: "green" }],
      },
    ]);
    expect(current).toMatchObject({ read: true, starred: true });
    expect(current.saved).toBe(false);
    expect(current.savedFilePath).toBeUndefined();
    expect(other.saved).toBe(true);
  });

  it("matches recorded descendants when a tracked folder is deleted", () => {
    const directChild = makeItem({ savedFilePath: "Saved/Nested/article.md" });
    const similarlyNamed = makeItem({
      guid: "article-2",
      savedFilePath: "Saved/Nested copy/article.md",
    });
    const feed = makeFeed("https://example.com/feed.xml", [
      directChild,
      similarlyNamed,
    ]);

    const updates = new SavedArticleAssociationService().clearDeletedPath(
      [feed],
      "Saved/Nested",
      true,
    );

    expect(updates.map(({ guid }) => guid)).toEqual([directChild.guid]);
    expect(similarlyNamed.saved).toBe(true);
  });

  it("keeps the current association when an older saved copy is deleted", () => {
    const item = makeItem({ savedFilePath: "Saved/current.md" });

    const updates = new SavedArticleAssociationService().clearDeletedPath(
      [makeFeed("https://example.com/feed.xml", [item])],
      "Saved/older-copy.md",
    );

    expect(updates).toEqual([]);
    expect(item.saved).toBe(true);
    expect(item.savedFilePath).toBe("Saved/current.md");
  });

  it("keeps same-guid articles isolated by their recorded feed associations", () => {
    const first = makeItem({ feedUrl: "https://one.example/feed.xml" });
    const second = makeItem({
      feedUrl: "https://two.example/feed.xml",
      savedFilePath: "Saved/two.md",
    });

    const updates = new SavedArticleAssociationService().clearDeletedPath(
      [
        makeFeed("https://one.example/feed.xml", [first]),
        makeFeed("https://two.example/feed.xml", [second]),
      ],
      "Saved/article.md",
    );

    expect(updates.map(({ feedUrl, guid }) => ({ feedUrl, guid }))).toEqual([
      { feedUrl: "https://one.example/feed.xml", guid: "article-1" },
    ]);
    expect(second.saved).toBe(true);
  });
});
