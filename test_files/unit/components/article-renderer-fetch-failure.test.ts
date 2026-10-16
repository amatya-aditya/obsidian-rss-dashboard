import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { ArticleRenderer } from "../../../src/components/article-renderer";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { Component } from "obsidian";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch");
  return { ...actual, fetchFullArticleContentWithOutcome: fetchMock };
});

installObsidianDomPolyfills();

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Failing Article",
    link: "https://example.com/failing",
    description: "<p>Fallback excerpt from feed.</p>",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "guid-failure-1",
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

const FULL_BODY = `<p>${"Fetched article body. ".repeat(30)}</p>`;

describe("ArticleRenderer remembers a failed full-article fetch (#1110)", () => {
  let renderer: ArticleRenderer;
  let container: HTMLElement;
  let onArticleUpdate: Mock<
    (item: FeedItem, updates: Partial<FeedItem>, rerender?: boolean) => void
  >;

  const banner = () =>
    container.querySelector(".rss-reader-fetch-failure-banner");

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.empty();
    fetchMock.mockResolvedValue({
      content: "",
      failureType: "network",
      failureReason: "timeout",
    });
    onArticleUpdate =
      vi.fn<
        (item: FeedItem, updates: Partial<FeedItem>, rerender?: boolean) => void
      >();
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
      onArticleUpdate,
    });
    container = document.body.createDiv();
  });

  it("records a timeout on the article, persists it, and shows Try again", async () => {
    const item = makeItem();
    await renderer.render(container, item);

    expect(item.fullContentFetchFailure).toMatchObject({ reason: "timeout" });
    expect(onArticleUpdate).toHaveBeenCalledWith(
      item,
      { fullContentFetchFailure: item.fullContentFetchFailure },
      false,
    );
    expect(banner()?.querySelector("button")?.textContent).toBe("Try again");
  });

  it("does not fetch again when re-opening an article that failed before", async () => {
    const item = makeItem({
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await renderer.render(container, item);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(banner()?.textContent).toContain("could not be loaded");
  });

  it("re-fetches on Try again and clears the failure when the fetch succeeds", async () => {
    const item = makeItem({
      fullContentFetchFailure: { reason: "timeout", at: Date.now() },
    });
    await renderer.render(container, item);
    fetchMock.mockResolvedValue({ content: FULL_BODY, failureType: "none" });

    banner()?.querySelector("button")?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(banner()).toBeNull());

    expect(item.fullContentFetchFailure).toBeUndefined();
  });

  it("fetches again once the remembered failure is older than a day", async () => {
    const item = makeItem({
      fullContentFetchFailure: {
        reason: "network",
        at: Date.now() - 25 * 60 * 60 * 1000,
      },
    });
    fetchMock.mockResolvedValue({ content: FULL_BODY, failureType: "none" });
    await renderer.render(container, item);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(item.fullContentFetchFailure).toBeUndefined();
    expect(banner()).toBeNull();
  });

  it("keeps Try again reachable when the article is also marked restricted", async () => {
    const item = makeItem({
      restrictedReason: "paywall or restricted",
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await renderer.render(container, item);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(banner()).not.toBeNull();
  });

  it("shows only the failure banner, not the paywall banner, while a failure is remembered", async () => {
    const paywall = () => container.querySelector(".rss-reader-paywall-banner");
    const reopened = makeItem({
      restrictedReason: "paywall or restricted",
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await renderer.render(container, reopened);

    expect(banner()).not.toBeNull();
    expect(paywall()).toBeNull();

    const freshlyFailed = makeItem({
      guid: "guid-failure-2",
      restrictedReason: "paywall or restricted",
    });
    await renderer.render(container, freshlyFailed);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(banner()).not.toBeNull();
    expect(paywall()).toBeNull();
  });

  it("does not remember an error thrown by the fetch itself", async () => {
    fetchMock.mockRejectedValue(new Error("view closing"));
    const item = makeItem();
    await renderer.render(container, item);

    expect(item.fullContentFetchFailure).toBeUndefined();
    expect(onArticleUpdate).not.toHaveBeenCalled();
  });

  it("renders a single failure banner when the same view asks twice", async () => {
    const item = makeItem({
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await renderer.render(container, item);
    (
      renderer as unknown as {
        renderFetchFailureBanner: (c: HTMLElement, i: FeedItem) => void;
      }
    ).renderFetchFailureBanner(container, item);

    expect(
      container.querySelectorAll(".rss-reader-fetch-failure-banner"),
    ).toHaveLength(1);
  });
});
