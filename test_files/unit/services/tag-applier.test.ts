import { describe, expect, it } from "vitest";
import { type FeedItem, type Tag } from "../../../src/types/types";
import { applyTagsToItems, removeTagsFromItemsByName } from "../../../src/services/tag-applier";

describe("tag-applier service", () => {
  const sampleTags: Tag[] = [
    { name: "News", color: "#111" },
    { name: "Tech", color: "#222" },
  ];

  it("applies tags to items and initializes tags array if missing", () => {
    const items: FeedItem[] = [
      { title: "Item 1", tags: [] } as unknown as FeedItem,
      { title: "Item 2" } as unknown as FeedItem, // missing tags field entirely
    ];

    applyTagsToItems(items, sampleTags);

    expect(items[0].tags).toEqual(sampleTags);
    expect(items[1].tags).toEqual(sampleTags);
  });

  it("does not add duplicate tags by name", () => {
    const items: FeedItem[] = [
      {
        title: "Item 1",
        tags: [{ name: "News", color: "#fff" }], // different color but same name
      } as unknown as FeedItem,
    ];

    applyTagsToItems(items, sampleTags);

    // Should only have News (original color preserved or updated? Plan says "no duplicates by tag name", usually keeping existing or adding missing)
    // Let's assert it keeps the original or replaces, but doesn't double-add.
    // Let's check that there's exactly one "News" tag and one "Tech" tag.
    expect(items[0].tags).toHaveLength(2);
    const names = items[0].tags.map((t) => t.name);
    expect(names).toContain("News");
    expect(names).toContain("Tech");
  });

  it("removes tags by name regardless of source/color", () => {
    const items: FeedItem[] = [
      {
        title: "Item 1",
        tags: [
          { name: "News", color: "#111" },
          { name: "Manual", color: "#777" },
        ],
      } as unknown as FeedItem,
    ];

    removeTagsFromItemsByName(items, ["News"]);

    expect(items[0].tags).toEqual([{ name: "Manual", color: "#777" }]);
  });

  it("remove operation doesn't touch unrelated tags", () => {
    const items: FeedItem[] = [
      {
        title: "Item 1",
        tags: [{ name: "KeepMe", color: "#333" }],
      } as unknown as FeedItem,
    ];

    removeTagsFromItemsByName(items, ["News"]);

    expect(items[0].tags).toEqual([{ name: "KeepMe", color: "#333" }]);
  });
});
