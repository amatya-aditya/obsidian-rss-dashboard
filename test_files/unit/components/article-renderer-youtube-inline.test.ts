/**
 * Inline YouTube playback in the dashboard's inline reader (#1173).
 *
 * The inline reader renders article HTML through the same sanitizer as the
 * Reader, then upgrades a recognized YouTube embed to a click-to-play video
 * placeholder. Nothing is requested from YouTube or Obsidian's embed host until
 * the reader clicks play.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
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
import { __resetYouTubeInlinePlaybackAvailability } from "../../../src/utils/youtube-inline-embed";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import * as obsidian from "obsidian";

const VIDEO_ID = "z9TFdTqkbPk";
const EMBED_URL = `https://releases.obsidian.md/youtube?v=${VIDEO_ID}&autoplay=1`;
const EMBED_HTML = `<p>intro</p><iframe src="https://www.youtube.com/embed/${VIDEO_ID}?rel=0"></iframe><p>outro</p>`;

installObsidianDomPolyfills();

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article with a video",
    link: "https://example.com/article",
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss.xml",
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
  renderArticle(
    container: HTMLElement,
    item: FeedItem,
    fullContent?: string,
  ): void;
  currentContentIsFullArticle: boolean;
}

describe("ArticleRenderer ΓÇô inline YouTube video", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    __resetYouTubeInlinePlaybackAvailability();
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

    const internal = renderer as unknown as ArticleRendererWithPrivate;
    internal.fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue({ content: "", failureType: "none" });

    container = document.body.appendChild(createDiv());
  });

  afterEach(() => {
    obsidian.setRequestUrlHandler(null);
    document.body.empty();
    vi.clearAllMocks();
  });

  it("shows a click-to-play placeholder for a YouTube embed without requesting anything", async () => {
    const handler = vi.fn(() => ({ status: 200 }));
    obsidian.setRequestUrlHandler(handler);

    await renderer.render(container, makeItem({ content: EMBED_HTML }));

    const placeholder = container.querySelector(
      ".rss-reader-article-content .rss-youtube-embed",
    );
    expect(placeholder).not.toBeNull();
    expect(
      container.querySelector(".rss-reader-article-content iframe"),
    ).toBeNull();
    expect(
      placeholder
        ?.querySelector<HTMLButtonElement>(".rss-youtube-embed-play")
        ?.getAttribute("aria-label"),
    ).toBe("Play video: Article with a video");
    expect(
      placeholder?.querySelector(".rss-youtube-embed-watch")?.textContent,
    ).toContain("Watch on YouTube");
    expect(handler).not.toHaveBeenCalled();
  });

  it("plays the video from the embed host after a click and keeps the watch link", async () => {
    obsidian.setRequestUrlHandler(() => ({ status: 200 }));

    await renderer.render(container, makeItem({ content: EMBED_HTML }));
    container
      .querySelector<HTMLButtonElement>(".rss-youtube-embed-play")
      ?.click();

    await vi.waitFor(() => {
      expect(
        container.querySelector<HTMLIFrameElement>(
          ".rss-youtube-embed-player iframe",
        ),
      ).not.toBeNull();
    });
    const iframe = container.querySelector<HTMLIFrameElement>(
      ".rss-youtube-embed-player iframe",
    );
    expect(iframe?.getAttribute("src")).toBe(EMBED_URL);
    expect(container.querySelector(".rss-youtube-embed-watch")).not.toBeNull();
  });

  it("renders nothing for an iframe from another host", async () => {
    await renderer.render(
      container,
      makeItem({
        content: `<iframe src="https://evil.example/embed/${VIDEO_ID}"></iframe>`,
      }),
    );

    expect(container.querySelector(".rss-youtube-embed")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("keeps the plain watch link in the fetched full-article body", () => {
    const internal = renderer as unknown as ArticleRendererWithPrivate;
    internal.currentContentIsFullArticle = true;

    internal.renderArticle(
      container,
      makeItem({ content: "<p>feed teaser</p>" }),
      `<p>${"Body sentence. ".repeat(20)}</p><iframe src="https://www.youtube.com/embed/${VIDEO_ID}"></iframe>`,
    );

    expect(
      container.querySelector(".rss-reader-article-content .rss-youtube-embed"),
    ).toBeNull();
    expect(
      container.querySelector(
        ".rss-reader-article-content a[data-youtube-video-id]",
      ),
    ).not.toBeNull();
  });
});
