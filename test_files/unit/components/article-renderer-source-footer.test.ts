import { beforeEach, describe, expect, it, vi } from "vitest";
import { Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
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

const LONG = "Sentence of article body text. ".repeat(12);
// A rich Substack body offers the fetched version on demand through a toggle.
const RICH_CONTENT = `<p>RSS body marker. ${LONG}</p><div class="captioned-image-container"><figure><a class="image-link image2 is-viewable-img" target="_blank" href="https://substackcdn.com/image/fetch/$s_!VrzG!,f_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Faaa_761x852.jpeg" data-component-name="Image2ToDOM"><div class="image2-inset"><picture><img src="https://substack-post-media.s3.amazonaws.com/public/images/aaa_761x852.jpeg" width="526" height="588" alt=""></picture></div></a></figure></div>`;
const FETCHED_BODY = `<p>Fetched body marker. ${LONG}</p>`;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Footer Article",
    link: "https://example.com/footer-article",
    description: "<p>Feed excerpt.</p>",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-footer-1",
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

describe("ArticleRenderer source footer (#1507)", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.empty();
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "none",
    });

    renderer = new ArticleRenderer({
      app: {
        workspace: { getLeavesOfType: vi.fn().mockReturnValue([]) },
        vault: { getAbstractFileByPath: vi.fn() },
      } as never,
      component: new Component(),
      settings: {
        ...DEFAULT_SETTINGS,
        corsProxyEnabled: false,
      } as RssDashboardSettings,
      onArticleSave: vi.fn(),
      onArticleUpdate: vi.fn(),
    });
    container = createDiv();
    document.body.appendChild(container);
  });

  it("appends the article's link after the content and before any banner", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: "",
      failureType: "restricted",
    });
    const item = makeItem();

    await renderer.render(container, item);

    const content = container.querySelector(".rss-reader-article-content");
    const footer = container.querySelector(FOOTER);
    const banner = container.querySelector(".rss-reader-paywall-banner");
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

  it("shows the footer once for the fetched-page version too", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: `<p>${"Fetched article body. ".repeat(30)}</p>`,
      failureType: "none",
    });

    await renderer.render(container, makeItem());

    expect(container.querySelectorAll(FOOTER).length).toBeGreaterThan(0);
    for (const footer of Array.from(container.querySelectorAll(FOOTER))) {
      expect(footer.querySelector("a")?.getAttribute("href")).toBe(
        "https://example.com/footer-article",
      );
    }
  });

  it("renders no footer for a link that is not http(s)", async () => {
    await renderer.render(
      container,
      makeItem({ link: "javascript:alert(1)", description: "<p>Body.</p>" }),
    );

    expect(container.textContent).toContain("Body.");
    expect(container.querySelector(FOOTER)).toBeNull();
  });

  it("keeps the footer on an item that shows the video-source banner", async () => {
    const item = makeItem({
      link: "https://www.bloomberg.com/news/videos/2025-05-12/sample-video",
      mediaContentType: "video/mp4",
    });

    await renderer.render(container, item);

    expect(container.querySelector(".rss-reader-video-banner")).not.toBeNull();
    expect(container.querySelector(`${FOOTER} a`)?.getAttribute("href")).toBe(
      item.link,
    );
  });

  it("shows the footer below a playable video", async () => {
    const item = makeItem({
      mediaType: "video",
      videoId: "dQw4w9WgXcQ",
      link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    await renderer.render(container, item);

    expect(container.querySelectorAll(FOOTER).length).toBe(1);
    expect(container.lastElementChild?.matches(FOOTER)).toBe(true);
  });

  it("shows the footer below a playable podcast", async () => {
    const item = makeItem({
      mediaType: "podcast",
      audioUrl: "https://example.com/episode.mp3",
    });

    await renderer.render(container, item);

    expect(container.querySelectorAll(FOOTER).length).toBe(1);
    expect(container.lastElementChild?.matches(FOOTER)).toBe(true);
  });

  it("shows exactly one footer when a video cannot play and falls back to the article", async () => {
    const item = makeItem({ mediaType: "video", videoId: undefined });

    await renderer.render(container, item);

    expect(container.querySelectorAll(FOOTER).length).toBe(1);
  });

  it("shows one footer in the RSS version and in the fetched version after switching", async () => {
    fetchFullArticleContentWithOutcomeMock.mockResolvedValue({
      content: FETCHED_BODY,
      failureType: "none",
    });

    await renderer.render(container, makeItem({ content: RICH_CONTENT }));
    const toggle = () =>
      container.querySelector<HTMLButtonElement>(".rss-reader-content-toggle")!;
    const expectOneFooter = () => {
      const panels = container.querySelectorAll(".rss-reader-content-version");
      expect(panels.length).toBe(1);
      expect(panels[0].querySelectorAll(FOOTER).length).toBe(1);
    };

    expectOneFooter();
    toggle().click();
    await vi.waitFor(() =>
      expect(toggle().textContent).toBe("Show RSS content"),
    );
    expect(container.textContent).toContain("Fetched body marker.");
    expectOneFooter();

    toggle().click();
    expect(container.textContent).toContain("RSS body marker.");
    expectOneFooter();
  });

  it("keeps the footer out of the content a save or copy reads", async () => {
    const item = makeItem({ content: "<p>Body text.</p>" });

    await renderer.render(container, item);

    const content = container.querySelector(".rss-reader-article-content");
    expect(content?.querySelector(FOOTER)).toBeNull();
    expect(content?.textContent).not.toContain("Source");
    expect(
      (renderer as unknown as { currentFullContent?: string })
        .currentFullContent,
    ).not.toContain("rss-reader-source-footer");
  });

  it("points the footer at the episode the podcast player switches to", async () => {
    await renderer.render(
      container,
      makeItem({
        mediaType: "podcast",
        audioUrl: "https://example.com/one.mp3",
      }),
    );
    const next = makeItem({
      mediaType: "podcast",
      audioUrl: "https://example.com/two.mp3",
      link: "https://example.com/episode-two",
      guid: "guid-footer-2",
    });

    const player = (
      renderer as unknown as {
        podcastPlayer: { onEpisodeSelected: (item: FeedItem) => void };
      }
    ).podcastPlayer;
    player.onEpisodeSelected(next);

    const anchors = container.querySelectorAll(`${FOOTER} a`);
    expect(anchors.length).toBe(1);
    expect(anchors[0].getAttribute("href")).toBe(
      "https://example.com/episode-two",
    );
  });
});
