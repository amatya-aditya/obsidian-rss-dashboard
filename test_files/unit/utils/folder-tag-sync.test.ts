import { describe, expect, it } from "vitest";
import type { Feed, FeedItem, Tag } from "../../../src/types/types";
import {
  getRemovedFolderTagNames,
  removeAllTagsFromFeeds,
  syncFolderAutoTagsOnFeeds,
  syncFolderAutoTagsOnItem,
} from "../../../src/utils/folder-tag-sync";

const techTag: Tag = { name: "Tech", color: "#111111" };
const webTag: Tag = { name: "Web", color: "#222222" };
const manualTag: Tag = { name: "Manual", color: "#333333" };

function createItem(tags?: Tag[]): FeedItem {
  return {
    guid: "item-1",
    title: "Item",
    link: "https://example.com/item",
    pubDate: "Mon, 01 Jan 2024 00:00:00 GMT",
    tags,
  };
}

function createFeed(folder: string, items: FeedItem[]): Feed {
  return {
    title: "Feed",
    url: "https://example.com/feed",
    folder,
    items,
    lastUpdated: Date.now(),
  };
}

describe("folder-tag-sync", () => {
  it("detects folder tag names removed from the rule", () => {
    expect(
      getRemovedFolderTagNames([techTag, webTag], [webTag]),
    ).toEqual(["Tech"]);
    expect(getRemovedFolderTagNames([techTag], [])).toEqual(["Tech"]);
    expect(getRemovedFolderTagNames([], [techTag])).toEqual([]);
  });

  it("syncFolderAutoTagsOnItem adds missing tags and removes deselected rule tags only", () => {
    const item = createItem([techTag, manualTag, { name: "topic", color: "#444444" }]);

    const changed = syncFolderAutoTagsOnItem(item, [techTag, webTag], [webTag]);

    expect(changed).toBe(true);
    expect(item.tags).toEqual([manualTag, { name: "topic", color: "#444444" }, webTag]);
  });

  it("syncFolderAutoTagsOnItem is case-insensitive when removing rule tags", () => {
    const item = createItem([{ name: "TECH", color: "#111111" }, manualTag]);

    syncFolderAutoTagsOnItem(item, [techTag], []);

    expect(item.tags).toEqual([manualTag]);
  });

  it("syncFolderAutoTagsOnItem returns false when nothing changes", () => {
    const item = createItem([techTag, manualTag]);

    const changed = syncFolderAutoTagsOnItem(item, [techTag], [techTag]);

    expect(changed).toBe(false);
    expect(item.tags).toEqual([techTag, manualTag]);
  });

  it("syncFolderAutoTagsOnFeeds scopes updates to selected folder paths", () => {
    const feeds = [
      createFeed("Technology", [createItem([techTag])]),
      createFeed("Technology/Web", [createItem([techTag, manualTag])]),
      createFeed("News", [createItem([techTag])]),
    ];

    const updated = syncFolderAutoTagsOnFeeds(
      feeds,
      ["Technology", "Technology/Web"],
      [techTag],
      [webTag],
    );

    expect(updated).toBe(2);
    expect(feeds[0].items[0].tags).toEqual([webTag]);
    expect(feeds[1].items[0].tags).toEqual([manualTag, webTag]);
    expect(feeds[2].items[0].tags).toEqual([techTag]);
  });

  it("removeAllTagsFromFeeds clears every tag in scope", () => {
    const feeds = [
      createFeed("Technology", [createItem([techTag, manualTag])]),
      createFeed("News", [createItem([manualTag])]),
    ];

    const updated = removeAllTagsFromFeeds(feeds, ["Technology"]);

    expect(updated).toBe(1);
    expect(feeds[0].items[0].tags).toEqual([]);
    expect(feeds[1].items[0].tags).toEqual([manualTag]);
  });
});
