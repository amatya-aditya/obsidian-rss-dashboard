import { describe, it, expect } from "vitest";
import type { FeedItem } from "../../../src/types/types";
import {
  extractFirstImageSrc,
  getArticlePreviewSummaryText,
  resolveArticlePreviewImage,
  CARD_PREVIEW_SUMMARY_MAX_CHARS,
  looksLikeStylesheetText,
} from "../../../src/utils/article-preview-utils";

describe("article-preview-utils", () => {
  describe("extractFirstImageSrc", () => {
    it("extracts the src attribute of the first image tag", () => {
      const html =
        '<div><img src="https://example.com/image.png" alt="test" /></div>';
      expect(extractFirstImageSrc(html)).toBe("https://example.com/image.png");
    });

    it("returns null if no image is found", () => {
      const html = "<div><p>No image here</p></div>";
      expect(extractFirstImageSrc(html)).toBeNull();
    });

    it("returns null for tracking pixel URLs", () => {
      const html =
        '<img src="https://media.npr.org/include/images/tracking/npr-rss-pixel.png?story=123" />';
      expect(extractFirstImageSrc(html)).toBeNull();
    });

    it("returns null for other tracking pixel patterns", () => {
      expect(
        extractFirstImageSrc('<img src="https://example.com/pixel.gif" />'),
      ).toBeNull();
      expect(
        extractFirstImageSrc('<img src="https://example.com/beacon.png" />'),
      ).toBeNull();
      expect(
        extractFirstImageSrc('<img src="https://example.com/1x1.jpg" />'),
      ).toBeNull();
      expect(
        extractFirstImageSrc(
          '<img src="https://example.com/track/image.png" />',
        ),
      ).toBeNull();
    });

    it("returns null when article content contains only a WordPress LaTeX image", () => {
      const html =
        '<p>Formula <img class="latex" src="https://s0.wp.com/latex.php?latex=%7Bx%7D&amp;bg=ffffff" /></p>';
      expect(extractFirstImageSrc(html)).toBeNull();
    });

    it("skips a WordPress LaTeX image and selects the next article image", () => {
      const html = `
        <p><img class="latex" src="https://s0.wp.com/latex.php?latex=%7Bx%7D&amp;bg=ffffff" /></p>
        <figure><img src="https://example.com/article-photo.jpg" /></figure>
      `;
      expect(extractFirstImageSrc(html)).toBe(
        "https://example.com/article-photo.jpg",
      );
    });

    // #1169: a counter image carries no recognizable URL pattern, so the
    // tag's own declared size is what marks it as a tracking pixel.
    it.each([
      ["a 1 by 1 size", "1", "1"],
      ["a zero width", "0", "640"],
      ["a zero height", "640", "0"],
      ["a size written with a unit", "1px", "1px"],
      ["a fractional size", "1.5", "1.5"],
    ])("returns null for an image with %s", (_label, width, height) => {
      const html = `<img src="https://counter.example.com/content/123456/count.gif" width="${width}" height="${height}">`;
      expect(extractFirstImageSrc(html)).toBeNull();
    });

    it("returns null for a counter whose declared size is written without quotes", () => {
      const html =
        "<img src='https://counter.example.com/content/123456/count.gif' width=1 height=1>";
      expect(extractFirstImageSrc(html)).toBeNull();
    });

    it.each([
      ["a larger declared size", 'width="640" height="360"'],
      ["an unparseable declared size", 'width="100%" height="auto"'],
      ["no declared size", ""],
    ])("keeps an image with %s", (_label, attributes) => {
      const html = `<img src="https://example.com/article-photo.jpg" ${attributes}>`;
      expect(extractFirstImageSrc(html)).toBe(
        "https://example.com/article-photo.jpg",
      );
    });

    it("does not let a counter with a declared size hide a later photo", () => {
      const html = `
        <img src="https://counter.example.com/content/123456/count.gif" width="1" height="1">
        <figure><img src="https://example.com/article-photo.jpg" /></figure>
      `;
      expect(extractFirstImageSrc(html)).toBe(
        "https://example.com/article-photo.jpg",
      );
    });
  });

  describe("resolveArticlePreviewImage (#1169)", () => {
    const COUNTER = "https://counter.example.com/content/123456/count.gif";

    function item(overrides: Partial<FeedItem>): FeedItem {
      return { coverImage: "", image: "", ...overrides } as FeedItem;
    }

    it("returns undefined when the only content image is a 1 by 1 counter", () => {
      const article = item({
        content: `<p>An invented description of an invented discovery.</p><img src="${COUNTER}" width="1" height="1">`,
      });

      expect(
        resolveArticlePreviewImage(article, ["coverImage", "image"]),
      ).toBeUndefined();
    });

    it("still takes a stored image when the content holds only a counter", () => {
      const article = item({
        image: "https://example.com/article-photo.jpg",
        content: `<img src="${COUNTER}" width="1" height="1">`,
      });

      expect(resolveArticlePreviewImage(article, ["coverImage", "image"])).toBe(
        "https://example.com/article-photo.jpg",
      );
    });

    it("still takes a content image the tag declares larger than 1 by 1", () => {
      const article = item({
        content:
          '<img src="https://example.com/article-photo.jpg" width="640" height="360">',
      });

      expect(resolveArticlePreviewImage(article, ["coverImage", "image"])).toBe(
        "https://example.com/article-photo.jpg",
      );
    });
  });

  describe("looksLikeStylesheetText", () => {
    it("identifies css rules", () => {
      expect(
        looksLikeStylesheetText(".bh__table { border: 1px solid #C0C0C0; }"),
      ).toBe(true);
    });

    it("does not identify normal text", () => {
      expect(
        looksLikeStylesheetText(
          "This is a normal sentence with a colon: right here.",
        ),
      ).toBe(false);
    });
  });

  describe("getArticlePreviewSummaryText (#829)", () => {
    const BLURB =
      "A short publisher description that is comfortably long enough to pass.";
    const BODY =
      "<p>The article body starts with entirely different words and runs on for a good while.</p>";
    const make = (over: Partial<FeedItem>): FeedItem =>
      ({ title: "Headline", description: "", ...over }) as FeedItem;

    it("shows the item blurb ahead of the body when the item ships a body", () => {
      const item = make({ description: BLURB, content: BODY });
      expect(getArticlePreviewSummaryText(item)).toBe(BLURB);
    });

    it("prefers the blurb over summary when the item ships a body", () => {
      const item = make({
        description: BLURB,
        content: BODY,
        summary: "A stored summary derived from the body.",
      });
      expect(getArticlePreviewSummaryText(item)).toBe(BLURB);
    });

    it("strips an 'appeared first on' footer from the blurb", () => {
      const item = make({
        title: "Headline",
        description: `<p>${BLURB}</p><p>The post <a href="https://x.test/p">Headline</a> appeared first on <a href="https://x.test">Site</a>.</p>`,
        content: BODY,
      });
      expect(getArticlePreviewSummaryText(item)).toBe(BLURB);
    });

    it("falls back to the existing chain when the item has no body", () => {
      const item = make({
        description: BLURB,
        summary: "Stored summary text.",
      });
      expect(getArticlePreviewSummaryText(item)).toBe("Stored summary text.");
    });

    it("shows the blurb itself when it is the only text", () => {
      expect(getArticlePreviewSummaryText(make({ description: BLURB }))).toBe(
        BLURB,
      );
    });

    it("falls back when the blurb is shorter than the guard minimum", () => {
      const item = make({ description: "Too short.", content: BODY });
      expect(getArticlePreviewSummaryText(item)).toBe("Too short.");
    });

    it("falls back to summary when the blurb equals the title", () => {
      const title = "A headline that is long enough to pass the length guard";
      const item = make({
        title,
        description: title,
        content: BODY,
        summary: "Stored summary text.",
      });
      expect(getArticlePreviewSummaryText(item)).toBe("Stored summary text.");
    });

    it("falls back to summary when the blurb is only punctuation", () => {
      const item = make({
        description: "- ".repeat(30),
        content: BODY,
        summary: "Stored summary text.",
      });
      expect(getArticlePreviewSummaryText(item)).toBe("Stored summary text.");
    });

    it("falls back to the chain when the blurb restates the body's opening", () => {
      const item = make({
        description: BLURB,
        content: `<p>${BLURB} And then the article carries on with more.</p>`,
        summary: "Stored summary text.",
      });
      expect(getArticlePreviewSummaryText(item)).toBe("Stored summary text.");
    });

    it("clamps a long blurb to the preview limit with an ellipsis", () => {
      const item = make({
        description: "word ".repeat(200).trim(),
        content: BODY,
      });
      const text = getArticlePreviewSummaryText(item);
      expect(text).toHaveLength(CARD_PREVIEW_SUMMARY_MAX_CHARS);
      expect(text.endsWith("…")).toBe(true);
    });

    it("shows nothing when no field has usable text", () => {
      expect(getArticlePreviewSummaryText(make({}))).toBe("");
    });

    it("recomputes when a refresh rewrites the same item's blurb", () => {
      const item = make({ description: BLURB, content: BODY });
      expect(getArticlePreviewSummaryText(item)).toBe(BLURB);
      item.description =
        "Another publisher description, also long enough to pass.";
      expect(getArticlePreviewSummaryText(item)).toBe(item.description);
    });

    it("recomputes when a refresh rewrites the same item's summary", () => {
      const item = make({ summary: "<p>First summary text.</p>" });
      expect(getArticlePreviewSummaryText(item)).toBe("First summary text.");
      item.summary = "<p>Second summary text.</p>";
      expect(getArticlePreviewSummaryText(item)).toBe("Second summary text.");
    });

    it("returns the same text on repeated calls for an unchanged item", () => {
      const item = make({ summary: "<p>Stable summary text.</p>" });
      const first = getArticlePreviewSummaryText(item);
      expect(getArticlePreviewSummaryText(item)).toBe(first);
    });
  });
});
