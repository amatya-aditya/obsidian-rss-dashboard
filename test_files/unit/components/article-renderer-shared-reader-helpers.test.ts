// Reader-level tests for #1238: the inline reader (ArticleRenderer) adopts the
// shared `src/utils/` reader helpers, so it cleans a fetched page exactly as
// the dedicated Reader (ReaderView) does. Each `it` here pins one behavior the
// migration changes, through the rendered reader rather than the util's own
// suite, because the util's characterization tests pin the util, not what the
// inline reader passes it.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  DEFAULT_SETTINGS,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import {
  IMAGE_ORIGINAL,
  IMAGE_WRAPPED,
  LONG_A,
  LONG_B,
  makeSharedHelpersItem,
  PAGE_METADATA,
} from "../reader-shared-helpers-fixtures";
import { findContentToggle } from "../test-reader-toggle-helpers";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => ({
  ...(await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch")),
  fetchFullArticleContentWithOutcome: fetchMock,
}));

installObsidianDomPolyfills();

describe("ArticleRenderer shared reader helpers (#1238)", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;
  let onArticleUpdate: Mock<
    (item: FeedItem, updates: Partial<FeedItem>, rerender?: boolean) => void
  >;

  beforeEach(() => {
    fetchMock.mockReset();
    document.body.empty();
    onArticleUpdate = vi.fn();
    renderer = new ArticleRenderer({
      app: {
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        vault: { getAbstractFileByPath: vi.fn() },
      } as never,
      component: new Component(),
      settings: { ...DEFAULT_SETTINGS } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate,
    });
    container = createDiv();
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.empty();
  });

  /** Fetches `fetchedHtml`, opens the fetched version, and returns its body. */
  async function renderFetched(
    fetchedHtml: string,
    item: FeedItem = makeSharedHelpersItem(),
  ): Promise<HTMLElement> {
    fetchMock.mockResolvedValue({ content: fetchedHtml, failureType: "none" });
    await renderer.render(container, item);
    const toggle = findContentToggle(container);
    expect(toggle).not.toBeNull();
    toggle?.click();
    const versions = container.querySelectorAll<HTMLElement>(
      ".rss-reader-content-version",
    );
    const full = versions[versions.length - 1];
    if (!full) throw new Error("fetched version not rendered");
    return full;
  }

  it.each([
    ["empty", ""],
    ["longer than 40 characters", "a".repeat(41)],
  ])(
    "keeps a breadcrumb list whose link text is %s instead of stripping it",
    async (_label, linkText) => {
      const full = await renderFetched(
        `<ul><li><a href="/">${linkText}</a></li><li><a href="/">${linkText}</a></li></ul>
         <p>${LONG_A}</p>
         <p>${LONG_B}</p>`,
      );
      const body = full.querySelector(".rss-reader-article-content");

      expect(body?.querySelector("ul")).not.toBeNull();
      expect(body?.querySelectorAll("ul > li > a")).toHaveLength(2);
      if (linkText) expect(body?.textContent).toContain(linkText);
      expect(body?.textContent).toContain(LONG_A);
    },
  );

  it("rejects a page h1 past the tenth element as the display title", async () => {
    const full = await renderFetched(
      `${"<span>s</span>".repeat(10)}<h1>A perfectly fine headline</h1>
       <p>${LONG_A}</p><p>${LONG_B}</p>`,
    );

    expect(full.querySelector(".rss-reader-item-title")?.textContent).toBe(
      "Feed title",
    );
  });

  it("rejects a boilerplate page h1 as the display title", async () => {
    const full = await renderFetched(
      `<h1>Sign in to read this article</h1>
       <p>${LONG_A}</p><p>${LONG_B}</p>`,
    );

    expect(full.querySelector(".rss-reader-item-title")?.textContent).toBe(
      "Feed title",
    );
  });

  it("does not treat entity-only fetched markup as meaningful content", async () => {
    const entityOnly = `<p>${"&#32;".repeat(250)}</p>`;
    fetchMock.mockResolvedValue({
      content: entityOnly,
      failureType: "none",
      pageMetadata: PAGE_METADATA,
    });

    await renderer.render(container, makeSharedHelpersItem());

    expect(onArticleUpdate).not.toHaveBeenCalled();
  });

  it("recovers a failed Substack image whose recoverable URLs sit only in srcset", async () => {
    await renderer.render(
      container,
      makeSharedHelpersItem({
        content: `<p>${LONG_A}</p>
          <picture><source srcset="${IMAGE_WRAPPED} 424w"><img srcset="${IMAGE_WRAPPED} 848w"></picture>
          <p>${LONG_B}</p>`,
      }),
    );
    const image = container.querySelector<HTMLImageElement>(
      "img.rss-reader-responsive-img",
    );
    const picture = image?.closest("picture");
    const source = picture?.querySelector("source");
    expect(image).not.toBeNull();
    expect(source).not.toBeNull();
    if (!image || !source) throw new Error("image fixture missing");

    // The render path already normalizes Substack srcset URLs, so restore the
    // raw markup the browser reports the load error against.
    source.setAttribute("srcset", `${IMAGE_WRAPPED} 424w`);
    image.setAttribute("srcset", `${IMAGE_WRAPPED} 848w`);

    image.dispatchEvent(new Event("error"));

    expect(source.getAttribute("srcset")).toContain(IMAGE_ORIGINAL);
    expect(image.getAttribute("srcset")).toContain(IMAGE_ORIGINAL);
  });
});
