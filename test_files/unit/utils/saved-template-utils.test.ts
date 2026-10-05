import { describe, expect, it } from "vitest";
import type { FeedItem, SavedTemplate } from "../../../src/types/types";
import { resolveSavedTemplateForArticle } from "../../../src/utils/saved-template-utils";

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
