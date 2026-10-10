import { describe, it, expect } from "vitest";
import { getArticlePreviewSummaryText } from "../../../src/utils/article-preview-utils";
import type { FeedItem } from "../../../src/types/types";

// Mirrors a stackoverflow.blog/feed/ item: empty <description>, no content:encoded.
function makeEmptyFeedItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "A Treatise on Model Oriented Programming Languages",
    link: "https://stackoverflow.blog/2026/10/09/a-treatise/",
    guid: "https://stackoverflow.blog/?p=1",
    description: "",
    content: "",
    summary: "",
    pubDate: "2026-10-09T00:00:00.000Z",
    ...overrides,
  } as FeedItem;
}

describe("getArticlePreviewSummaryText - publisherDescription fallback (#959)", () => {
  it("shows the reader-fetched publisherDescription when the feed gave no description", () => {
    const item = makeEmptyFeedItem({
      publisherDescription:
        "Why models, not objects, should drive language design.",
    });

    expect(getArticlePreviewSummaryText(item)).toBe(
      "Why models, not objects, should drive language design.",
    );
  });

  it("returns the updated text after a background metadata save changes publisherDescription", () => {
    const item = makeEmptyFeedItem();
    expect(getArticlePreviewSummaryText(item)).toBe("");

    item.publisherDescription = "Saved after the reader opened the article.";

    expect(getArticlePreviewSummaryText(item)).toBe(
      "Saved after the reader opened the article.",
    );
  });

  it("prefers publisherDescription over the feed summary, description and content", () => {
    const item = makeEmptyFeedItem({
      summary: "feed summary",
      description: "feed description",
      content: "<p>feed content</p>",
      publisherDescription: "page description",
    });

    expect(getArticlePreviewSummaryText(item)).toBe("page description");
  });

  it("keeps a guarded feed blurb ahead of publisherDescription so the preview does not flip (#888)", () => {
    const item = makeEmptyFeedItem({
      description:
        "A distinct feed blurb that summarises the post in a sentence.",
      content:
        "<p>The full article body, which is longer than the blurb above.</p>",
      publisherDescription: "page description",
    });

    expect(getArticlePreviewSummaryText(item)).toBe(
      "A distinct feed blurb that summarises the post in a sentence.",
    );
  });

  it("falls through to the feed text when publisherDescription is whitespace or stylesheet text", () => {
    const whitespace = makeEmptyFeedItem({
      summary: "feed summary",
      publisherDescription: "   ",
    });
    const css = makeEmptyFeedItem({
      summary: "feed summary",
      publisherDescription: ".hero { color: red; padding: 0 }",
    });

    expect(getArticlePreviewSummaryText(whitespace)).toBe("feed summary");
    expect(getArticlePreviewSummaryText(css)).toBe("feed summary");
  });

  it("stays blank when neither the feed nor the page supplied any text", () => {
    expect(getArticlePreviewSummaryText(makeEmptyFeedItem())).toBe("");
  });
});
