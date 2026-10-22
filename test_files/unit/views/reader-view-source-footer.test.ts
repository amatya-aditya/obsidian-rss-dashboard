import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const fetchFullArticleContentWithOutcomeMock = vi.hoisted(() => vi.fn());

// The footer must show with either content version, so the fetch is controlled.
vi.mock("../../../src/utils/full-article-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch");

  return {
    ...actual,
    fetchFullArticleContentWithOutcome: fetchFullArticleContentWithOutcomeMock,
  };
});

installObsidianDomPolyfills();

const FOOTER = ".rss-reader-source-footer";

class MockLeaf {
  app: unknown;

  constructor(app: unknown) {
    this.app = app;
  }

  detach = vi.fn();
}

const LONG = "Sentence of article body text. ".repeat(12);
// A rich Substack body offers the fetched version on demand through a toggle.
const RICH_CONTENT = `<p>RSS body marker. ${LONG}</p><div class="captioned-image-container"><figure><a class="image-link image2 is-viewable-img" target="_blank" href="https://substackcdn.com/image/fetch/$s_!VrzG!,f_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Faaa_761x852.jpeg" data-component-name="Image2ToDOM"><div class="image2-inset"><picture><img src="https://substack-post-media.s3.amazonaws.com/public/images/aaa_761x852.jpeg" width="526" height="588" alt=""></picture></div></a></figure></div>`;
const FETCHED_BODY = `<p>Fetched body marker. ${LONG}</p>`;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Footer Reader Article",
    link: "https://example.com/footer-reader",
    description: "<p>Reader feed excerpt.</p>",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "reader-footer-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Reader Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ReaderView source footer (#1507)", () => {
  let readerView: ReaderView;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.empty();
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "none",
    });

    const mockApp = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: { getAbstractFileByPath: vi.fn() },
    };
    readerView = new ReaderView(
      new MockLeaf(mockApp) as never,
      {
        ...DEFAULT_SETTINGS,
        useWebViewer: false,
        corsProxyEnabled: false,
      } as RssDashboardSettings,
      {
        saveArticle: vi.fn(),
        checkSavedFileExists: vi.fn().mockReturnValue(true),
      } as never,
      vi.fn(),
      vi.fn(),
    );
    (readerView as unknown as { contentEl: HTMLElement }).contentEl =
      createDiv();
  });

  async function open(item: FeedItem): Promise<HTMLElement> {
    await readerView.onOpen();
    await readerView.displayItem(item);
    return (readerView as unknown as { readingContainer: HTMLElement })
      .readingContainer;
  }

  it("appends the article's link after the content and before any banner", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "restricted",
    });
    const item = makeItem();

    const reading = await open(item);

    const content = reading.querySelector(".rss-reader-article-content");
    const footer = reading.querySelector(FOOTER);
    const banner = reading.querySelector(".rss-reader-paywall-banner");
    expect(footer?.querySelector("a")?.getAttribute("href")).toBe(item.link);
    expect(
      content!.compareDocumentPosition(footer!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      footer!.compareDocumentPosition(banner!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows the footer for the fetched-page version too", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: `<p>${"Fetched article body. ".repeat(30)}</p>`,
      failureType: "none",
    });

    const reading = await open(makeItem());

    expect(reading.querySelectorAll(FOOTER).length).toBeGreaterThan(0);
    for (const footer of Array.from(reading.querySelectorAll(FOOTER))) {
      expect(footer.querySelector("a")?.getAttribute("href")).toBe(
        "https://example.com/footer-reader",
      );
    }
  });

  it("renders no footer for a link that is not http(s)", async () => {
    const reading = await open(
      makeItem({ link: "javascript:alert(1)", description: "<p>Body.</p>" }),
    );

    expect(reading.textContent).toContain("Body.");
    expect(reading.querySelector(FOOTER)).toBeNull();
  });

  it("keeps the footer on an item that shows the video-source banner", async () => {
    const item = makeItem({
      link: "https://www.bloomberg.com/news/videos/2025-05-12/sample-video",
      mediaContentType: "video/mp4",
    });

    const reading = await open(item);

    expect(reading.querySelector(".rss-reader-video-banner")).not.toBeNull();
    expect(reading.querySelector(`${FOOTER} a`)?.getAttribute("href")).toBe(
      item.link,
    );
  });

  it("shows the footer below a playable video", async () => {
    const reading = await open(
      makeItem({
        mediaType: "video",
        videoId: "dQw4w9WgXcQ",
        link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      }),
    );

    expect(reading.querySelectorAll(FOOTER).length).toBe(1);
    expect(reading.lastElementChild?.matches(FOOTER)).toBe(true);
  });

  it("shows the footer below a playable podcast", async () => {
    const reading = await open(
      makeItem({
        mediaType: "podcast",
        audioUrl: "https://example.com/episode.mp3",
      }),
    );

    expect(reading.querySelectorAll(FOOTER).length).toBe(1);
    expect(reading.lastElementChild?.matches(FOOTER)).toBe(true);
  });

  it("shows the footer below a playable video podcast", async () => {
    const reading = await open(
      makeItem({
        mediaType: "video",
        videoUrl: "https://example.com/episode.mp4",
      }),
    );

    expect(reading.querySelectorAll(FOOTER).length).toBe(1);
    expect(reading.lastElementChild?.matches(FOOTER)).toBe(true);
  });

  it("shows exactly one footer when a video cannot play and falls back to the article", async () => {
    const reading = await open(
      makeItem({ mediaType: "video", videoId: undefined }),
    );

    expect(reading.querySelectorAll(FOOTER).length).toBe(1);
  });

  it("shows one footer in the RSS version and in the fetched version after switching", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: FETCHED_BODY,
      failureType: "none",
    });

    const reading = await open(makeItem({ content: RICH_CONTENT }));
    const toggle = () =>
      reading.querySelector<HTMLButtonElement>(".rss-reader-content-toggle")!;
    const expectOneFooter = () => {
      const panels = reading.querySelectorAll(".rss-reader-content-version");
      expect(panels.length).toBe(1);
      expect(panels[0].querySelectorAll(FOOTER).length).toBe(1);
    };

    expectOneFooter();
    toggle().click();
    await vi.waitFor(() =>
      expect(toggle().textContent).toBe("Show RSS content"),
    );
    expect(reading.textContent).toContain("Fetched body marker.");
    expectOneFooter();

    toggle().click();
    expect(reading.textContent).toContain("RSS body marker.");
    expectOneFooter();
  });

  it("keeps the footer out of the content a save or copy reads", async () => {
    const reading = await open(makeItem({ content: "<p>Body text.</p>" }));

    const content = reading.querySelector(".rss-reader-article-content");
    expect(content?.querySelector(FOOTER)).toBeNull();
    expect(content?.textContent).not.toContain("Source");
    expect(
      (readerView as unknown as { currentFullContent?: string })
        .currentFullContent,
    ).not.toContain("rss-reader-source-footer");
  });

  it("points the footer at the episode the podcast player switches to", async () => {
    const reading = await open(
      makeItem({
        mediaType: "podcast",
        audioUrl: "https://example.com/one.mp3",
      }),
    );
    const next = makeItem({
      mediaType: "podcast",
      audioUrl: "https://example.com/two.mp3",
      link: "https://example.com/episode-two",
      guid: "reader-footer-2",
    });

    const player = (
      readerView as unknown as {
        podcastPlayer: { onEpisodeSelected: (item: FeedItem) => void };
      }
    ).podcastPlayer;
    player.onEpisodeSelected(next);

    const anchors = reading.querySelectorAll(`${FOOTER} a`);
    expect(anchors.length).toBe(1);
    expect(anchors[0].getAttribute("href")).toBe(
      "https://example.com/episode-two",
    );
  });
});
