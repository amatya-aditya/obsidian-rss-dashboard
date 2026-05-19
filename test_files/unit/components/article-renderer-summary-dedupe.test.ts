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

import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  type FeedItem,
  type RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import * as obsidian from "obsidian";

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

interface ArticleRendererWithPrivate {
  render(container: HTMLElement, item: FeedItem): Promise<void>;
  fetchFullArticleContent: Mock<(url?: string) => Promise<string>>;
}

describe("ArticleRenderer – summary de-duplication", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    const mockApp = {
      workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
      vault: { getAbstractFileByPath: vi.fn() },
    } as unknown as obsidian.App;

    renderer = new ArticleRenderer({
      app: mockApp,
      settings: { ...DEFAULT_SETTINGS } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });

    // Prevent outbound HTTP — content comes from item fields only
    const rendererInternal = renderer as unknown as ArticleRendererWithPrivate;
    rendererInternal.fetchFullArticleContent = vi.fn().mockResolvedValue("");

    container = document.body.appendChild(document.createElement("div"));
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

    const rendererInternal = renderer as unknown as ArticleRendererWithPrivate;
    rendererInternal.fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);

    await renderer.render(container, item);

    const callout = container.querySelector(".rss-reader-description-callout");
    const heroImg = container.querySelector<HTMLImageElement>(
      ".rss-reader-hero-slot img",
    );
    const body = container.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );

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

  it("shows a placeholder in the feed description callout when the description is missing", async () => {
    const item = makeItem({
      description: "",
      content: "<p>Extended body paragraph that should still render in the article body.</p>",
    });

    await renderer.render(container, item);

    const callout = container.querySelector<HTMLElement>(
      ".rss-reader-description-callout",
    );
    const descriptionBody = container.querySelector<HTMLElement>(
      ".rss-reader-description-body",
    );
    const body = container.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );

    expect(callout).toBeTruthy();
    expect(descriptionBody?.textContent || "").toContain(
      "No feed description available.",
    );
    expect(body?.textContent || "").toContain(
      "Extended body paragraph that should still render in the article body.",
    );
  });

  it("shows the placeholder when the feed description is only an ellipsis placeholder", async () => {
    const item = makeItem({
      description: "<p>...</p>",
      content: "<p>Extended body paragraph that should still render in the article body.</p>",
    });

    await renderer.render(container, item);

    const descriptionBody = container.querySelector<HTMLElement>(
      ".rss-reader-description-body",
    );

    expect(descriptionBody?.textContent || "").toContain(
      "No feed description available.",
    );
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

    const rendererInternal = renderer as unknown as ArticleRendererWithPrivate;
    rendererInternal.fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);

    await renderer.render(container, item);

    const body = container.querySelector<HTMLElement>(
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

  it("keeps Substack picture media renderable by dropping comma-rich srcset URLs in article bodies", async () => {
    const longTailText =
      "Additional article context follows after the image with enough prose to satisfy the meaningful-content threshold used by the renderer. ".repeat(
        3,
      );
    const fetchedHtml = `
      <article>
        <p>Lead-in text before image.</p>
        <div class="captioned-image-container">
          <figure>
            <div class="image2-inset">
              <picture>
                <source
                  type="image/webp"
                  srcset="https://substackcdn.com/image/fetch/$s_!hPfO!,w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png 424w, https://substackcdn.com/image/fetch/$s_!hPfO!,w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png 848w"
                  sizes="100vw"
                >
                <img
                  src="https://substackcdn.com/image/fetch/$s_!hPfO!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png"
                  srcset="https://substackcdn.com/image/fetch/$s_!hPfO!,w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png 424w, https://substackcdn.com/image/fetch/$s_!hPfO!,w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png 848w"
                  sizes="100vw"
                  alt="Substack example"
                />
              </picture>
              <div class="image-link-expand">
                <button type="button" class="pencraft pc-reset pencraft icon-container restack-image"></button>
                <button type="button" class="pencraft pc-reset pencraft icon-container view-image"></button>
              </div>
            </div>
          </figure>
        </div>
        <p>Body text after image.</p>
        <p>${longTailText}</p>
      </article>
    `;

    const item = makeItem({
      title: "Substack media article",
      description: "",
      content: "",
      coverImage: "https://example.com/cover-image.jpg",
      link: "https://www.astralcodexten.com/p/the-sigmoids-wont-save-you",
    });

    const rendererInternal = renderer as unknown as ArticleRendererWithPrivate;
    rendererInternal.fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);

    await renderer.render(container, item);

    const body = container.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );
    const source = body?.querySelector("source");
    const img = body?.querySelector("img[alt='Substack example']");
    const decodedUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png";

    expect(body?.textContent || "").toContain("Lead-in text before image.");
    expect(body?.textContent || "").toContain("Body text after image.");
    expect(source?.getAttribute("srcset")).toContain(decodedUrl);
    expect(source?.getAttribute("srcset") || "").not.toContain(
      "substackcdn.com/image/fetch/",
    );
    expect(img?.getAttribute("srcset")).toContain(decodedUrl);
    expect(img?.getAttribute("srcset") || "").not.toContain(
      "substackcdn.com/image/fetch/",
    );
    expect(img?.getAttribute("src")).toBe(decodedUrl);
    expect(body?.querySelector(".image-link-expand")).toBeNull();
    expect(body?.querySelector("button.restack-image")).toBeNull();
    expect(body?.querySelector("button.view-image")).toBeNull();
  });

  it("preserves non-duplicate early Substack image blocks before the first substantial paragraph", async () => {
    const heroUrl =
      "https://substackcdn.com/image/fetch/$s_!hero!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fhero_1024x562.png";
    const firstBodyImageUrl =
      "https://substackcdn.com/image/fetch/$s_!hPfO!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png";
    const secondBodyImageUrl =
      "https://substackcdn.com/image/fetch/$s_!YDr_!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png";
    const decodedHeroUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/hero_1024x562.png";
    const decodedFirstBodyImageUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png";
    const decodedSecondBodyImageUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png";
    const longParagraph =
      "This longer paragraph represents the first substantial block of article text after a sequence of short intro paragraphs and image blocks. ".repeat(
        4,
      );

    const fetchedHtml = `
      <article>
        <p>Short intro paragraph before the first image.</p>
        <div class="captioned-image-container">
          <figure>
            <div class="image2-inset">
              <picture>
                <img src="${firstBodyImageUrl}" alt="First body image" />
              </picture>
            </div>
          </figure>
        </div>
        <p>Another short paragraph before the second image.</p>
        <div class="captioned-image-container">
          <figure>
            <div class="image2-inset">
              <picture>
                <img src="${secondBodyImageUrl}" alt="Second body image" />
              </picture>
            </div>
          </figure>
        </div>
        <p>${longParagraph}</p>
      </article>
    `;

    const item = makeItem({
      title: "Astral Codex style lead media",
      description: "",
      content: "",
      coverImage: heroUrl,
      link: "https://www.astralcodexten.com/p/the-sigmoids-wont-save-you",
    });

    const rendererInternal = renderer as unknown as ArticleRendererWithPrivate;
    rendererInternal.fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue(fetchedHtml);

    await renderer.render(container, item);

    const body = container.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );
    const heroImg = container.querySelector<HTMLImageElement>(
      ".rss-reader-hero-slot img",
    );

    expect(heroImg?.getAttribute("src")).toBe(decodedHeroUrl);
    expect(
      body?.querySelector(`img[src="${decodedFirstBodyImageUrl}"]`),
    ).toBeTruthy();
    expect(
      body?.querySelector(`img[src="${decodedSecondBodyImageUrl}"]`),
    ).toBeTruthy();
    expect(body?.textContent || "").toContain("first substantial block");
  });

  it("prefers feed content for custom-domain Substack items and skips full-article fetch", async () => {
    const feedImageUrl =
      "https://substackcdn.com/image/fetch/$s_!hPfO!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png";
    const decodedFeedImageUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/08b8bdc3-afab-4e51-a14e-b18d6374384c_513x478.png";
    const feedHtml = `
      <p>Feed article intro.</p>
      <div class="captioned-image-container">
        <figure>
          <a class="image-link image2 is-viewable-img" href="${feedImageUrl}" data-component-name="Image2ToDOM">
            <div class="image2-inset">
              <picture>
                <img src="${feedImageUrl}" alt="Feed image" />
              </picture>
            </div>
          </a>
        </figure>
      </div>
      <p>${"Longer feed body text that should remain in the rendered article. ".repeat(5)}</p>
    `;

    const item = makeItem({
      title: "Astral Codex custom-domain item",
      link: "https://www.astralcodexten.com/p/the-sigmoids-wont-save-you",
      feedUrl: "https://www.astralcodexten.com/feed",
      description: "<p>Short summary.</p>",
      content: feedHtml,
    });

    const rendererInternal = renderer as unknown as ArticleRendererWithPrivate;
    rendererInternal.fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Fetched content that should not be used.</p>");

    await renderer.render(container, item);

    const body = container.querySelector<HTMLElement>(
      ".rss-reader-article-content",
    );

    expect(rendererInternal.fetchFullArticleContent).not.toHaveBeenCalled();
    expect(body?.textContent || "").toContain("Feed article intro.");
    expect(
      container.querySelector(`img[src="${decodedFeedImageUrl}"]`),
    ).toBeTruthy();
    expect(body?.textContent || "").not.toContain(
      "Fetched content that should not be used.",
    );
  });
});
