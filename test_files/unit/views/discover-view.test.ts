import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import type {
  FeedMetadata,
  CategoryPath,
  DiscoverFilters,
} from "../../../src/types/discover-types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { DiscoverSidebar } from "../../../src/components/discover-sidebar";

const folderSelectorSpy = vi.hoisted(() => ({
  calls: [] as Array<{
    anchorEl: HTMLElement;
    onSelect: (folderName: string) => void;
    listOnly?: boolean;
    defaultFolder?: string;
  }>,
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
  {
    id: "4",
    title: "Delta YouTube",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=delta",
    imageUrl: "",
    domain: ["Education"],
    subdomain: ["Video"],
    area: ["Science"],
    topic: ["Physics"],
    tags: ["video", "science"],
    type: "YouTube",
    summary: "Channel updates",
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

interface TestPlugin {
  settings: RssDashboardSettings;
  ingestFeedsForBackgroundImport: ReturnType<typeof vi.fn>;
  ensureFolderExists: ReturnType<typeof vi.fn>;
  saveSettings: ReturnType<typeof vi.fn>;
  getActiveDashboardView: ReturnType<typeof vi.fn>;
  activateSmallwebView: ReturnType<typeof vi.fn>;
  activateView: ReturnType<typeof vi.fn>;
}

interface TestView {
  feeds: FeedMetadata[];
  filters: DiscoverFilters;
  categoryMap: { categories: Record<string, unknown> };
  filteredFeeds: FeedMetadata[];
  pageSize: number;
  currentPage: number;
  saveFilterState: () => void;
  filterFeeds: (resetPage?: boolean) => void;
  loadData: () => void;
  render: () => void;
  containerEl: HTMLElement;
}

async function createView(opts?: {
  savedFilters?: Partial<DiscoverFilters> | null;
  followedUrls?: string[];
}): Promise<{ app: App; plugin: TestPlugin; view: TestView }> {
  const app = new App();
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

  const plugin: TestPlugin = {
    settings,
    ingestFeedsForBackgroundImport: vi.fn(
      async (
        feeds: Array<{
          title: string;
          url: string;
          folder: string;
          mediaType?: "article" | "video" | "podcast";
        }>,
      ) => {
        settings.feeds.push(
          ...feeds.map((feed) => ({
            ...feed,
            items: [],
            lastUpdated: Date.now(),
          })),
        );
        return {
          addedCount: feeds.length,
          skippedCount: 0,
          queuedFeeds: settings.feeds,
        };
      },
    ),
    ensureFolderExists: vi.fn(async () => undefined),
    saveSettings: vi.fn(async () => undefined),
    getActiveDashboardView: vi.fn(async () => null),
    activateSmallwebView: vi.fn(async () => undefined),
    activateView: vi.fn(async () => undefined),
  };
  // WorkspaceLeaf is not generic, so cast only once here
  const leaf = new (WorkspaceLeaf as unknown as {
    new (app: App): WorkspaceLeaf;
  })(app);

  const mod = await import("../../../src/views/discover-view");
  const view = new mod.DiscoverView(
    leaf,
    plugin as unknown as ConstructorParameters<typeof mod.DiscoverView>[1],
  ) as unknown as TestView;

  return { app, plugin, view };
}

describe("DiscoverView (P1-3)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    folderSelectorSpy.calls = [];
    vi.restoreAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("loadData() loads feeds, generates category map, and restores saved filters", async () => {
    const saved: Partial<DiscoverFilters> = {
      query: "technology",
      selectedTypes: ["Blog"],
      selectedTags: ["ai"],
      followStatus: "all",
    };
    const { view } = await createView({ savedFilters: saved });

    view.loadData();

    expect(view.feeds).toHaveLength(4);
    expect(view.filters.query).toBe("technology");
    expect(view.filters.selectedTypes).toEqual(["Blog"]);
    expect(view.filters.selectedTags).toEqual(["ai"]);

    const categoryMap = view.categoryMap;
    expect(categoryMap).toBeTruthy();
    expect(Object.keys(categoryMap.categories)).toEqual(
      expect.arrayContaining(["Technology", "World"]),
    );

    const filtered = view.filteredFeeds;
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe("Alpha Tech Blog");
  });

  it("filterFeeds() applies query, type, tag, path, and follow-status filters", async () => {
    const { view } = await createView({
      followedUrls: ["https://gamma.example.com/rss.xml"],
    });

    view.feeds = FEEDS_FIXTURE;
    view.filters = {
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

    view.filterFeeds();
    const filtered = view.filteredFeeds;
    expect(filtered.map((f) => f.id)).toEqual(["3"]);
  });

  it("filterFeeds(false) clamps currentPage when results shrink", async () => {
    const { view } = await createView();
    view.feeds = FEEDS_FIXTURE;
    view.pageSize = 1;
    view.currentPage = 3;
    view.filters = {
      query: "alpha",
      selectedTypes: [],
      selectedPaths: [],
      selectedTags: [],
      followStatus: "all",
    } satisfies DiscoverFilters;

    view.filterFeeds(false);

    expect(view.filteredFeeds).toHaveLength(1);
    expect(view.currentPage).toBe(1);
  });

  it("saveFilterState() writes filters to local storage", async () => {
    const { app, view } = await createView();
    const spy = vi.spyOn(app, "saveLocalStorage");

    view.filters = {
      query: "x",
      selectedTypes: ["News"],
      selectedPaths: [],
      selectedTags: ["news"],
      followStatus: "all",
    } satisfies DiscoverFilters;

    view.saveFilterState();
    expect(spy).toHaveBeenCalledWith("rss-discover-filters", view.filters);
  });

  it("renders an Add all... button next to the results count and opens the folder picker in list-only mode", async () => {
    const { view } = await createView();

    view.loadData();
    view.render();

    const headerLeft = view.containerEl.querySelector(
      ".rss-discover-filter-header-left",
    );
    expect(headerLeft).not.toBeNull();
    if (!headerLeft) throw new Error("headerLeft not found");
    const resultsCount = headerLeft.querySelector(
      ".rss-discover-results-count",
    );
    expect(resultsCount).not.toBeNull();
    if (!resultsCount) throw new Error("resultsCount not found");
    const addAllButton = headerLeft.querySelector(".rss-discover-add-all-btn");
    expect(addAllButton).not.toBeNull();
    if (!addAllButton) throw new Error("addAllButton not found");

    expect(resultsCount.textContent).toBe("4 feeds found");
    expect((addAllButton as HTMLElement).textContent).toContain("Add all...");

    if (typeof (addAllButton as HTMLElement).click === "function") {
      (addAllButton as HTMLElement).click();
    } else {
      throw new Error("addAllButton does not have a click method");
    }

    expect(folderSelectorSpy.calls).toHaveLength(1);
    expect(folderSelectorSpy.calls[0].anchorEl).toBe(addAllButton);
    expect(folderSelectorSpy.calls[0].listOnly).toBe(true);
    expect(folderSelectorSpy.calls[0].defaultFolder).toBe("Uncategorized");
  });

  it("renders desktop sidebar via the shared DiscoverSidebar and moves Smallweb into the sidebar header", async () => {
    const sharedSidebarRenderSpy = vi.spyOn(
      DiscoverSidebar.prototype,
      "render",
    );
    const { plugin, view } = await createView();

    view.loadData();
    view.render();

    expect(sharedSidebarRenderSpy).toHaveBeenCalled();

    const sidebar = view.containerEl.querySelector(".rss-discover-sidebar");
    expect(sidebar).not.toBeNull();
    if (!sidebar) throw new Error("sidebar not found");
    const sidebarSmallweb = sidebar.querySelector(
      ".rss-discover-smallweb-button",
    );
    expect(sidebarSmallweb).not.toBeNull();
    if (!sidebarSmallweb) throw new Error("sidebarSmallweb not found");
    expect((sidebarSmallweb as HTMLElement).textContent).toContain("Kagi");

    const filterHeader = view.containerEl.querySelector(
      ".rss-discover-filter-header-right",
    );
    expect(filterHeader).not.toBeNull();
    if (!filterHeader) throw new Error("filterHeader not found");
    expect((filterHeader as HTMLElement).textContent).not.toContain("Smallweb");

    if (typeof (sidebarSmallweb as HTMLElement).click === "function") {
      (sidebarSmallweb as HTMLElement).click();
    } else {
      throw new Error("sidebarSmallweb does not have a click method");
    }
    expect(plugin.activateSmallwebView).toHaveBeenCalledTimes(1);
  });

  it("bulk add uses the full filtered feed set instead of only the current page", async () => {
    const { plugin, view } = await createView();

    view.loadData();
    view.pageSize = 1;
    view.currentPage = 2;
    view.render();

    const addAllButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    );
    expect(addAllButton).not.toBeNull();
    if (!addAllButton) throw new Error("addAllButton not found");

    if (typeof (addAllButton as HTMLElement).click === "function") {
      (addAllButton as HTMLElement).click();
    } else {
      throw new Error("addAllButton does not have a click method");
    }
    folderSelectorSpy.calls[0].onSelect("Uncategorized");
    await flushPromises();

    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledTimes(1);
    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Alpha Tech Blog",
          url: "https://alpha.example.com/rss.xml",
          folder: "Uncategorized",
          mediaType: "article",
        }),
        expect.objectContaining({
          title: "Beta News",
          url: "https://beta.example.com/rss.xml",
          folder: "Uncategorized",
          mediaType: "article",
        }),
        expect.objectContaining({
          title: "Gamma Podcast",
          url: "https://gamma.example.com/rss.xml",
          folder: "Uncategorized",
          mediaType: "podcast",
        }),
        expect.objectContaining({
          title: "Delta YouTube",
          url: "https://www.youtube.com/feeds/videos.xml?channel_id=delta",
          folder: "Uncategorized",
          mediaType: "video",
        }),
      ]),
      expect.objectContaining({ mode: "update" }),
    );
    expect(
      vi.mocked(plugin.ingestFeedsForBackgroundImport).mock
        .calls[0][0] as Array<{
        title: string;
        url: string;
        folder: string;
        mediaType?: "article" | "video" | "podcast";
      }>,
    ).toHaveLength(4);
  });

  it("bulk add only adds filtered feeds and skips feeds that are already followed", async () => {
    const { plugin, view } = await createView({
      followedUrls: ["https://beta.example.com/rss.xml"],
    });

    view.loadData();
    view.filters = {
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
    view.filterFeeds();
    view.render();

    const addAllButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    );
    expect(addAllButton).not.toBeNull();
    if (!addAllButton) throw new Error("addAllButton not found");

    if (typeof (addAllButton as HTMLElement).click === "function") {
      (addAllButton as HTMLElement).click();
    } else {
      throw new Error("addAllButton does not have a click method");
    }
    folderSelectorSpy.calls[0].onSelect("Research");
    await flushPromises();

    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledTimes(1);
    expect(plugin.ingestFeedsForBackgroundImport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Alpha Tech Blog",
          url: "https://alpha.example.com/rss.xml",
          folder: "Research",
          mediaType: "article",
        }),
        expect.objectContaining({
          title: "Gamma Podcast",
          url: "https://gamma.example.com/rss.xml",
          folder: "Research",
          mediaType: "podcast",
        }),
      ]),
      expect.objectContaining({ mode: "update" }),
    );
    expect(
      vi.mocked(plugin.ingestFeedsForBackgroundImport).mock
        .calls[0][0] as Array<{
        title: string;
        url: string;
        folder: string;
        mediaType?: "article" | "video" | "podcast";
      }>,
    ).toHaveLength(2);
  });

  it("bulk add shows enqueue progress and then clears when ingestion resolves", async () => {
    const { plugin, view } = await createView();
    let resolveImport: ((value: unknown) => void) | undefined;
    plugin.ingestFeedsForBackgroundImport.mockReturnValue(
      new Promise((resolve) => {
        resolveImport = resolve;
      }),
    );

    view.loadData();
    view.render();

    const addAllButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    );
    expect(addAllButton).not.toBeNull();
    if (!addAllButton) throw new Error("addAllButton not found");

    if (typeof (addAllButton as HTMLElement).click === "function") {
      (addAllButton as HTMLElement).click();
    } else {
      throw new Error("addAllButton does not have a click method");
    }
    folderSelectorSpy.calls[0].onSelect("Uncategorized");
    await flushPromises();

    const processingButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    );
    expect(processingButton).not.toBeNull();
    if (!processingButton) throw new Error("processingButton not found");
    expect((processingButton as HTMLButtonElement).disabled).toBe(true);
    expect((processingButton as HTMLElement).textContent).toContain(
      "Adding 0/4...",
    );

    resolveImport?.({
      addedCount: 3,
      skippedCount: 0,
      queuedFeeds: [],
    });
    await flushPromises();

    const resetButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    );
    expect(resetButton).not.toBeNull();
    if (!resetButton) throw new Error("resetButton not found");
    expect((resetButton as HTMLButtonElement).disabled).toBe(false);
    expect((resetButton as HTMLElement).textContent).toContain("Add all...");
  });

  it("bulk add summarizes added and skipped counts in a single notice", async () => {
    const { plugin, view } = await createView({
      followedUrls: ["https://beta.example.com/rss.xml"],
    });
    plugin.ingestFeedsForBackgroundImport.mockResolvedValue({
      addedCount: 2,
      skippedCount: 0,
      queuedFeeds: [],
    });

    view.loadData();
    view.render();

    const addAllButton = view.containerEl.querySelector(
      ".rss-discover-add-all-btn",
    );
    expect(addAllButton).not.toBeNull();
    if (!addAllButton) throw new Error("addAllButton not found");

    if (typeof (addAllButton as HTMLElement).click === "function") {
      (addAllButton as HTMLElement).click();
    } else {
      throw new Error("addAllButton does not have a click method");
    }
    folderSelectorSpy.calls[0].onSelect("Uncategorized");
    await flushPromises();

    expect(console.debug).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Added 2 feeds. Articles will be fetched in the background. Skipped 1 already-followed feeds.",
    );
  });
});
