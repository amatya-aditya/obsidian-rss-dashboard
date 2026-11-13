import { describe, expect, it } from "vitest";
import type { FeedItem } from "../../../src/types/types";
import {
  getArticleFilterSummaryText,
  getArticlePreviewSummaryText,
  resolveArticlePreviewImage,
} from "../../../src/utils/article-preview-utils";

describe("refresh enrichment card fallbacks", () => {
  it("uses each fallback independently and yields to later ordinary values", () => {
    const item = {
      title: "Article",
      link: "https://example.com/article",
      guid: "1",
      description: "",
      pubDate: "",
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
      refreshEnrichment: {
        url: "https://example.com/article",
        description: "Page description",
        image: "https://example.com/photo.jpg",
      },
    } satisfies FeedItem;
    expect(getArticlePreviewSummaryText(item)).toBe("Page description");
    expect(getArticleFilterSummaryText(item)).toBe("");
    expect(resolveArticlePreviewImage(item, ["coverImage", "image"])).toBe(
      "https://example.com/photo.jpg",
    );
    item.description = "Feed description";
    item.coverImage = "https://example.com/feed.jpg";
    expect(getArticlePreviewSummaryText(item)).toBe("Feed description");
    expect(resolveArticlePreviewImage(item, ["coverImage", "image"])).toBe(
      "https://example.com/feed.jpg",
    );
  });
});
