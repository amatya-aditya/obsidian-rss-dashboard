import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";
import type { FeedMetadata, CategoryPath, DiscoverFilters } from "../../../src/types/discover-types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

const folderSelectorSpy = vi.hoisted(() => ({
  calls: [] as Array<{ anchorEl: HTMLElement; onSelect: (folderName: string) => void; listOnly?: boolean; defaultFolder?: string }>,
}));

const FEEDS_FIXTURE: FeedMetadata[] = [
  {
    id: "1",
    title: "Alpha Tech Blog",
    url: "https://alpha.example.com/rss.xml",
    imageUrl: "",
    domain: ["Technology"],
    subdomain: ["AI"],
    area: ["ML"],
    topic: ["LLMs"],
    tags: ["ai", "ml"],
    type: "Blog",
    summary: "Posts about LLMs",
  },
  {
    id: "2",
    title: "Beta News",
    url: "https://beta.example.com/rss.xml",
    imageUrl: "",
    domain: ["World"],
    subdomain: ["Politics"],
    area: ["US"],
    topic: ["Elections"],
    tags: ["news"],
    type: "News",
    summary: "Daily news",
  },
  {
    id: "3",
    title: "Gamma Podcast",
    url: "https://gamma.example.com/rss.xml",
    imageUrl: "",
    domain: ["Technology"],
    subdomain: ["Podcasts"],
    area: ["Software"],
    topic: ["Engineering"],
    tags: ["podcast", "dev"],
    type: "Podcast",
    summary: "Interviews",
  },
];

vi.mock("../../../src/discover/discover-feeds.json", () => ({
  default: FEEDS_FIXTURE,
}));

vi.mock("../../../src/components/folder-selector-popup", () => ({
  FolderSelectorPopup: class {
    constructor(
      _plugin: unknown,
      options: {
        anchorEl: HTMLElement;
        onSelect: (folderName: string) => void;
        listOnly?: boolean;
        defaultFolder?: string;
      },
    ) {
      folderSelectorSpy.calls.push(options);
    }
  },
}));

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function createView(opts?: {
  savedFilters?: Partial<DiscoverFilters> | null;
  followedUrls?: string[];
}) {
  const app = App.createMock();
  if (opts?.savedFilters) {
    app.saveLocalStorage("rss-discover-filters", opts.savedFilters);
  }

  const settings: RssDashboardSettings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.feeds = (opts?.followedUrls ?? []).map((url) => ({
    title: url,
    url,
    folder: "",
    items: [],
    lastUpdated: 0,
  }));

  const plugin = {
    settings,
    addFeed: vi.fn(async (title: string, url: string, folder: string) => {
      settings.feeds.push({
        title,
        url,
        folder,
        items: [],
        lastUpdated: Date.now(),
      });
      return true;
    }),
    ensureFolderExists: vi.fn(async () => undefined),
    saveSettings: vi.fn(async () => undefined),
    getActiveDashboardView: vi.fn(async () => null),
    activateSmallwebView: vi.fn(async () => undefined),
    activateView: vi.fn(async () => undefined),
  } as any;
  const leaf = new WorkspaceLeaf(app);

  const mod = await import("../../../src/views/discover-view");
  const view = new mod.DiscoverView(leaf as any, plugin);

  return { app, plugin, view };
}

describe("DiscoverView (P1-3)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    folderSelectorSpy.calls = [];
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("loadData() loads feeds, generates category map, and restores saved filters", async () => {
    const saved: Partial<DiscoverFilters> = {
      query: "technology",
      selectedTypes: ["Blog"],
      selectedTags: ["ai"],
      followStatus: "all",
    };
    const { view } = await createView({ savedFilters: saved });

    (view as any).loadData();

    expect((view as any).feeds).toHaveLength(3);
    expect((view as any).filters.query).toBe("technology");
    expect((view as any).filters.selectedTypes).toEqual(["Blog"]);
    expect((view as any).filters.selectedTags).toEqual(["ai"]);

    const categoryMap = (view as any).categoryMap;
    expect(categoryMap).toBeTruthy();
    expect(Object.keys(categoryMap.categories)).toEqual(expect.arrayContaining(["Technology", "World"]));

    const filtered = (view as any).filteredFeeds as FeedMetadata[];
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Alpha Tech Blog");
  });

  it("filterFeeds() applies query, type, tag, path, and follow-status filters", async () => {
    const { view } = await createView({ followedUrls: ["https://gamma.example.com/rss.xml"] });

    (view as any).feeds = FEEDS_FIXTURE;
    (view as any).filters = {
      query: "tech",
      selectedTypes: ["Podcast"],
      selectedPaths: [
        {
          domain: "Technology",
          subdomain: "Podcasts",
        } satisfies CategoryPath,
      ],
      selectedTags: ["dev"],
      followStatus: "followed",
    } satisfies DiscoverFilters;

    (view as any).filterFeeds();
    const filtered = (view as any).filteredFeeds as FeedMetadata[];
    expect(filtered.map((f) => f.id)).toEqual(["3"]);
  });

  it("filterFeeds(false) clamps currentPage when results shrink", async () => {
    const { view } = await createView();
    (view as any).feeds = FEEDS_FIXTURE;
    (view as any).pageSize = 1;
    (view as any).currentPage = 3;
    (view as any).filters = {
      query: "alpha",
      selectedTypes: [],
      selectedPaths: [],
      selectedTags: [],
      followStatus: "all",
    } satisfies DiscoverFilters;

    (view as any).filterFeeds(false);

    expect((view as any).filteredFeeds).toHaveLength(1);
    expect((view as any).currentPage).toBe(1);
  });

  it("saveFilterState() writes filters to local storage", async () => {
    const { app, view } = await createView();
    const spy = vi.spyOn(app, "saveLocalStorage");

    (view as any).filters = {
      query: "x",
      selectedTypes: ["News"],
      selectedPaths: [],
      selectedTags: ["news"],
      followStatus: "all",
    } satisfies DiscoverFilters;

    (view as any).saveFilterState();
    expect(spy).toHaveBeenCalledWith("rss-discover-filters", (view as any).filters);
  });

  it("renders an Add all... button next to the results count and opens the folder picker in list-only mode", async () => {
    const { view } = await createView();

    (view as any).loadData();
    view.render();

    const headerLeft = view.containerEl.querySelector(
      ".rss-discover-filter-header-left",
    ) as HTMLElement;
    const resultsCount = headerLeft.querySelector(
      ".rss-discover-results-count",
    ) as HTMLElement;
    const addAllButton = headerLeft.querySelector(
      ".rss-discover-add-all-btn",
    ) as HTMLButtonElement;

    expect(resultsCount.textContent).toBe("3 feeds found");
    expect(addAllButton.textContent).toContain("Add all...");

    addAllButton.click();

    expect(folderSelectorSpy.calls).toHaveLength(1);
    expect(folderSelectorSpy.calls[0].anchorEl).toBe(addAllButton);
    expect(folderSelectorSpy.calls[0].listOnly).toBe(true);
    expect(folderSelectorSpy.calls[0].defaultFolder).toBe("Uncategorized");
  });

  it("bulk add uses the full filtered feed set instead of only the current page", async () => {
    const { plugin, view } = await createView();

    (view as any).loadData();
    (view as any).pageSize = 1;
    (view as any).currentPage = 2;
    view.render();

    const addAllButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    ) as HTMLButtonElement;

    addAllButton.click();
    folderSelectorSpy.calls[0].onSelect("Uncategorized");
    await flushPromises();

    expect(plugin.addFeed).toHaveBeenCalledTimes(3);
    expect(plugin.addFeed).toHaveBeenNthCalledWith(
      1,
      "Alpha Tech Blog",
      "https://alpha.example.com/rss.xml",
      "Uncategorized",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { showNotice: false },
    );
    expect(plugin.addFeed).toHaveBeenNthCalledWith(
      2,
      "Beta News",
      "https://beta.example.com/rss.xml",
      "Uncategorized",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { showNotice: false },
    );
    expect(plugin.addFeed).toHaveBeenNthCalledWith(
      3,
      "Gamma Podcast",
      "https://gamma.example.com/rss.xml",
      "Uncategorized",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { showNotice: false },
    );
    expect(
      view.containerEl.querySelectorAll(".rss-discover-card-remove-btn").length,
    ).toBe(1);
    expect(
      view.containerEl.querySelectorAll(".rss-discover-card-add-to-btn").length,
    ).toBe(0);
  });

  it("bulk add only adds filtered feeds and skips feeds that are already followed", async () => {
    const { plugin, view } = await createView({
      followedUrls: ["https://beta.example.com/rss.xml"],
    });

    (view as any).loadData();
    (view as any).filters = {
      query: "",
      selectedTypes: [],
      selectedPaths: [
        {
          domain: "Technology",
        } satisfies CategoryPath,
      ],
      selectedTags: [],
      followStatus: "all",
    } satisfies DiscoverFilters;
    (view as any).filterFeeds();
    view.render();

    const addAllButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    ) as HTMLButtonElement;

    addAllButton.click();
    folderSelectorSpy.calls[0].onSelect("Research");
    await flushPromises();

    expect(plugin.addFeed).toHaveBeenCalledTimes(2);
    expect(plugin.addFeed).toHaveBeenNthCalledWith(
      1,
      "Alpha Tech Blog",
      "https://alpha.example.com/rss.xml",
      "Research",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { showNotice: false },
    );
    expect(plugin.addFeed).toHaveBeenNthCalledWith(
      2,
      "Gamma Podcast",
      "https://gamma.example.com/rss.xml",
      "Research",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { showNotice: false },
    );
  });

  it("bulk add summarizes added and skipped counts in a single notice", async () => {
    const { plugin, view } = await createView({
      followedUrls: ["https://beta.example.com/rss.xml"],
    });
    plugin.addFeed
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    (view as any).loadData();
    view.render();

    const addAllButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    ) as HTMLButtonElement;

    addAllButton.click();
    folderSelectorSpy.calls[0].onSelect("Uncategorized");
    await flushPromises();

    expect(console.log).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Added 1 feeds to "Uncategorized" (1 already followed, 1 failed)',
    );
  });
});

