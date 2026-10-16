/**
 * Unit coverage for the Reader hero resolution (#1182).
 *
 * `resolveFallbackHeroUrl` is the shared entry point for an item's stored
 * fields, so it is the seam the issue's acceptance criteria name directly. The
 * end-to-end behaviour is covered in
 * `test_files/unit/views/reader-view-hero-tracking-pixel.test.ts`.
 */
import { describe, it, expect } from "vitest";

import type { Feed, FeedItem } from "../../../src/types/types";
import { resolveFallbackHeroUrl } from "../../../src/utils/reader-article-render";

const PIXEL = "https://img.example.com/pixel.gif";
const FORMULA = "https://s0.wp.com/latex.php?latex=%7Bx%7D";
const PHOTO = "https://img.example.com/photo.jpg";
const FEED_URL = "https://example.com/feed.xml";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Roman fort in Wales",
    link: "https://example.com/roman-fort",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example",
    feedUrl: FEED_URL,
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

function makeFeed(iconUrl: string): Feed {
  return {
    title: "Example",
    url: FEED_URL,
    folder: "RSS",
    items: [],
    lastUpdated: Date.now(),
    iconUrl,
  };
}

describe("resolveFallbackHeroUrl", () => {
  it("returns no hero when the only stored image is a tracking pixel", () => {
    expect(
      resolveFallbackHeroUrl(makeItem({ coverImage: PIXEL }), []),
    ).toBeUndefined();
  });

  it("skips a tracking pixel and takes the next stored image", () => {
    expect(
      resolveFallbackHeroUrl(makeItem({ coverImage: PIXEL, image: PHOTO }), []),
    ).toBe(PHOTO);
  });

  it("still skips a rendered formula image", () => {
    expect(
      resolveFallbackHeroUrl(
        makeItem({ coverImage: FORMULA, image: PHOTO }),
        [],
      ),
    ).toBe(PHOTO);
  });

  it("keeps an ordinary stored cover image", () => {
    expect(resolveFallbackHeroUrl(makeItem({ coverImage: PHOTO }), [])).toBe(
      PHOTO,
    );
  });

  it("returns no hero when the cover is the feed's own icon", () => {
    expect(
      resolveFallbackHeroUrl(makeItem({ coverImage: PHOTO }), [
        makeFeed(PHOTO),
      ]),
    ).toBeUndefined();
  });
});
