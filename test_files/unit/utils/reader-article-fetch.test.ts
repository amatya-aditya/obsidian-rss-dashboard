import { describe, expect, it, vi } from "vitest";
import {
  persistFetchedCoverImage,
  persistFetchedPageImage,
} from "../../../src/utils/reader-article-fetch";
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
  it("adopts the page image for an item with no picture, recording provenance", () => {
    const item = makeItem();
    const emit = vi.fn();

    persistFetchedCoverImage(item, PAGE_IMAGE, [], emit);

    expect(item.coverImage).toBe(PAGE_IMAGE);
    // The marker keeps the page-derived cover out of the RSS hero (#1354).
    expect(item.coverImageFromPage).toBe(true);
    expect(emit).toHaveBeenCalledWith({
      coverImage: PAGE_IMAGE,
      coverImageFromPage: true,
    });
  });

  it("keeps the feed's own cover image, recording no provenance", () => {
    const item = makeItem({ coverImage: "https://cdn.example.com/feed.jpg" });
    const emit = vi.fn();

    persistFetchedCoverImage(item, PAGE_IMAGE, [], emit);

    expect(item.coverImage).toBe("https://cdn.example.com/feed.jpg");
    expect(item.coverImageFromPage).toBeUndefined();
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

  it("skips a page image served by an avatar host (#1342)", () => {
    const item = makeItem();
    const emit = vi.fn();

    persistFetchedCoverImage(
      item,
      "https://avatars.githubusercontent.com/u/78101617",
      [],
      emit,
    );

    expect(item.coverImage).toBe("");
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("persistFetchedPageImage (#812)", () => {
  it("stores the page image even when the feed supplies its own picture", () => {
    const item = makeItem({
      coverImage: "https://cdn.example.com/feed.jpg",
      image: "https://cdn.example.com/item.jpg",
    });
    const emit = vi.fn();

    persistFetchedPageImage(item, PAGE_IMAGE, [], emit);

    expect(item.pageImage).toBe(PAGE_IMAGE);
    // The cover the card and RSS version read is untouched.
    expect(item.coverImage).toBe("https://cdn.example.com/feed.jpg");
    expect(emit).toHaveBeenCalledWith({ pageImage: PAGE_IMAGE });
  });

  it("keeps the first page image on a later fetch", () => {
    const item = makeItem({ pageImage: PAGE_IMAGE });
    const emit = vi.fn();

    persistFetchedPageImage(
      item,
      "https://cdn.example.com/other.jpg",
      [],
      emit,
    );

    expect(item.pageImage).toBe(PAGE_IMAGE);
    expect(emit).not.toHaveBeenCalled();
  });

  it("does nothing when the page has no image", () => {
    const item = makeItem();
    const emit = vi.fn();

    persistFetchedPageImage(item, undefined, [], emit);

    expect(item.pageImage).toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it("skips a page image that is a tracking pixel", () => {
    const item = makeItem();
    const emit = vi.fn();

    persistFetchedPageImage(item, "https://t.example.com/pixel.gif", [], emit);

    expect(emit).not.toHaveBeenCalled();
  });

  it("skips a page image that is the feed's own icon", () => {
    const item = makeItem({ feedUrl: "https://daily.jstor.org/feed/" });
    const feeds = [
      { url: "https://daily.jstor.org/feed/", iconUrl: PAGE_IMAGE + "/" },
    ] as Feed[];
    const emit = vi.fn();

    persistFetchedPageImage(item, PAGE_IMAGE, feeds, emit);

    expect(emit).not.toHaveBeenCalled();
  });

  it("skips a page image served by an avatar host (#1342)", () => {
    const item = makeItem();
    const emit = vi.fn();

    persistFetchedPageImage(
      item,
      "https://avatars.githubusercontent.com/u/78101617",
      [],
      emit,
    );

    expect(item.pageImage).toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });
});
