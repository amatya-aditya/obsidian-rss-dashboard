import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { Component } from "obsidian";

installObsidianDomPolyfills();

function makeVideoItem(link: string): FeedItem {
  return {
    title: "Video without an id",
    link,
    description: "",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "inline-video-no-id-1297",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Video Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "video",
    saved: false,
  };
}

describe("ArticleRenderer video-id-not-found Watch on YouTube link (#1297)", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.empty();
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
    // The article body path is covered elsewhere; only the error row matters here.
    (
      renderer as unknown as { displayArticle: () => Promise<void> }
    ).displayArticle = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.empty();
  });

  async function renderError(link: string): Promise<Element | null> {
    await (
      renderer as unknown as {
        displayVideo: (c: HTMLElement, i: FeedItem) => Promise<void>;
      }
    ).displayVideo(container, makeVideoItem(link));
    return container.querySelector(".rss-reader-error");
  }

  it("omits the link when the feed link is not http(s)", async () => {
    const error = await renderError("javascript:alert(1)");
    expect(error?.textContent).toContain("Video id not found");
    expect(error?.querySelector("a")).toBeNull();
  });

  it("keeps the link for an http(s) feed link", async () => {
    const error = await renderError("https://example.com/watch");
    expect(error?.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/watch",
    );
  });
});
