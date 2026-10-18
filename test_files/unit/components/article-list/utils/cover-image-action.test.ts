// The wording and the availability gate the cover-image action's two entry
// points share (#1314). The gate lives here once, so the card control and the
// context menu cannot disagree about when the action is offered.
import { describe, expect, it } from "vitest";
import {
  canOfferCoverImageFetch,
  coverImageActionLabel,
} from "../../../../../src/components/article-list/utils/cover-image-action";

const AVAILABLE = { hasFetcher: true, showCoverImage: true };

describe("canOfferCoverImageFetch", () => {
  it("offers the action for an article with an http(s) link", () => {
    expect(
      canOfferCoverImageFetch({ link: "https://example.com/a" }, AVAILABLE),
    ).toBe(true);
    expect(
      canOfferCoverImageFetch({ link: "http://example.com/a" }, AVAILABLE),
    ).toBe(true);
  });

  it("accepts a link with surrounding whitespace, as the request does", () => {
    expect(
      canOfferCoverImageFetch({ link: "  https://example.com/a  " }, AVAILABLE),
    ).toBe(true);
  });

  it("offers nothing when the dashboard cannot fetch", () => {
    expect(
      canOfferCoverImageFetch(
        { link: "https://example.com/a" },
        { hasFetcher: false, showCoverImage: true },
      ),
    ).toBe(false);
  });

  it("offers nothing while cover images are hidden", () => {
    expect(
      canOfferCoverImageFetch(
        { link: "https://example.com/a" },
        { hasFetcher: true, showCoverImage: false },
      ),
    ).toBe(false);
  });

  it("offers nothing for a link that is not an http(s) page address", () => {
    for (const link of [
      "",
      "   ",
      "mailto:someone@example.com",
      "obsidian://open?vault=vault",
      "/relative/path",
    ]) {
      expect(canOfferCoverImageFetch({ link }, AVAILABLE), link).toBe(false);
    }
  });
});

describe("coverImageActionLabel", () => {
  it("offers to fetch when the item has no cover", () => {
    expect(coverImageActionLabel({ coverImage: "" })).toBe(
      "Fetch and replace cover image",
    );
  });

  it("offers to replace one the item already has", () => {
    expect(coverImageActionLabel({ coverImage: "https://cdn/x.jpg" })).toBe(
      "Replace cover image from the fetch",
    );
  });
});
