// The inline reader (ArticleRenderer) shares the feed-first pipeline with the
// dedicated Reader. A rich Substack feed offers the fetched version on demand;
// a starred.json cached preview keeps its existing display-only path.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Component } from "obsidian";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  DEFAULT_SETTINGS,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => ({
  ...(await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch")),
  fetchFullArticleContentWithOutcome: fetchMock,
}));

installObsidianDomPolyfills();

const RSS_BODY = "RSS body marker.";
const LONG = "Sentence of article body text. ".repeat(12);
const RICH_CONTENT = `<p>${RSS_BODY} ${LONG}</p><div class="captioned-image-container"><figure><a class="image-link image2 is-viewable-img" target="_blank" href="https://substackcdn.com/image/fetch/$s_!VrzG!,f_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Faaa_761x852.jpeg" data-component-name="Image2ToDOM"><div class="image2-inset"><picture><img src="https://substack-post-media.s3.amazonaws.com/public/images/aaa_761x852.jpeg" width="526" height="588" alt=""></picture></div></a></figure></div>`;
const PLAIN_CONTENT = `<p>${RSS_BODY} ${LONG}</p>`;
const FETCHED_BODY = `<p>Fetched body marker. ${LONG}</p>`;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "The anti-American Right",
    link: "https://www.noahpinion.blog/p/the-anti-american-right",
    description: "",
    content: RICH_CONTENT,
    pubDate: "2024-03-05T10:20:30.000Z",
    guid: "guid-inline-on-demand-toggle",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Noahpinion",
    feedUrl: "https://noahpinion.substack.com/feed",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

describe("ArticleRenderer on-demand fetched-content toggle", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.empty();
    fetchMock.mockResolvedValue({ content: "", failureType: "none" });
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
    container = document.body.createDiv();
  });

  afterEach(() => {
    document.body.empty();
  });

  const toggle = () =>
    container.querySelector<HTMLButtonElement>(".rss-reader-content-toggle");

  it("offers the fetched version before fetching for a rich feed item", async () => {
    await renderer.render(container, makeItem());

    expect(toggle()).not.toBeNull();
    expect(toggle()?.textContent).toBe("Show fetched content");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(RSS_BODY);
  });

  it("does not gain the toggle for a rich starred-import cached preview", async () => {
    await renderer.render(
      container,
      makeItem({ starredImportContentState: "unfetched" }),
    );

    expect(toggle()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.textContent).toContain(RSS_BODY);
  });

  it("keeps the eager fetch for a starred-import preview whose body is plain", async () => {
    fetchMock.mockResolvedValue({
      content: FETCHED_BODY,
      failureType: "none",
    });

    await renderer.render(
      container,
      makeItem({
        content: PLAIN_CONTENT,
        starredImportContentState: "unfetched",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toggle()?.textContent).toBe("Show fetched content");
  });
});
