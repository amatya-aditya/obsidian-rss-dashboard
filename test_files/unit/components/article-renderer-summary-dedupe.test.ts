/**
 * Regression tests for summary de-duplication in ArticleRenderer.
 *
 * Bug: when description and content represent the same text but differ only by HTML
 * entity encoding (e.g. `&amp;` vs `&`), isEquivalentHtml incorrectly treats them
 * as distinct.  The renderer then shows the description as a callout AND also renders
 * the same text in the main body — the user sees the summary twice.
 *
 * RED tests (marked with "RED:") must FAIL before the fix and PASS after.
 * Control tests (marked with "CONTROL:") must PASS both before and after.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test Article",
    link: "https://example.com/article",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Test Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ArticleRenderer – summary de-duplication", () => {
  let renderer: any;
  let container: HTMLElement;

  beforeEach(() => {
    const mockApp = {
      workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
      vault: { getAbstractFileByPath: vi.fn() },
    };

    renderer = new ArticleRenderer({
      app: mockApp as any,
      settings: { ...DEFAULT_SETTINGS } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });

    // Prevent outbound HTTP — content comes from item fields only
    (renderer as any).fetchFullArticleContent = vi.fn().mockResolvedValue("");

    container = document.createElement("div");
    document.body.appendChild(container);
  });

  // ------------------------------------------------------------------ RED ---

  it("RED: no callout when description equals content except for HTML entity encoding", async () => {
    // "&amp;" (encoded) vs "&" (decoded) — same semantic text, should be treated as equivalent
    const item = makeItem({
      description: "<p>Rocks &amp; Minerals: a survey</p>",
      content: "<p>Rocks & Minerals: a survey</p>",
    });

    await renderer.render(container, item);

    const callout = container.querySelector(".rss-reader-description-callout");
    expect(callout).toBeNull();
  });

  it("RED: no callout when description equals content except for &quot; entity encoding", async () => {
    // &quot; (encoded) vs " (decoded) — same semantic text
    const item = makeItem({
      description: "<p>She said &quot;hello&quot; to everyone</p>",
      content: '<p>She said "hello" to everyone</p>',
    });

    await renderer.render(container, item);

    const callout = container.querySelector(".rss-reader-description-callout");
    expect(callout).toBeNull();
  });

  it("RED: no callout when description and content are whitespace-structurally different but same text", async () => {
    // Extra whitespace around inline elements — different raw strings, same visible text
    const item = makeItem({
      description: "<p>Hello   world</p>",
      content: "<p>Hello world</p>",
    });

    await renderer.render(container, item);

    const callout = container.querySelector(".rss-reader-description-callout");
    expect(callout).toBeNull();
  });

  it("RED: fetched full article keeps feed hero and strips duplicated lead stack from body", async () => {
    const summarySentence =
      '"Emily Hart" is a young, AI-created conservative woman who likes to take off her clothes.';
    const realBodySnippet = "Like many medical school students, Sam was broke.";
    const coverImageUrl = "https://cdn.example.com/hero.jpg";
    const iconUrl = "https://example.com/icon-nib.png";
    const fetchedHtml = `
      <h1>Indian med student rakes in thousands with AI-generated MAGA hottie</h1>
      <figure><img src="${iconUrl}" alt="stylized icon of a fountain pen nib" /></figure>
      <p>Truthiness</p>
      <p>${summarySentence}</p>
      <p>${realBodySnippet} ${"A longer body paragraph follows with more reporting detail. ".repeat(6)}</p>
    `;
    const item = makeItem({
      title:
        "Indian med student rakes in thousands with AI-generated MAGA hottie",
      description: `<p>${summarySentence}</p>`,
      content: "",
      coverImage: coverImageUrl,
      link: "https://arstechnica.com/tech-policy/2026/04/example/",
    });

    (renderer as any).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);

    await renderer.render(container, item);

    const callout = container.querySelector(".rss-reader-description-callout");
    const heroImg = container.querySelector(
      ".rss-reader-hero-slot img",
    ) as HTMLImageElement | null;
    const body = container.querySelector(
      ".rss-reader-article-content",
    ) as HTMLElement | null;

    expect(callout).toBeTruthy();
    expect(heroImg).toBeTruthy();
    expect(heroImg?.src).toBe(coverImageUrl);
    expect(body?.querySelector(`img[src="${iconUrl}"]`)).toBeNull();
    expect(body?.textContent || "").not.toContain("Truthiness");
    expect(body?.textContent || "").not.toContain(summarySentence);
    expect(body?.textContent || "").toContain(realBodySnippet);
  });

  // --------------------------------------------------------------- CONTROL ---

  it("CONTROL: renders both callout and body when description and content are genuinely distinct", async () => {
    const item = makeItem({
      description: "<p>Short summary only.</p>",
      content:
        "<p>Short summary only.</p><p>Extended body paragraph that is unique and clearly longer than the summary.</p>",
    });

    await renderer.render(container, item);

    const callout = container.querySelector(".rss-reader-description-callout");
    const body = container.querySelector(".rss-reader-article-content");
    expect(callout).toBeTruthy();
    expect(body).toBeTruthy();
  });

  it("CONTROL: renders only body (no callout) when description and content are byte-identical", async () => {
    const html = "<p>Exactly the same content.</p>";
    const item = makeItem({ description: html, content: html });

    await renderer.render(container, item);

    const callout = container.querySelector(".rss-reader-description-callout");
    expect(callout).toBeNull();
  });

  it("removes skip-link and lead media/caption duplicates while keeping kicker text", async () => {
    const descriptionText =
      "Google's new generation of Tensor AI chips is actually two chips, one for inference and one for training.";
    const captionText =
      "Google's TPU 8t chips were designed for training AI models, not running them.";
    const bodyText =
      "Most of the companies that have fully committed to building AI models are gobbling up every Nvidia AI accelerator they can get." +
      " Additional context follows with infrastructure details and architecture differences.".repeat(
        3,
      );
    const coverImageUrl =
      "https://cdn.arstechnica.net/wp-content/uploads/2026/04/TPU-8t-board-1152x648.jpg";

    const fetchedHtml = `
      <div id="readability-page-1" class="page">
        <div id="main">
          <article>
            <a class="skip-link" href="#main">Skip to content</a>
            <header>
              <p><span>A tale of two Tensors</span></p>
            </header>
            <a href="https://cdn.arstechnica.net/wp-content/uploads/2026/04/TPU-8t-board.jpg" target="_blank">
              <img
                src="https://cdn.arstechnica.net/wp-content/uploads/2026/04/TPU-8t-board.jpg"
                srcset="https://cdn.arstechnica.net/wp-content/uploads/2026/04/TPU-8t-board-1152x648.jpg 1152w"
                alt="TPU 8t chips on a board"
              />
            </a>
            <div id="caption-2151046">
              <p>${captionText}<span>Credit: Google</span></p>
            </div>
            <p>${captionText}<span>Credit: Google</span></p>
            <p>${bodyText}</p>
          </article>
        </div>
      </div>
    `;

    const item = makeItem({
      title: "Google unveils two new TPUs designed for the agentic era",
      description: `<p>${descriptionText}</p>`,
      content: "",
      coverImage: coverImageUrl,
      link: "https://arstechnica.com/ai/2026/04/google-unveils-two-new-tpus-designed-for-the-agentic-era/",
    });

    (renderer as any).fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);

    await renderer.render(container, item);

    const body = container.querySelector(
      ".rss-reader-article-content",
    ) as HTMLElement;
    const callout = container.querySelector(".rss-reader-description-callout");

    expect(body.querySelector("a[href='#main']")).toBeNull();
    expect(body.textContent || "").not.toContain("Skip to content");
    expect(body.querySelector("img[src*='TPU-8t-board']")).toBeNull();
    expect(body.querySelector("[id^='caption-']")).toBeNull();
    expect(body.textContent || "").not.toContain(captionText);
    expect(body.textContent || "").toContain("A tale of two Tensors");
    expect(body.textContent || "").toContain(
      "Most of the companies that have fully committed",
    );
    expect(callout).toBeTruthy();
  });
});
