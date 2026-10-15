/**
 * Regression tests for the dashboard inline reader's hero image (#1177).
 *
 * Bug: a feed whose only body image is a 1 by 1 tracking counter (for example
 * The Conversation's trailing `count.gif`) promoted that counter to the
 * article hero. The counter names no tracking-pixel URL fragment, so only its
 * declared size rejects it.
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
import * as obsidian from "obsidian";

installObsidianDomPolyfills();

const COUNTER = "https://counter.example.com/content/293076/count.gif";
const PHOTO = "https://img.example.com/photo.jpg";

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Roman fort in Wales",
    link: "https://theconversation.com/roman-fort-in-wales-293076",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "The Conversation",
    feedUrl: "https://theconversation.com/articles.atom",
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

describe("ArticleRenderer – hero image tracking counter", () => {
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

    // No network: the RSS content comes from the item fields only.
    const internal = renderer as unknown as ArticleRendererWithPrivate;
    internal.fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue({ content: "", failureType: "none" });

    container = document.body.appendChild(createDiv());
  });

  afterEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  const heroImg = () =>
    container.querySelector<HTMLImageElement>(".rss-reader-hero-slot img");

  it("does not use a 1 by 1 tracking counter from the feed body as the hero", async () => {
    const item = makeItem({
      content: `<p>Body text of the article.</p><img src="${COUNTER}" alt="The Conversation" width="1" height="1">`,
    });

    await renderer.render(container, item);

    expect(heroImg()).toBeNull();
  });

  it("uses the photo after a 1 by 1 tracking counter as the hero", async () => {
    const item = makeItem({
      content: `<img src="${COUNTER}" alt="The Conversation" width="1" height="1"><p><img src="${PHOTO}"></p>`,
    });

    await renderer.render(container, item);

    expect(heroImg()?.getAttribute("src")).toBe(PHOTO);
  });

  it("keeps a body image whose alt text mentions a pixel size", async () => {
    const item = makeItem({
      content: `<img src="${PHOTO}" alt="shown width=1 wide"><p>Body text of the article.</p>`,
    });

    await renderer.render(container, item);

    expect(heroImg()?.getAttribute("src")).toBe(PHOTO);
  });
});
