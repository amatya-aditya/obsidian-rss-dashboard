import { describe, expect, it } from "vitest";
import TurndownService from "turndown";
import {
  addYouTubeEmbedTurndownRule,
  parseYouTubeEmbedId,
  protectYouTubeEmbedsForMarkdown,
  replaceYouTubeEmbedsInHtmlNote,
  youTubeWatchUrl,
} from "../../../src/utils/youtube-embed";

const VIDEO_ID = "z9TFdTqkbPk";
const WATCH_URL = `https://www.youtube.com/watch?v=${VIDEO_ID}`;
const EMBED_LINE = `![](${WATCH_URL})`;
const WATCH_LINK = `[Watch on YouTube](${WATCH_URL})`;

function toMarkdown(html: string): string {
  const service = new TurndownService();
  addYouTubeEmbedTurndownRule(service);
  return service.turndown(protectYouTubeEmbedsForMarkdown(html));
}

describe("parseYouTubeEmbedId", () => {
  it.each([
    [`https://www.youtube.com/embed/${VIDEO_ID}`],
    [`https://youtube.com/embed/${VIDEO_ID}?rel=0`],
    [`https://www.youtube-nocookie.com/embed/${VIDEO_ID}`],
    [`  https://youtube-nocookie.com/embed/${VIDEO_ID}  `],
  ])("returns the video ID from %s", (src) => {
    expect(parseYouTubeEmbedId(src)).toBe(VIDEO_ID);
  });

  it.each([
    ["http scheme", `http://www.youtube.com/embed/${VIDEO_ID}`],
    ["another host", `https://evil.example/embed/${VIDEO_ID}`],
    [
      "a lookalike host",
      `https://www.youtube.com.evil.example/embed/${VIDEO_ID}`,
    ],
    ["a short ID", "https://www.youtube.com/embed/short"],
    ["a long ID", `https://www.youtube.com/embed/${VIDEO_ID}x`],
    ["a watch path", `https://www.youtube.com/watch?v=${VIDEO_ID}`],
    ["an empty value", ""],
    ["garbage", "not a url"],
  ])("rejects %s", (_name, src) => {
    expect(parseYouTubeEmbedId(src)).toBeNull();
  });
});

describe("youTubeWatchUrl", () => {
  it("builds the watch URL from the validated ID", () => {
    expect(youTubeWatchUrl(VIDEO_ID)).toBe(WATCH_URL);
  });
});

describe("YouTube embeds in saved Markdown", () => {
  it("writes the native embed on its own line, then the plain watch link", () => {
    const markdown = toMarkdown(
      `<p>Intro</p><div class="wrap"><iframe src="https://www.youtube.com/embed/${VIDEO_ID}"></iframe></div><p>Outro</p>`,
    );

    expect(markdown).toContain(`\n\n${EMBED_LINE}\n\n${WATCH_LINK}\n\n`);
    expect(markdown.indexOf("Intro")).toBeLessThan(
      markdown.indexOf(EMBED_LINE),
    );
    expect(markdown.indexOf(WATCH_LINK)).toBeLessThan(
      markdown.indexOf("Outro"),
    );
  });

  it("builds the embed from the validated ID, never from the feed's src or attributes", () => {
    const markdown = toMarkdown(
      `<iframe src="https://www.youtube.com/embed/${VIDEO_ID}?autoplay=1&evil=1" title="x" data-x="y"></iframe>`,
    );

    expect(markdown).toContain(EMBED_LINE);
    expect(markdown).not.toContain("autoplay");
    expect(markdown).not.toContain("evil");
  });

  it("handles two embeds in one article", () => {
    const other = "AAAAAAAAAAA";
    const markdown = toMarkdown(
      `<iframe src="https://www.youtube.com/embed/${VIDEO_ID}"></iframe><p>between</p><iframe src="https://www.youtube-nocookie.com/embed/${other}"></iframe>`,
    );

    expect(markdown).toContain(EMBED_LINE);
    expect(markdown).toContain(`![](https://www.youtube.com/watch?v=${other})`);
  });

  it.each([
    ["another host", "https://evil.example/embed/AAAAAAAAAAA"],
    ["a malformed ID", "https://www.youtube.com/embed/short"],
    ["a non-https source", `http://www.youtube.com/embed/${VIDEO_ID}`],
  ])("still drops an iframe with %s", (_name, src) => {
    const markdown = toMarkdown(`<p>keep</p><iframe src="${src}"></iframe>`);

    expect(markdown).toBe("keep");
  });
});

describe("YouTube embeds in a raw HTML note", () => {
  function noteHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    replaceYouTubeEmbedsInHtmlNote(doc);
    return doc.body.innerHTML;
  }

  it("places the embed and link between blocks, outside the HTML wrapper", () => {
    const html = noteHtml(
      `<p>Intro</p><div class="wrap"><div class="inner"><iframe src="https://www.youtube.com/embed/${VIDEO_ID}"></iframe></div></div><p>Outro</p>`,
    );

    expect(html).not.toContain("<iframe");
    expect(html).toContain(
      `</div></div>\n\n${EMBED_LINE}\n\n${WATCH_LINK}\n\n<p>Outro</p>`,
    );
  });

  // Known limit: the text goes after the top-level block, so an article wrapped in
  // one block shows the video at its end.
  it("places the embed after the single block that wraps the whole article", () => {
    const html = noteHtml(
      `<div class="post"><p>Intro</p><iframe src="https://www.youtube.com/embed/${VIDEO_ID}"></iframe><p>Outro</p></div>`,
    );

    expect(html).toBe(
      `<div class="post"><p>Intro</p><p>Outro</p></div>

${EMBED_LINE}

${WATCH_LINK}

`,
    );
  });

  it("replaces an iframe that is a direct child of the body in place", () => {
    const html = noteHtml(
      `<p>Intro</p><iframe src="https://www.youtube.com/embed/${VIDEO_ID}"></iframe><p>Outro</p>`,
    );

    expect(html).toBe(
      `<p>Intro</p>\n\n${EMBED_LINE}\n\n${WATCH_LINK}\n\n<p>Outro</p>`,
    );
  });

  it("drops an unrecognized iframe and leaves other content alone", () => {
    const html = noteHtml(
      `<p>keep</p><iframe src="https://evil.example/embed/AAAAAAAAAAA"></iframe>`,
    );

    expect(html).toBe("<p>keep</p>");
  });
});
