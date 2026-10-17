// Reader-level tests for #1238: the dedicated Reader (ReaderView) already uses
// the shared `src/utils/` reader helpers; these pin that it renders a fetched
// page the same way the inline reader (ArticleRenderer) now does, and that its
// image error listener drives the shared Substack recovery helper.
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import { DEFAULT_SETTINGS, FeedItem } from "../../../src/types/types";
import {
  IMAGE_ORIGINAL,
  IMAGE_WRAPPED,
  LONG_A,
  LONG_B,
  makeSharedHelpersItem,
  PAGE_METADATA,
} from "../reader-shared-helpers-fixtures";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { findContentToggle } from "../test-reader-toggle-helpers";

installObsidianDomPolyfills();

class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type ReaderViewTestHarness = {
  readingContainer: HTMLElement;
  currentDisplayTitle?: string;
  fetchFullArticleContent: ReturnType<typeof vi.fn>;
};

describe("ReaderView shared reader helpers (#1238)", () => {
  let view: ReaderView;
  let harness: ReaderViewTestHarness;
  let onArticleUpdate: Mock<
    (item: FeedItem, updates: Partial<FeedItem>, rerender?: boolean) => void
  >;

  beforeEach(async () => {
    activeDocument.body.empty();
    onArticleUpdate = vi.fn();
    const app = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: { getAbstractFileByPath: vi.fn() },
    };
    view = new ReaderView(
      new MockLeaf(app) as never,
      { ...DEFAULT_SETTINGS, useWebViewer: false, feeds: [] },
      { saveArticle: vi.fn(), checkSavedFileExists: vi.fn() } as never,
      vi.fn(),
      onArticleUpdate,
    );
    view.contentEl = createDiv();
    harness = view as unknown as ReaderViewTestHarness;
    await view.onOpen();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    activeDocument.body.empty();
  });

  /** Fetches `fetchedHtml`, opens the fetched version, and returns its body. */
  async function renderFetched(
    fetchedHtml: string,
    item: FeedItem = makeSharedHelpersItem(),
  ): Promise<HTMLElement> {
    harness.fetchFullArticleContent = vi.fn().mockResolvedValue({
      content: fetchedHtml,
      failureType: "none",
    });
    await view.displayItem(item);
    const toggle = findContentToggle(harness.readingContainer);
    expect(toggle).not.toBeNull();
    toggle?.click();
    const content = harness.readingContainer.querySelector(
      ".rss-reader-article-content",
    );
    if (!content) throw new Error("fetched version not rendered");
    return content as HTMLElement;
  }

  it.each([
    ["empty", ""],
    ["longer than 40 characters", "a".repeat(41)],
  ])(
    "keeps a breadcrumb list whose link text is %s instead of stripping it",
    async (_label, linkText) => {
      const body = await renderFetched(
        `<ul><li><a href="/">${linkText}</a></li><li><a href="/">${linkText}</a></li></ul>
         <p>${LONG_A}</p>
         <p>${LONG_B}</p>`,
      );

      expect(body.querySelector("ul")).not.toBeNull();
      expect(body.querySelectorAll("ul > li > a")).toHaveLength(2);
      if (linkText) expect(body.textContent).toContain(linkText);
      expect(body.textContent).toContain(LONG_A);
    },
  );

  it("rejects a page h1 past the tenth element as the display title", async () => {
    await renderFetched(
      `${"<span>s</span>".repeat(10)}<h1>A perfectly fine headline</h1>
       <p>${LONG_A}</p><p>${LONG_B}</p>`,
    );

    expect(harness.currentDisplayTitle).toBeUndefined();
  });

  it("rejects a boilerplate page h1 as the display title", async () => {
    await renderFetched(
      `<h1>Sign in to read this article</h1>
       <p>${LONG_A}</p><p>${LONG_B}</p>`,
    );

    expect(harness.currentDisplayTitle).toBeUndefined();
  });

  it("does not treat entity-only fetched markup as meaningful content", async () => {
    harness.fetchFullArticleContent = vi.fn().mockResolvedValue({
      content: `<p>${"&#32;".repeat(250)}</p>`,
      failureType: "none",
      pageMetadata: PAGE_METADATA,
    });

    await view.displayItem(makeSharedHelpersItem());

    expect(onArticleUpdate).not.toHaveBeenCalled();
  });

  it("recovers a failed Substack image whose recoverable URLs sit only in srcset", async () => {
    await view.displayItem(
      makeSharedHelpersItem({
        content: `<p>${LONG_A}</p>
          <picture><source srcset="${IMAGE_WRAPPED} 424w"><img srcset="${IMAGE_WRAPPED} 848w"></picture>
          <p>${LONG_B}</p>`,
      }),
    );
    const image = harness.readingContainer.querySelector<HTMLImageElement>(
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
