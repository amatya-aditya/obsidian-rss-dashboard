import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { RssDashboardView } from "../../../src/views/dashboard-view";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  robustFetchDetailed: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/article-list", () => ({
  ArticleList: class ArticleListMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    refilter(..._args: unknown[]): void {}
    setSelectedArticle(..._args: unknown[]): void {}
    hasArticle(..._args: unknown[]): boolean {
      return false;
    }
    insertArticleInPlace(..._args: unknown[]): boolean {
      return false;
    }
    removeArticleInPlace(..._args: unknown[]): void {}
    updateArticleInPlace(..._args: unknown[]): void {}
    setEmptyStateContext(..._args: unknown[]): void {}
    clearEmptyStateContext(..._args: unknown[]): void {}
    setSearchQuery(..._args: unknown[]): void {}
    clearSearchQuery(..._args: unknown[]): void {}
    updateRefreshButtonText(..._args: unknown[]): void {}
  },
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
    showEditFeedModal(..._args: unknown[]): void {}
  },
}));

vi.mock("../../../src/modals/feed-manager-modal", () => ({
  FeedManagerModal: class FeedManagerModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
  },
}));

vi.mock("../../../src/modals/mobile-navigation-modal", () => ({
  MobileNavigationModal: class MobileNavigationModalMock {
    constructor(..._args: unknown[]) {}
    open(): void {}
    close(): void {}
  },
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

vi.mock("../../../src/services/article-saver", () => ({
  ArticleSaver: class ArticleSaverMock {
    constructor(..._args: unknown[]) {}
    verifyAllSavedArticles(..._args: unknown[]): void {}
  },
}));

const FEED_URL = "https://example.com/feed";

function cloneSettings(focus: boolean): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.media.youtubeFocusMode = focus;
  return settings;
}

function makeItem(overrides: Partial<FeedItem>): FeedItem {
  return {
    title: "Item",
    link: `${FEED_URL}#0`,
    description: "<p>Excerpt</p>",
    pubDate: new Date().toISOString(),
    guid: `${FEED_URL}#0`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: FEED_URL,
    coverImage: "",
    ...overrides,
  };
}

function makeFeed(items: FeedItem[]): Feed {
  return {
    title: "Feed",
    url: FEED_URL,
    folder: "",
    items,
    lastUpdated: Date.now(),
  };
}

interface DashboardViewInternal {
  containerEl: HTMLElement;
  inlineArticle: FeedItem | null;
  selectedArticle: FeedItem | null;
  render(): void;
  setVideoFocusMode(enabled: boolean): void;
  setYouTubeFocusMode(enabled: boolean): void;
  actionToggleVideoFocusMode(): void;
  refreshTagColors(): void;
  createArticleRenderer(): void;
}

function makeView(
  settings: RssDashboardSettings,
  pluginOverrides: Record<string, unknown> = {},
): DashboardViewInternal {
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
    toggleVideoFocusMode: vi.fn(async () => true),
    ...pluginOverrides,
  };
  const leaf = {
    app,
    updateHeader: vi.fn(),
  } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(
    leaf,
    plugin as never,
  ) as unknown as DashboardViewInternal;
  view.containerEl.empty();
  view.containerEl.createDiv();
  view.containerEl.createDiv();
  document.body.appendChild(view.containerEl);
  // onOpen builds the renderer the inline Reader draws through.
  view.createArticleRenderer();
  return view;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

const video = (): FeedItem =>
  makeItem({
    guid: "video-1",
    mediaType: "video",
    videoId: "abcdefghijk",
    tags: [{ name: "Video", color: "#e11d48" }],
  });

describe("Dashboard inline Reader Video focus mode", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  async function openInline(
    focus: boolean,
    item: FeedItem,
  ): Promise<{ view: DashboardViewInternal; settings: RssDashboardSettings }> {
    const settings = cloneSettings(focus);
    settings.feeds = [makeFeed([item])];
    const view = makeView(settings);
    view.inlineArticle = item;
    view.selectedArticle = item;
    view.render();
    await flush();
    return { view, settings };
  }

  const header = (view: DashboardViewInternal): HTMLElement => {
    const el = view.containerEl.querySelector<HTMLElement>(
      ".inline-reader-header",
    );
    if (!el) throw new Error("No inline header");
    return el;
  };
  const chips = (view: DashboardViewInternal): string[] =>
    Array.from(
      view.containerEl.querySelectorAll(".rss-video-details .rss-reader-tag"),
    ).map((chip) => chip.textContent ?? "");

  it("shows the tag chips, source footer, and the full header when focus mode is off", async () => {
    const { view } = await openInline(false, video());

    expect(chips(view)).toEqual(["Video"]);
    expect(header(view).classList.contains("rss-video-focus")).toBe(false);
    expect(
      view.containerEl.querySelector(".rss-reader-source-footer"),
    ).not.toBeNull();
  });

  it("hides the chips and source footer and marks the header as focused when focus mode is on, keeping the back button", async () => {
    const { view } = await openInline(true, video());

    expect(chips(view)).toEqual([]);
    expect(view.containerEl.querySelector(".rss-video-details")).toBeNull();
    expect(
      view.containerEl.querySelector(".rss-reader-source-footer"),
    ).toBeNull();
    expect(header(view).classList.contains("rss-video-focus")).toBe(true);
    const backBtn = header(view).querySelector<HTMLButtonElement>(
      "button.rss-reader-back-button",
    );
    expect(backBtn).not.toBeNull();

    // Clicking the inline back button exits the inline reader
    backBtn?.click();
    expect(view.inlineArticle).toBeNull();
  });

  it("applies and removes focus mode live on the open video", async () => {
    const { view, settings } = await openInline(false, video());

    settings.media.youtubeFocusMode = true;
    view.setVideoFocusMode(true);
    expect(chips(view)).toEqual([]);
    expect(
      view.containerEl.querySelector(".rss-reader-source-footer"),
    ).toBeNull();
    expect(header(view).classList.contains("rss-video-focus")).toBe(true);

    settings.media.youtubeFocusMode = false;
    view.setVideoFocusMode(false);
    expect(chips(view)).toEqual(["Video"]);
    expect(
      view.containerEl.querySelectorAll(".rss-reader-source-footer"),
    ).toHaveLength(1);
    expect(header(view).classList.contains("rss-video-focus")).toBe(false);
  });

  it("moves focus to the inline back button when the source link was focused and focus mode turns on", async () => {
    const { view } = await openInline(false, video());

    const sourceLink = view.containerEl.querySelector<HTMLAnchorElement>(
      ".rss-reader-source-footer a",
    );
    expect(sourceLink).not.toBeNull();
    sourceLink?.focus();
    expect(document.activeElement).toBe(sourceLink);

    const backBtn = header(view).querySelector<HTMLButtonElement>(
      "button.rss-reader-back-button",
    );
    expect(backBtn).not.toBeNull();

    view.setVideoFocusMode(true);
    expect(
      view.containerEl.querySelector(".rss-reader-source-footer"),
    ).toBeNull();
    expect(document.activeElement).toBe(backBtn);

    // Turning focus mode off never moves focus
    const other = document.body.createEl("button");
    other.focus();
    view.setVideoFocusMode(false);
    expect(document.activeElement).toBe(other);
  });

  it("does not focus the header for an article while focus mode is on", async () => {
    const { view } = await openInline(
      true,
      makeItem({ guid: "article-1", mediaType: "article" }),
    );

    expect(header(view).classList.contains("rss-video-focus")).toBe(false);
    expect(
      view.containerEl.querySelector(".rss-reader-source-footer"),
    ).not.toBeNull();
  });

  it("delegates actionToggleVideoFocusMode to the plugin toggle", () => {
    const toggleSpy = vi.fn(async () => true);
    const settings = cloneSettings(false);
    const view = makeView(settings, { toggleVideoFocusMode: toggleSpy });

    view.actionToggleVideoFocusMode();

    expect(toggleSpy).toHaveBeenCalledTimes(1);
  });

  it("recolors the chips when tag colors change", async () => {
    const { view, settings } = await openInline(false, video());
    settings.availableTags = [{ name: "Video", color: "#0ea5e9" }];

    view.refreshTagColors();

    const chip = view.containerEl.querySelector<HTMLElement>(
      ".rss-video-details .rss-reader-tag",
    );
    expect(chip?.style.getPropertyValue("--tag-color")).toBe("#0ea5e9");
  });
});
