import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ReaderView } from "../../../src/views/reader-view";
import {
  FeedItem,
  RssDashboardSettings,
  DEFAULT_SETTINGS,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/full-article-fetch", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/utils/full-article-fetch")
  >("../../../src/utils/full-article-fetch");
  return { ...actual, fetchFullArticleContentWithOutcome: fetchMock };
});

installObsidianDomPolyfills();

class MockLeaf {
  constructor(public app: unknown) {}
  detach = vi.fn();
}

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Failing Reader Article",
    link: "https://example.com/failing",
    description: "<p>Reader fallback excerpt.</p>",
    content: "",
    pubDate: new Date().toISOString(),
    guid: "reader-failure-1",
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

const FULL_BODY = `<p>${"Fetched article body. ".repeat(30)}</p>`;

describe("ReaderView remembers a failed full-article fetch (#1110)", () => {
  let readerView: ReaderView;
  let onArticleUpdate: Mock<
    (item: FeedItem, updates: Partial<FeedItem>, rerender?: boolean) => void
  >;

  const banner = () =>
    (
      readerView as unknown as { readingContainer: HTMLElement }
    ).readingContainer.querySelector(".rss-reader-fetch-failure-banner");

  beforeEach(async () => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    fetchMock.mockResolvedValue({
      content: "",
      failureType: "network",
      failureReason: "timeout",
    });
    onArticleUpdate =
      vi.fn<
        (item: FeedItem, updates: Partial<FeedItem>, rerender?: boolean) => void
      >();
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
      onArticleUpdate,
    );
    (readerView as unknown as { contentEl: HTMLElement }).contentEl =
      createDiv();
    await readerView.onOpen();
  });

  it("records a timeout on the article, persists it, and shows Try again", async () => {
    const item = makeItem();
    await readerView.displayItem(item);

    expect(item.fullContentFetchFailure).toMatchObject({ reason: "timeout" });
    expect(onArticleUpdate).toHaveBeenCalledWith(
      item,
      { fullContentFetchFailure: item.fullContentFetchFailure },
      false,
    );
    expect(banner()?.textContent).toContain("timed out");
    expect(banner()?.querySelector("button")?.textContent).toBe("Try again");
  });

  it("does not fetch again when re-opening an article that failed before", async () => {
    const item = makeItem({
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await readerView.displayItem(item);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(banner()?.textContent).toContain("could not be loaded");
    expect(
      (
        readerView as unknown as { readingContainer: HTMLElement }
      ).readingContainer.querySelector(".rss-reader-article-content"),
    ).not.toBeNull();
  });

  it("remembers a Cloudflare block as blocked, names the refusal, and sets no paywall flag (#1347)", async () => {
    fetchMock.mockResolvedValue({
      content: "",
      failureType: "network",
      failureReason: "blocked",
    });
    const item = makeItem();
    await readerView.displayItem(item);

    expect(item.fullContentFetchFailure).toMatchObject({ reason: "blocked" });
    expect(item.restrictedReason).toBeUndefined();
    expect(banner()?.textContent).toContain("refused the request");
    expect(banner()?.querySelector("button")?.textContent).toBe("Try again");
    expect(
      (
        readerView as unknown as { readingContainer: HTMLElement }
      ).readingContainer.querySelector(".rss-reader-paywall-banner"),
    ).toBeNull();
  });

  it("re-fetches on Try again and clears the failure when the fetch succeeds", async () => {
    const item = makeItem({
      fullContentFetchFailure: { reason: "timeout", at: Date.now() },
    });
    await readerView.displayItem(item);
    fetchMock.mockResolvedValue({ content: FULL_BODY, failureType: "none" });

    banner()?.querySelector("button")?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(banner()).toBeNull());

    expect(item.fullContentFetchFailure).toBeUndefined();
    expect(onArticleUpdate).toHaveBeenCalledWith(
      item,
      { fullContentFetchFailure: undefined },
      false,
    );
  });

  it("records the failure again when Try again fails too", async () => {
    const item = makeItem({
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await readerView.displayItem(item);

    banner()?.querySelector("button")?.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(item.fullContentFetchFailure?.reason).toBe("timeout"),
    );
    expect(banner()).not.toBeNull();
  });

  it("leaves a restricted failure to the paywall banner", async () => {
    fetchMock.mockResolvedValue({ content: "", failureType: "restricted" });
    const item = makeItem();
    await readerView.displayItem(item);

    expect(item.fullContentFetchFailure).toBeUndefined();
    expect(banner()).toBeNull();
  });

  it("fetches again once the remembered failure is older than a day", async () => {
    const item = makeItem({
      fullContentFetchFailure: {
        reason: "network",
        at: Date.now() - 25 * 60 * 60 * 1000,
      },
    });
    fetchMock.mockResolvedValue({ content: FULL_BODY, failureType: "none" });
    await readerView.displayItem(item);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(item.fullContentFetchFailure).toBeUndefined();
    expect(banner()).toBeNull();
  });

  it("keeps Try again reachable when the article is also marked restricted", async () => {
    const item = makeItem({
      restrictedReason: "paywall or restricted",
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await readerView.displayItem(item);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(banner()).not.toBeNull();
  });

  it("shows only the failure banner, not the paywall banner, while a failure is remembered", async () => {
    const paywall = () =>
      (
        readerView as unknown as { readingContainer: HTMLElement }
      ).readingContainer.querySelector(".rss-reader-paywall-banner");
    const reopened = makeItem({
      restrictedReason: "paywall or restricted",
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await readerView.displayItem(reopened);

    expect(banner()).not.toBeNull();
    expect(paywall()).toBeNull();

    const freshlyFailed = makeItem({
      guid: "reader-failure-2",
      restrictedReason: "paywall or restricted",
    });
    await readerView.displayItem(freshlyFailed);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(banner()).not.toBeNull();
    expect(paywall()).toBeNull();
  });

  it("does not remember an error thrown by the fetch itself", async () => {
    fetchMock.mockRejectedValue(new Error("view closing"));
    const item = makeItem();
    await readerView.displayItem(item);

    expect(item.fullContentFetchFailure).toBeUndefined();
    expect(banner()).toBeNull();
  });

  it("remembers a failure that finishes after the user opened another article", async () => {
    let finish: (value: unknown) => void = () => undefined;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const a = makeItem({ guid: "a" });
    const pendingA = readerView.displayItem(a);
    fetchMock.mockResolvedValueOnce({
      content: FULL_BODY,
      failureType: "none",
    });
    await readerView.displayItem(
      makeItem({ guid: "b", link: "https://example.com/b" }),
    );
    finish({ content: "", failureType: "network", failureReason: "timeout" });
    await pendingA;

    expect(a.fullContentFetchFailure).toMatchObject({ reason: "timeout" });
  });

  it("does not remember a failure while the device is offline", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const item = makeItem();
    await readerView.displayItem(item);
    online.mockRestore();

    expect(item.fullContentFetchFailure).toBeUndefined();
  });

  it("drops an old failure when a later fetch answers with a restricted page", async () => {
    const item = makeItem({
      fullContentFetchFailure: {
        reason: "network",
        at: Date.now() - 25 * 60 * 60 * 1000,
      },
    });
    fetchMock.mockResolvedValue({ content: "", failureType: "restricted" });
    await readerView.displayItem(item);

    expect(item.fullContentFetchFailure).toBeUndefined();
  });

  it("disables Try again after the first click so a retry runs once", async () => {
    const item = makeItem({
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await readerView.displayItem(item);
    const button = banner()?.querySelector("button") as HTMLButtonElement;
    button.click();
    button.click();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(button.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a remembered failure when a later fetch returns an empty body", async () => {
    const item = makeItem({
      fullContentFetchFailure: {
        reason: "network",
        at: Date.now() - 25 * 60 * 60 * 1000,
      },
    });
    fetchMock.mockResolvedValue({ content: "", failureType: "none" });
    await readerView.displayItem(item);

    expect(item.fullContentFetchFailure).toBeDefined();
  });

  it("ignores Try again for a same-guid article from another feed", async () => {
    const item = makeItem({
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await readerView.displayItem(item);
    const other = makeItem({
      feedUrl: "https://other.example/rss.xml",
      fullContentFetchFailure: { reason: "network", at: Date.now() },
    });
    await (
      readerView as unknown as {
        retryFullArticleFetch: (entry: FeedItem) => Promise<void>;
      }
    ).retryFullArticleFetch(other);

    expect(other.fullContentFetchFailure).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
