import { beforeEach, describe, expect, it, vi } from "vitest";
import { App, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";
import type { FeedMetadata, CategoryPath, DiscoverFilters } from "../../../src/types/discover-types";

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

  const plugin = { settings } as any;
  const leaf = new WorkspaceLeaf(app);

  const mod = await import("../../../src/views/discover-view");
  const view = new mod.DiscoverView(leaf as any, plugin);

  return { app, view };
}

describe("DiscoverView (P1-3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});

