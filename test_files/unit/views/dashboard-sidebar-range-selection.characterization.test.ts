import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import * as ObsidianStubs from "../../stubs/obsidian";
import type RssDashboardPlugin from "../../../main";
import type {
  Feed,
  FeedItem,
  Folder,
  RssDashboardSettings,
} from "../../../src/types/types";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

interface RangeSelectionHarness {
  selectedFolders: string[];
  selectedFeeds: string[];
  currentFolder: string | null;
  currentFeed: Feed | null;
  selectedTags: string[];
  lastClickAnchorKey: string | null;
  inlineArticle: FeedItem | null;
  render: () => void;
  handleSidebarRangeSelect: (clickedKey: string, visibleKeys: string[]) => void;
}

function createFeed(url: string, folder = ""): Feed {
  return {
    url,
    title: url,
    folder,
    items: [],
    lastUpdated: 0,
  };
}

function createFolder(name: string, subfolders: Folder[] = []): Folder {
  return { name, subfolders };
}

function createView(
  feeds: Feed[],
  folders: Folder[] = [],
): RangeSelectionHarness {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  app.workspace = {
    on: vi.fn(),
    getLeavesOfType: vi.fn().mockReturnValue([]),
  } as unknown as App["workspace"];
  const leaf = {
    view: null,
    setViewState: vi.fn(),
  } as unknown as WorkspaceLeaf;
  const settings = {
    feeds,
    folders,
    display: {},
    availableTags: [],
    dashboardMultiFilters: {},
    articleFilter: { type: "age", value: 0 },
    viewStyle: "list",
  } as unknown as RssDashboardSettings;
  const plugin = {
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
  } as unknown as RssDashboardPlugin;
  const view = new RssDashboardView(
    leaf,
    plugin,
  ) as unknown as RangeSelectionHarness;
  view.render = vi.fn();
  return view;
}

describe("Dashboard sidebar range selection characterization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.empty();
    vi.restoreAllMocks();
  });

  it("selects every feed between two feed rows", () => {
    const first = createFeed("https://example.com/first.xml");
    const middle = createFeed("https://example.com/middle.xml");
    const last = createFeed("https://example.com/last.xml");
    const view = createView([first, middle, last]);
    view.lastClickAnchorKey = `feed:${first.url}`;

    view.handleSidebarRangeSelect(`feed:${last.url}`, [
      `feed:${first.url}`,
      `feed:${middle.url}`,
      `feed:${last.url}`,
    ]);

    expect(view.selectedFolders).toEqual([]);
    expect(view.selectedFeeds).toEqual([first.url, middle.url, last.url]);
    expect(view.currentFolder).toBeNull();
    expect(view.currentFeed).toBeNull();
  });

  it("promotes a folder when the range starts on its header and covers its feeds", () => {
    const first = createFeed("https://example.com/first.xml", "News");
    const second = createFeed("https://example.com/second.xml", "News");
    const view = createView([first, second], [createFolder("News")]);
    view.lastClickAnchorKey = "folder:News";

    view.handleSidebarRangeSelect(`feed:${second.url}`, [
      "folder:News",
      `feed:${first.url}`,
      `feed:${second.url}`,
    ]);

    expect(view.selectedFolders).toEqual(["News"]);
    expect(view.selectedFeeds).toEqual([]);
    expect(view.currentFolder).toBe("News");
    expect(view.currentFeed).toBeNull();
  });

  it("includes a folder's feeds when the range ends on its header", () => {
    const root = createFeed("https://example.com/root.xml");
    const first = createFeed("https://example.com/first.xml", "News");
    const second = createFeed("https://example.com/second.xml", "News");
    const view = createView([root, first, second], [createFolder("News")]);
    view.lastClickAnchorKey = `feed:${root.url}`;

    view.handleSidebarRangeSelect("folder:News", [
      `feed:${root.url}`,
      "folder:News",
      `feed:${first.url}`,
      `feed:${second.url}`,
    ]);

    expect(view.selectedFolders).toEqual(["News"]);
    expect(view.selectedFeeds).toEqual([root.url]);
    expect(view.currentFolder).toBeNull();
    expect(view.currentFeed).toBeNull();
  });

  it("keeps only the visible feeds from a partially covered expanded folder", () => {
    const first = createFeed("https://example.com/first.xml", "News");
    const second = createFeed("https://example.com/second.xml", "News");
    const third = createFeed("https://example.com/third.xml", "News");
    const view = createView([first, second, third], [createFolder("News")]);
    view.lastClickAnchorKey = "folder:News";

    view.handleSidebarRangeSelect(`feed:${second.url}`, [
      "folder:News",
      `feed:${first.url}`,
      `feed:${second.url}`,
      `feed:${third.url}`,
    ]);

    expect(view.selectedFolders).toEqual([]);
    expect(view.selectedFeeds).toEqual([first.url, second.url]);
  });

  it("promotes both a nested folder and its fully covered parent", () => {
    const parentFeed = createFeed("https://example.com/parent.xml", "News");
    const childFeed = createFeed(
      "https://example.com/releases.xml",
      "News/Releases",
    );
    const view = createView(
      [parentFeed, childFeed],
      [createFolder("News", [createFolder("Releases")])],
    );
    view.lastClickAnchorKey = "folder:News";

    view.handleSidebarRangeSelect(`feed:${childFeed.url}`, [
      "folder:News",
      `feed:${parentFeed.url}`,
      "folder:News/Releases",
      `feed:${childFeed.url}`,
    ]);

    expect(view.selectedFolders).toEqual(["News", "News/Releases"]);
    expect(view.selectedFeeds).toEqual([]);
    expect(view.currentFolder).toBeNull();
  });

  it("selects an empty folder that is explicitly inside the range", () => {
    const view = createView([], [createFolder("Empty")]);
    view.lastClickAnchorKey = "folder:Empty";

    view.handleSidebarRangeSelect("folder:Empty", ["folder:Empty"]);

    expect(view.selectedFolders).toEqual(["Empty"]);
    expect(view.selectedFeeds).toEqual([]);
    expect(view.currentFolder).toBe("Empty");
    expect(view.currentFeed).toBeNull();
  });

  it("keeps a feed selected when its recorded folder no longer exists", () => {
    const orphaned = createFeed("https://example.com/orphaned.xml", "Deleted");
    const view = createView([orphaned]);
    view.lastClickAnchorKey = `feed:${orphaned.url}`;

    view.handleSidebarRangeSelect(`feed:${orphaned.url}`, [
      `feed:${orphaned.url}`,
    ]);

    expect(view.selectedFolders).toEqual([]);
    expect(view.selectedFeeds).toEqual([orphaned.url]);
    expect(view.currentFolder).toBeNull();
    expect(view.currentFeed).toBe(orphaned);
  });

  it("updates the anchor without changing selection when the anchor is missing", () => {
    const feed = createFeed("https://example.com/feed.xml");
    const view = createView([feed]);
    view.selectedFolders = ["Existing"];
    view.selectedFeeds = ["https://example.com/existing.xml"];
    view.currentFolder = "Existing";
    view.selectedTags = ["Keep me"];
    view.lastClickAnchorKey = "feed:https://example.com/missing.xml";

    view.handleSidebarRangeSelect(`feed:${feed.url}`, [`feed:${feed.url}`]);

    expect(view.selectedFolders).toEqual(["Existing"]);
    expect(view.selectedFeeds).toEqual(["https://example.com/existing.xml"]);
    expect(view.currentFolder).toBe("Existing");
    expect(view.selectedTags).toEqual(["Keep me"]);
    expect(view.lastClickAnchorKey).toBe(`feed:${feed.url}`);
    expect(view.render).not.toHaveBeenCalled();
  });

  it("normalizes a reversed range and clears prior tag and inline selections", () => {
    const first = createFeed("https://example.com/first.xml");
    const second = createFeed("https://example.com/second.xml");
    const view = createView([first, second]);
    view.selectedTags = ["Clear me"];
    view.inlineArticle = {
      title: "Inline",
      link: "https://example.com/inline",
      description: "",
      pubDate: "",
      guid: "inline",
      feedTitle: "Inline",
      feedUrl: first.url,
      coverImage: "",
    };
    view.lastClickAnchorKey = `feed:${second.url}`;

    view.handleSidebarRangeSelect(`feed:${first.url}`, [
      `feed:${first.url}`,
      `feed:${second.url}`,
    ]);

    expect(view.selectedFeeds).toEqual([first.url, second.url]);
    expect(view.selectedTags).toEqual([]);
    expect(view.inlineArticle).toBeNull();
    expect(view.lastClickAnchorKey).toBe(`feed:${first.url}`);
    expect(view.render).toHaveBeenCalledOnce();
  });
});
