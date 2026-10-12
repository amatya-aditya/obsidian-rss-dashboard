import { describe, expect, it } from "vitest";
import type { FeedItem, SavedTemplate } from "../../../src/types/types";
import {
  clearTemplateAssignments,
  resolveSavedTemplateForArticle,
} from "../../../src/utils/saved-template-utils";

const item = { feedUrl: "https://example.com/feed" } as FeedItem;
const feedTemplate: SavedTemplate = {
  id: "feed",
  name: "Feed template",
  template: "feed",
};
const globalTemplate: SavedTemplate = {
  id: "global",
  name: "Global template",
  template: "global",
};

describe("resolveSavedTemplateForArticle", () => {
  it("uses the feed assignment before the global default", () => {
    expect(
      resolveSavedTemplateForArticle(
        item,
        [{ url: item.feedUrl, customTemplate: "feed" }],
        [feedTemplate, globalTemplate],
        "global",
      ),
    ).toBe(feedTemplate);
  });

  it("uses the global default when no valid feed assignment exists", () => {
    expect(
      resolveSavedTemplateForArticle(item, [], [globalTemplate], "global"),
    ).toBe(globalTemplate);
  });

  it("leaves standalone fallback selection when no saved default exists", () => {
    expect(
      resolveSavedTemplateForArticle(item, [], [], undefined),
    ).toBeUndefined();
  });
});

describe("clearTemplateAssignments", () => {
  it("clears only the feeds pointing at the deleted template", () => {
    const feeds = [
      { url: "https://a.example/feed", customTemplate: "t1" },
      { url: "https://b.example/feed", customTemplate: "t2" },
      { url: "https://c.example/feed" },
      { url: "https://d.example/feed", customTemplate: "t1" },
    ];

    expect(clearTemplateAssignments(feeds, "t1")).toBe(2);
    expect(feeds.map((feed) => feed.customTemplate)).toEqual([
      undefined,
      "t2",
      undefined,
      undefined,
    ]);
  });

  it("reports zero when no feed references the template", () => {
    const feeds = [{ url: "https://a.example/feed", customTemplate: "t2" }];
    expect(clearTemplateAssignments(feeds, "t1")).toBe(0);
    expect(feeds[0].customTemplate).toBe("t2");
  });
});
