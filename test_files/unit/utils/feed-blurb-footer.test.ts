// Feed-blurb footer strip (#247 slice 3a, #677): removes the "The post … appeared
// first on …" style footer that WordPress and similar feeds append to an item
// blurb. Structural and conservative: only a trailing block that links to the
// item's own title is a footer; on ambiguity nothing is stripped.
import { describe, expect, it } from "vitest";
import { stripFeedBlurbFooter } from "../../../src/utils/feed-blurb-footer";

const TITLE = "Why we rebuilt the search index";
const BLURB =
  "<p>Search got slow as the corpus grew, so the team rewrote the indexer.</p>";

function strip(html: string, title: string = TITLE): string {
  return stripFeedBlurbFooter(html, title);
}

describe("stripFeedBlurbFooter", () => {
  describe("footers that are stripped", () => {
    it("strips the WordPress 'The post … appeared first on …' paragraph", () => {
      const footer = `<p>The post <a href="https://x.test/a">${TITLE}</a> appeared first on <a href="https://x.test">The Blog</a>.</p>`;
      expect(strip(BLURB + footer)).toBe(BLURB);
    });

    it("strips a footer without the leading 'The post' (boingboing)", () => {
      const footer = `<p><a href="https://x.test/a">${TITLE}</a> appeared first on <a href="https://x.test">Site</a>.</p>`;
      expect(strip(BLURB + footer)).toBe(BLURB);
    });

    it("strips a different verb (wpbeginner)", () => {
      const footer = `<p><a href="https://x.test/a">${TITLE}</a> first appeared on <a href="https://x.test">WPB</a>.</p>`;
      expect(strip(BLURB + footer)).toBe(BLURB);
    });

    it("strips custom wording by structure (css-tricks)", () => {
      const footer = `<p><a href="https://x.test/a">${TITLE}</a> originally handwritten and published with love on <a href="https://x.test">CSS-Tricks</a>. You should really get the newsletter as well.</p>`;
      expect(strip(BLURB + footer)).toBe(BLURB);
    });

    it("strips a paragraph holding only a link to the item's title (tecnoblog)", () => {
      const footer = `<p><a href="https://x.test/a">${TITLE}</a></p>`;
      expect(strip(BLURB + footer)).toBe(BLURB);
    });

    it("strips a second trailing link paragraph after the footer (macrumors)", () => {
      const footer = `<p><a href="https://x.test/a">${TITLE}</a> first appeared on <a href="https://x.test">MacRumors</a>.</p><p><a href="https://x.test/forum">Discuss this article</a> in our forums</p>`;
      expect(strip(BLURB + footer)).toBe(BLURB);
    });

    it("returns an empty string when the blurb is only the footer", () => {
      const footer = `<p>The post <a href="https://x.test/a">${TITLE}</a> appeared first on <a href="https://x.test">The Blog</a>.</p>`;
      expect(strip(footer)).toBe("");
    });

    it("matches the title ignoring case, curly quotes and whitespace", () => {
      const footer = `<p><a href="https://x.test/a">Don’t  PANIC</a> appeared first on <a href="https://x.test">S</a>.</p>`;
      expect(strip(BLURB + footer, "don't panic")).toBe(BLURB);
    });
  });

  describe("text that is left alone", () => {
    it.each([
      ["plain text", "A clean one-sentence blurb from the publisher."],
      ["empty", ""],
      ["a clean paragraph", BLURB],
      [
        "a WordPress truncation marker",
        "<p>Search got slow as the corpus grew […]</p>",
      ],
      [
        "a blurb that starts with an image figure",
        `<figure><img src="x.png"></figure><p>${TITLE} is a long story about indexes.</p>`,
      ],
    ])("%s is unchanged", (_label, html) => {
      expect(strip(html)).toBe(html);
    });

    it("does not strip a link whose text is not the item title", () => {
      const html = `${BLURB}<p>Read more at <a href="https://x.test/a">our site</a>.</p>`;
      expect(strip(html)).toBe(html);
    });

    it("does not strip a 'continue reading' link, even to the item's own URL", () => {
      const html = `${BLURB}<p><a href="https://x.test/a">Continue reading</a></p>`;
      expect(strip(html)).toBe(html);
    });

    it("does not strip mid-text, only a trailing block", () => {
      const html = `<p>See <a href="https://x.test/a">${TITLE}</a> for details.</p>${BLURB}`;
      expect(strip(html)).toBe(html);
    });

    it("does not strip a long paragraph that merely links the title", () => {
      const html = `${BLURB}<p>${"Real publisher prose that goes on. ".repeat(12)}<a href="https://x.test/a">${TITLE}</a></p>`;
      expect(strip(html)).toBe(html);
    });

    it("does nothing without a title to match", () => {
      const html = `${BLURB}<p>The post <a href="https://x.test/a">${TITLE}</a> appeared first on <a href="https://x.test">S</a>.</p>`;
      expect(strip(html, "")).toBe(html);
    });

    it("keeps a trailing link paragraph that is not after a footer", () => {
      const html = `${BLURB}<p><a href="https://x.test/forum">Discuss this article</a> in our forums</p>`;
      expect(strip(html)).toBe(html);
    });
  });
});
