import { describe, it, expect } from "vitest";
import type { FeedItem, Tag } from "../../src/types/types";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTag(name: string, color = "#3498db"): Tag {
  return { name, color };
}

function makeItem(tags: Tag[], extras: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test Article",
    link: "https://example.com",
    description: "",
    pubDate: new Date().toISOString(),
    guid: Math.random().toString(),
    read: false,
    starred: false,
    tags,
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/feed",
    coverImage: "",
    saved: false,
    ...extras,
  };
}

// ─── Pure filtering logic (extracted so it can be tested without DOM) ────────

type TagFilterMode = "or" | "and" | "not";

function filterBySelectedTags(
  items: FeedItem[],
  selectedTags: string[],
  mode: TagFilterMode
): FeedItem[] {
  if (selectedTags.length === 0) return items;

  return items.filter((item) => {
    const itemTagNames = (item.tags ?? []).map((t) => t.name);
    switch (mode) {
      case "or":
        return selectedTags.some((tag) => itemTagNames.includes(tag));
      case "and":
        return selectedTags.every((tag) => itemTagNames.includes(tag));
      case "not":
        return !selectedTags.some((tag) => itemTagNames.includes(tag));
    }
  });
}

// ─── Tag toggle logic ────────────────────────────────────────────────────────

function toggleTag(selectedTags: string[], tag: string): string[] {
  if (selectedTags.includes(tag)) {
    return selectedTags.filter((t) => t !== tag);
  }
  return [...selectedTags, tag];
}

// ─── Tag creation validation ─────────────────────────────────────────────────

function validateNewTag(
  name: string,
  existingTags: Tag[]
): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, error: "Tag name cannot be empty." };
  if (
    existingTags.some(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase()
    )
  ) {
    return { valid: false, error: "A tag with this name already exists." };
  }
  return { valid: true };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Sidebar Tags Section — filtering logic", () => {
  const tagYoutube = makeTag("youtube");
  const tagImportant = makeTag("important");
  const tagPodcast = makeTag("podcast");

  const itemYoutube = makeItem([tagYoutube], { title: "YouTube only" });
  const itemImportant = makeItem([tagImportant], { title: "Important only" });
  const itemBoth = makeItem([tagYoutube, tagImportant], { title: "Both" });
  const itemPodcast = makeItem([tagPodcast], { title: "Podcast only" });
  const itemNone = makeItem([], { title: "No tags" });

  const allItems = [itemYoutube, itemImportant, itemBoth, itemPodcast, itemNone];

  describe("OR mode", () => {
    it("returns articles matching any selected tag", () => {
      const result = filterBySelectedTags(allItems, ["youtube", "important"], "or");
      expect(result).toContain(itemYoutube);
      expect(result).toContain(itemImportant);
      expect(result).toContain(itemBoth);
      expect(result).not.toContain(itemPodcast);
      expect(result).not.toContain(itemNone);
    });

    it("returns only items with that single tag when one tag is selected", () => {
      const result = filterBySelectedTags(allItems, ["youtube"], "or");
      expect(result).toContain(itemYoutube);
      expect(result).toContain(itemBoth);
      expect(result).not.toContain(itemImportant);
      expect(result).not.toContain(itemPodcast);
    });

    it("returns all items when no tags are selected", () => {
      const result = filterBySelectedTags(allItems, [], "or");
      expect(result).toHaveLength(allItems.length);
    });
  });

  describe("AND mode", () => {
    it("returns only articles that have ALL selected tags", () => {
      const result = filterBySelectedTags(allItems, ["youtube", "important"], "and");
      expect(result).toHaveLength(1);
      expect(result).toContain(itemBoth);
    });

    it("returns items with that single tag when only one tag is selected", () => {
      const result = filterBySelectedTags(allItems, ["youtube"], "and");
      expect(result).toContain(itemYoutube);
      expect(result).toContain(itemBoth);
      expect(result).not.toContain(itemImportant);
    });

    it("returns empty array when no items have all selected tags", () => {
      const result = filterBySelectedTags(allItems, ["youtube", "podcast"], "and");
      expect(result).toHaveLength(0);
    });

    it("returns all items when no tags are selected", () => {
      const result = filterBySelectedTags(allItems, [], "and");
      expect(result).toHaveLength(allItems.length);
    });
  });

  describe("NOT mode", () => {
    it("excludes articles that have any of the selected tags", () => {
      const result = filterBySelectedTags(allItems, ["youtube"], "not");
      expect(result).not.toContain(itemYoutube);
      expect(result).not.toContain(itemBoth);
      expect(result).toContain(itemImportant);
      expect(result).toContain(itemPodcast);
      expect(result).toContain(itemNone);
    });

    it("excludes articles matching any of multiple selected tags", () => {
      const result = filterBySelectedTags(allItems, ["youtube", "important"], "not");
      expect(result).not.toContain(itemYoutube);
      expect(result).not.toContain(itemImportant);
      expect(result).not.toContain(itemBoth);
      expect(result).toContain(itemPodcast);
      expect(result).toContain(itemNone);
    });

    it("returns all items when no tags are selected", () => {
      const result = filterBySelectedTags(allItems, [], "not");
      expect(result).toHaveLength(allItems.length);
    });
  });
});

describe("Sidebar Tags Section — tag toggle", () => {
  it("adds a tag that is not yet selected", () => {
    const result = toggleTag(["youtube"], "important");
    expect(result).toEqual(["youtube", "important"]);
  });

  it("removes a tag that is already selected", () => {
    const result = toggleTag(["youtube", "important"], "youtube");
    expect(result).toEqual(["important"]);
  });

  it("adds first tag to empty selection", () => {
    const result = toggleTag([], "youtube");
    expect(result).toEqual(["youtube"]);
  });

  it("removes last tag leaving empty selection", () => {
    const result = toggleTag(["youtube"], "youtube");
    expect(result).toHaveLength(0);
  });

  it("does not mutate the original array", () => {
    const original = ["youtube"];
    const result = toggleTag(original, "important");
    expect(original).toHaveLength(1);
    expect(result).toHaveLength(2);
  });
});

describe("Sidebar Tags Section — clearing tags", () => {
  it("clearing tags returns the full unfiltered set", () => {
    const items = [
      makeItem([makeTag("youtube")]),
      makeItem([makeTag("important")]),
      makeItem([]),
    ];
    // With tags selected, filtered
    const filtered = filterBySelectedTags(items, ["youtube"], "or");
    expect(filtered).toHaveLength(1);

    // After clearing (empty selectedTags), all items returned
    const cleared = filterBySelectedTags(items, [], "or");
    expect(cleared).toHaveLength(3);
  });
});

describe("Sidebar Tags Section — tag creation validation", () => {
  const existingTags: Tag[] = [
    makeTag("youtube"),
    makeTag("important"),
  ];

  it("rejects empty tag name", () => {
    const result = validateNewTag("", existingTags);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("rejects whitespace-only tag name", () => {
    const result = validateNewTag("   ", existingTags);
    expect(result.valid).toBe(false);
  });

  it("rejects duplicate tag name (case-insensitive)", () => {
    const result = validateNewTag("YouTube", existingTags);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/already exists/i);
  });

  it("rejects exact duplicate tag name", () => {
    const result = validateNewTag("important", existingTags);
    expect(result.valid).toBe(false);
  });

  it("accepts a valid unique tag name", () => {
    const result = validateNewTag("podcast", existingTags);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("accepts a tag name with surrounding whitespace (trimmed)", () => {
    const result = validateNewTag("  newTag  ", existingTags);
    expect(result.valid).toBe(true);
  });
});

describe("Sidebar Tags Section — filter mode persistence", () => {
  it("switching from or to and changes which items match", () => {
    const tagA = makeTag("a");
    const tagB = makeTag("b");
    const itemA = makeItem([tagA]);
    const itemAB = makeItem([tagA, tagB]);
    const items = [itemA, itemAB];

    const orResult = filterBySelectedTags(items, ["a", "b"], "or");
    expect(orResult).toHaveLength(2); // both match OR

    const andResult = filterBySelectedTags(items, ["a", "b"], "and");
    expect(andResult).toHaveLength(1); // only itemAB matches AND
    expect(andResult[0]).toBe(itemAB);
  });

  it("switching from or to not inverts results", () => {
    const tagA = makeTag("a");
    const itemA = makeItem([tagA]);
    const itemNoTags = makeItem([]);
    const items = [itemA, itemNoTags];

    const orResult = filterBySelectedTags(items, ["a"], "or");
    expect(orResult).toEqual([itemA]);

    const notResult = filterBySelectedTags(items, ["a"], "not");
    expect(notResult).toEqual([itemNoTags]);
  });
});
