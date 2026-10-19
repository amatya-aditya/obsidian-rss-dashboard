/**
 * Regression tests for the dashboard inline reader's Fetched content hero
 * (#812). The fetched version shows the page's own declared image, ranked
 * above the feed's cover; the RSS version and the card keep the feed cover.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  type FeedItem,
  type RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import type { FullArticleFetchResult } from "../../../src/utils/fetch-helpers";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { findContentToggle } from "../test-reader-toggle-helpers";
import * as obsidian from "obsidian";

installObsidianDomPolyfills();

const PAGE_IMAGE = "https://page.example.com/hero.jpg";
const COVER_IMAGE = "https://img.example.com/feed-cover.jpg";
const LONG_TEXT = "Sentence of article body text. ".repeat(12);

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "The Photographer Who Preserved Everyday Architecture",
    link: "https://daily.jstor.org/the-photographer-who-preserved-everyday-architecture/",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "JSTOR Daily",
    feedUrl: "http://daily.jstor.org/feed/",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

interface ArticleRendererWithPrivate {
  fetchFullArticleContent: Mock<
    (url?: string) => Promise<FullArticleFetchResult>
  >;
}

describe("ArticleRenderer – fetched hero uses the page image (#812)", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    const mockApp = {
      workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
      vault: { getAbstractFileByPath: vi.fn() },
    } as unknown as obsidian.App;

    renderer = new ArticleRenderer({
      app: mockApp,
      component: new obsidian.Component(),
      settings: { ...DEFAULT_SETTINGS } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });

    container = document.body.appendChild(createDiv());
  });

  afterEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  const heroImg = () =>
    container.querySelector<HTMLImageElement>(".rss-reader-hero-slot img");

  it("uses the page's own image as the fetched hero, not the feed's cover", async () => {
    const internal = renderer as unknown as ArticleRendererWithPrivate;
    internal.fetchFullArticleContent = vi.fn().mockResolvedValue({
      content: `<p>${LONG_TEXT}</p>`,
      failureType: "none",
      pageImage: PAGE_IMAGE,
    });
    const item = makeItem({
      content: `<p>${LONG_TEXT}</p>`,
      coverImage: COVER_IMAGE,
    });

    await renderer.render(container, item);

    // The RSS version keeps the feed's cover.
    expect(heroImg()?.getAttribute("src")).toBe(COVER_IMAGE);

    findContentToggle(container)?.click();

    expect(heroImg()?.getAttribute("src")).toBe(PAGE_IMAGE);
    expect(item.pageImage).toBe(PAGE_IMAGE);
    expect(item.coverImage).toBe(COVER_IMAGE);
  });

  it("keeps the feed's cover as the fetched hero when the page declares none", async () => {
    const internal = renderer as unknown as ArticleRendererWithPrivate;
    internal.fetchFullArticleContent = vi.fn().mockResolvedValue({
      content: `<p>${LONG_TEXT}</p>`,
      failureType: "none",
    });
    const item = makeItem({
      content: `<p>${LONG_TEXT}</p>`,
      coverImage: COVER_IMAGE,
    });

    await renderer.render(container, item);
    findContentToggle(container)?.click();

    expect(heroImg()?.getAttribute("src")).toBe(COVER_IMAGE);
    expect(item.pageImage).toBeUndefined();
  });

  it("keeps the feed's own image as the RSS hero after a page cover fetch (#1354)", async () => {
    const internal = renderer as unknown as ArticleRendererWithPrivate;
    internal.fetchFullArticleContent = vi.fn().mockResolvedValue({
      content: `<p>${LONG_TEXT}</p>`,
      failureType: "none",
      pageImage: PAGE_IMAGE,
    });
    // The card's cover was replaced from the page; `image` holds the feed's own
    // picture, so the RSS version has a feed image to keep.
    const item = makeItem({
      content: `<p>${LONG_TEXT}</p>`,
      coverImage: PAGE_IMAGE,
      coverImageFromPage: true,
      image: COVER_IMAGE,
    });

    await renderer.render(container, item);

    expect(heroImg()?.getAttribute("src")).toBe(COVER_IMAGE);

    findContentToggle(container)?.click();

    expect(heroImg()?.getAttribute("src")).toBe(PAGE_IMAGE);
  });
});
