// The one helper behind the cover-image affordance (#1314, #1330): the four
// labels, their icons, the role each state runs, and the gate that decides
// whether the article is offered the control at all. The card control, the feed
// item control and the context menu all read this, so they cannot disagree.
import { describe, expect, it } from "vitest";
import {
  COVER_IMAGE_FETCH_ICON,
  COVER_IMAGE_RESTORE_ICON,
  resolveCoverImageOffer,
  type CoverImageAction,
} from "../../../../../src/components/article-list/utils/cover-image-action";

const PAGE_IMAGE = "https://page.example.com/hero.jpg";
const FEED_IMAGE = "https://img.example.com/feed.jpg";
const AVAILABLE = {
  hasFetcher: true,
  hasRestorer: true,
  showCoverImage: true,
};

function offer(
  article: Parameters<typeof resolveCoverImageOffer>[0],
  options: Parameters<typeof resolveCoverImageOffer>[1] = AVAILABLE,
): CoverImageAction | null {
  return resolveCoverImageOffer(article, options);
}

describe("resolveCoverImageOffer", () => {
  describe("the four-state table", () => {
    it("offers the fetch when the item has no cover", () => {
      expect(offer({ coverImage: "", link: "https://example.com/a" })).toEqual({
        label: "Fetch and replace cover image",
        icon: COVER_IMAGE_FETCH_ICON,
        role: "fetch",
      });
    });

    it("offers to replace a feed cover from the fetch", () => {
      expect(
        offer({ coverImage: FEED_IMAGE, link: "https://example.com/a" }),
      ).toEqual({
        label: "Replace cover image from the fetch",
        icon: COVER_IMAGE_FETCH_ICON,
        role: "fetch",
      });
    });

    it("offers the restore when the fetched cover displaced the feed's image", () => {
      expect(
        offer({
          coverImage: PAGE_IMAGE,
          coverImageFromPage: true,
          link: "https://example.com/a",
          content: `<p><img src="${FEED_IMAGE}"></p>`,
        }),
      ).toEqual({
        label: "Restore cover image from feed",
        icon: COVER_IMAGE_RESTORE_ICON,
        role: "restore",
      });
    });

    it("offers to remove the fetched cover when the feed supplies none", () => {
      expect(
        offer({
          coverImage: PAGE_IMAGE,
          coverImageFromPage: true,
          link: "https://example.com/a",
        }),
      ).toEqual({
        label: "Remove fetched cover image",
        icon: COVER_IMAGE_RESTORE_ICON,
        role: "restore",
      });
    });

    it("offers the fetch again when the item's cover was cleared", () => {
      expect(
        offer({
          coverImage: "",
          coverImageFromPage: true,
          content: `<p><img src="${FEED_IMAGE}"></p>`,
          link: "https://example.com/a",
        }),
      ).toMatchObject({
        label: "Fetch and replace cover image",
        role: "fetch",
      });
    });
  });

  describe("the gate", () => {
    const FETCHING = { coverImage: "", link: "https://example.com/a" };
    const RESTORING = {
      coverImage: PAGE_IMAGE,
      coverImageFromPage: true,
      link: "https://example.com/a",
      content: `<p><img src="${FEED_IMAGE}"></p>`,
    };

    it("offers nothing while cover images are hidden", () => {
      const hidden = { ...AVAILABLE, showCoverImage: false };
      expect(offer(FETCHING, hidden)).toBeNull();
      expect(offer(RESTORING, hidden)).toBeNull();
    });

    it("offers nothing for a role the dashboard does not supply", () => {
      expect(offer(FETCHING, { ...AVAILABLE, hasFetcher: false })).toBeNull();
      expect(offer(RESTORING, { ...AVAILABLE, hasRestorer: false })).toBeNull();
    });

    it("offers the fetch only for an http(s) article link", () => {
      for (const link of [
        "",
        "   ",
        "mailto:someone@example.com",
        "obsidian://open?vault=vault",
        "/relative/path",
      ]) {
        expect(offer({ coverImage: "", link }), link).toBeNull();
      }
      expect(
        offer({ coverImage: "", link: "  https://example.com/a  " }),
      ).not.toBeNull();
      expect(
        offer({ coverImage: "", link: "http://example.com/a" }),
      ).not.toBeNull();
    });

    it("offers the restore without an http(s) link, since it reads no page", () => {
      expect(offer({ ...RESTORING, link: "" })).toMatchObject({
        role: "restore",
      });
      expect(
        offer({ ...RESTORING, link: "mailto:someone@example.com" }),
      ).toMatchObject({
        role: "restore",
      });
    });
  });
});
