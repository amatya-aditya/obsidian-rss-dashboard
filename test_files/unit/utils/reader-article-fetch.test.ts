import { describe, expect, it, vi } from "vitest";
import { persistFetchedCoverImage } from "../../../src/utils/reader-article-fetch";
import type { Feed, FeedItem } from "../../../src/types/types";

const PAGE_IMAGE = "https://daily.jstor.org/wp-content/uploads/hero.jpg";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Ten Poems about Sleep and Dreaming",
    link: "https://daily.jstor.org/ten-poems-about-sleep-and-dreaming/",
    coverImage: "",
    ...overrides,
  } as FeedItem;
}

describe("persistFetchedCoverImage", () => {
  it("adopts the page image for an item with no picture", () => {
    const item = makeItem();
    const emit = vi.fn();

    persistFetchedCoverImage(item, PAGE_IMAGE, [], emit);

    expect(item.coverImage).toBe(PAGE_IMAGE);
    expect(emit).toHaveBeenCalledWith({ coverImage: PAGE_IMAGE });
  });

  it("keeps the feed's own cover image", () => {
    const item = makeItem({ coverImage: "https://cdn.example.com/feed.jpg" });
    const emit = vi.fn();

    persistFetchedCoverImage(item, PAGE_IMAGE, [], emit);

    expect(item.coverImage).toBe("https://cdn.example.com/feed.jpg");
    expect(emit).not.toHaveBeenCalled();
  });

  it("keeps the feed's item image", () => {
    const item = makeItem({ image: "https://cdn.example.com/item.jpg" });
    const emit = vi.fn();

    persistFetchedCoverImage(item, PAGE_IMAGE, [], emit);

    expect(emit).not.toHaveBeenCalled();
  });

  it("replaces a tracking pixel cover", () => {
    const item = makeItem({ coverImage: "https://t.example.com/pixel.gif" });
    const emit = vi.fn();

    persistFetchedCoverImage(item, PAGE_IMAGE, [], emit);

    expect(item.coverImage).toBe(PAGE_IMAGE);
  });

  it("does nothing when the page has no image", () => {
    const item = makeItem();
    const emit = vi.fn();

    persistFetchedCoverImage(item, undefined, [], emit);

    expect(item.coverImage).toBe("");
    expect(emit).not.toHaveBeenCalled();
  });

  it("skips a page image that is the feed's own icon", () => {
    const item = makeItem({ feedUrl: "https://daily.jstor.org/feed/" });
    const feeds = [
      { url: "https://daily.jstor.org/feed/", iconUrl: PAGE_IMAGE + "/" },
    ] as Feed[];
    const emit = vi.fn();

    persistFetchedCoverImage(item, PAGE_IMAGE, feeds, emit);

    expect(emit).not.toHaveBeenCalled();
  });

  it("skips a page image that is a tracking pixel", () => {
    const item = makeItem();
    const emit = vi.fn();

    persistFetchedCoverImage(item, "https://t.example.com/pixel.gif", [], emit);

    expect(emit).not.toHaveBeenCalled();
  });
});
