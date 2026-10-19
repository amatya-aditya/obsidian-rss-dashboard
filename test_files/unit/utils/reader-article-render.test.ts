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
import {
  resolveFallbackHeroUrl,
  resolveFeedHeroUrl,
  resolveFetchedHeroUrl,
  resolvePageImageHeroUrl,
} from "../../../src/utils/reader-article-render";

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

describe("resolveFetchedHeroUrl (#812)", () => {
  const PAGE = "https://news.example.com/page-hero.jpg";
  const FEED_COVER = "https://news.example.com/feed-cover.jpg";

  it("prefers the page's own image over the feed's cover", () => {
    expect(
      resolveFetchedHeroUrl(
        makeItem({ pageImage: PAGE, coverImage: FEED_COVER }),
        [],
      ),
    ).toBe(PAGE);
  });

  it("falls back to the feed's cover chain when the page had no image", () => {
    expect(
      resolveFetchedHeroUrl(makeItem({ coverImage: FEED_COVER }), []),
    ).toBe(FEED_COVER);
  });

  it("skips a tracking pixel page image", () => {
    expect(
      resolveFetchedHeroUrl(
        makeItem({ pageImage: PIXEL, coverImage: FEED_COVER }),
        [],
      ),
    ).toBe(FEED_COVER);
  });

  it("skips a page image that is the feed's own icon", () => {
    expect(
      resolveFetchedHeroUrl(
        makeItem({ pageImage: PAGE, coverImage: FEED_COVER }),
        [makeFeed(PAGE)],
      ),
    ).toBe(FEED_COVER);
  });

  it("refuses a stored avatar page image and falls back to the feed cover (#1342)", () => {
    const avatar = "https://avatars.githubusercontent.com/u/78101617";
    expect(
      resolveFetchedHeroUrl(
        makeItem({ pageImage: avatar, coverImage: FEED_COVER }),
        [],
      ),
    ).toBe(FEED_COVER);
    expect(resolvePageImageHeroUrl(makeItem({ pageImage: avatar }), [])).toBe(
      undefined,
    );
  });

  it("returns no hero when neither the page nor the feed supplies one", () => {
    expect(resolveFetchedHeroUrl(makeItem(), [])).toBeUndefined();
  });
});

describe("resolvePageImageHeroUrl (#812)", () => {
  it("returns the stored page image", () => {
    expect(
      resolvePageImageHeroUrl(
        makeItem({ pageImage: PHOTO, coverImage: "https://x/feed.jpg" }),
        [],
      ),
    ).toBe(PHOTO);
  });

  it("returns undefined when the item has no page image", () => {
    expect(resolvePageImageHeroUrl(makeItem(), [])).toBeUndefined();
  });
});

describe("resolveFeedHeroUrl (#1354)", () => {
  const PAGE_COVER = "https://img.example.com/page-cover.jpg";
  const FEED_IMAGE = "https://img.example.com/feed-own.jpg";
  const FEED_BODY_IMAGE = "https://img.example.com/feed-body.jpg";

  it("keeps the displayed cover while the feed supplied it", () => {
    expect(resolveFeedHeroUrl(makeItem({ coverImage: PHOTO }), [])).toBe(PHOTO);
  });

  it("ignores a page-derived cover and takes the feed's own item image", () => {
    expect(
      resolveFeedHeroUrl(
        makeItem({
          coverImage: PAGE_COVER,
          coverImageFromPage: true,
          image: FEED_IMAGE,
        }),
        [],
      ),
    ).toBe(FEED_IMAGE);
  });

  it("recomputes the feed image from the blurb when that is where it lives", () => {
    expect(
      resolveFeedHeroUrl(
        makeItem({
          coverImage: PAGE_COVER,
          coverImageFromPage: true,
          content: `<p>Feed body text.</p><img src="${FEED_BODY_IMAGE}">`,
        }),
        [],
      ),
    ).toBe(FEED_BODY_IMAGE);
  });

  it("returns no hero when the feed supplies no image of its own", () => {
    expect(
      resolveFeedHeroUrl(
        makeItem({ coverImage: PAGE_COVER, coverImageFromPage: true }),
        [],
      ),
    ).toBeUndefined();
  });

  it("still excludes a displayed cover that is the feed's own icon", () => {
    expect(
      resolveFeedHeroUrl(makeItem({ coverImage: PHOTO }), [makeFeed(PHOTO)]),
    ).toBeUndefined();
  });

  it("leaves the fetched version's fallback on the displayed cover", () => {
    // The RSS hero ignores the page cover, but the fetched version still reads
    // it when the page declared no page image of its own.
    const item = makeItem({
      coverImage: PAGE_COVER,
      coverImageFromPage: true,
      image: FEED_IMAGE,
    });
    expect(resolveFallbackHeroUrl(item, [])).toBe(PAGE_COVER);
    expect(resolveFetchedHeroUrl(item, [])).toBe(PAGE_COVER);
  });
});
