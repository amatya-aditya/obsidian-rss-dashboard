import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  getUnfilteredArticleScope,
  type ArticleScopeState,
} from "../../../src/services/article-scope";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import type {
  Feed,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const NEWS_A = "https://news-a.example";
const NEWS_B = "https://news-b.example";
const ROOT = "https://root.example";

function feed(url: string, folder: string): Feed {
  const item = {
    title: `${url} item`,
    link: `${url}/1`,
    guid: `${url}/1`,
    description: "",
    pubDate: new Date().toUTCString(),
    feedTitle: url,
    feedUrl: url,
    coverImage: "",
  } as FeedItem;
  return { url, title: url, folder, items: [item], lastUpdated: 0 };
}

// onOpen() renders the real sidebar, which needs a workspace stub and the
// display settings it reads for row layout.
function createView(): RssDashboardView {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  app.workspace = {
    on: vi.fn(),
    getLeavesOfType: vi.fn().mockReturnValue([]),
    onLayoutReady: vi.fn(),
  } as unknown as App["workspace"];
  const leaf = {
    view: null,
    setViewState: vi.fn(),
    app,
  } as unknown as WorkspaceLeaf;
  const settings = {
    feeds: [feed(NEWS_A, "News"), feed(NEWS_B, "News"), feed(ROOT, "")],
    folders: [{ name: "News", subfolders: [] }],
    display: {
      sidebarRowSpacing: 10,
      sidebarRowIndentation: 20,
      sidebarItemPaddingLeft: 2,
      sidebarItemPaddingRight: 2,
    },
    availableTags: [],
    dashboardMultiFilters: {},
    articleFilter: { type: "age", value: 0 },
    viewStyle: "list",
  } as unknown as RssDashboardSettings;
  const plugin = {
    app,
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
  } as unknown as RssDashboardPlugin;
  return new RssDashboardView(leaf, plugin);
}

describe("Dashboard Ctrl+click on a feed with a folder open", () => {
  let view: RssDashboardView;

  function click(selector: string, init: MouseEventInit = {}): void {
    const containerEl = (view as unknown as { containerEl: HTMLElement })
      .containerEl;
    const el = containerEl.querySelector<HTMLElement>(selector);
    expect(el).not.toBeNull();
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
  }

  const folderRow = '[data-folder-path="News"]';
  const feedRow = (url: string) => `[data-feed-url="${url}"]`;

  beforeEach(async () => {
    view = createView();
    await view.onOpen();
  });

  afterEach(() => {
    document.body.empty();
    vi.clearAllMocks();
  });

  it("adds the feed to the open folder instead of replacing it", () => {
    click(folderRow);
    click(feedRow(ROOT), { ctrlKey: true });

    expect(view.selectedFolders).toEqual(["News"]);
    expect(view.selectedFeeds).toEqual([ROOT]);
    const scopeState = (
      view as unknown as { getArticleScopeState(): ArticleScopeState }
    ).getArticleScopeState();
    expect(
      getUnfilteredArticleScope(scopeState)
        .map((item) => item.feedUrl)
        .sort(),
    ).toEqual([NEWS_A, NEWS_B, ROOT]);
  });

  it("removes a feed inside the open folder and keeps its siblings", () => {
    click(folderRow);
    click(feedRow(NEWS_A), { ctrlKey: true });

    expect(view.selectedFolders).toEqual([]);
    expect(view.selectedFeeds).toEqual([NEWS_B]);
  });

  it("does not bring the folder back after one of its feeds was removed", () => {
    click(folderRow);
    click(feedRow(NEWS_A), { ctrlKey: true });
    click(feedRow(ROOT), { ctrlKey: true });

    expect(view.selectedFolders).toEqual([]);
    expect(view.selectedFeeds).toEqual([NEWS_B, ROOT]);
  });

  it("does not treat a special view as a folder", () => {
    view.currentFolder = "starred";
    click(feedRow(ROOT), { ctrlKey: true });

    expect(view.selectedFolders).toEqual([]);
    expect(view.selectedFeeds).toEqual([ROOT]);
  });
});
