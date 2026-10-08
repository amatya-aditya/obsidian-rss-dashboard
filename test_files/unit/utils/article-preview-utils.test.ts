import { describe, it, expect } from "vitest";
import type { FeedItem } from "../../../src/types/types";
import {
  extractFirstImageSrc,
  getArticlePreviewSummaryText,
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
  });
});
