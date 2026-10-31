import { App, WorkspaceLeaf } from "obsidian";
import { describe, expect, it } from "vitest";
import type { FeedMetadata } from "../../../src/types/discover-types";
import type RssDashboardPlugin from "../../../main";
import { DiscoverView } from "../../../src/views/discover-view";

const SORT_FEEDS: FeedMetadata[] = [
  {
    id: "delta",
    title: "Delta",
    url: "https://delta.example.com/rss.xml",
    imageUrl: "",
    domain: ["Education"],
    subdomain: [],
    area: [],
    topic: [],
    tags: ["zeta"],
    type: "Podcast",
    createdAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "alpha",
    title: "Alpha",
    url: "https://alpha.example.com/rss.xml",
    imageUrl: "",
    domain: [],
    subdomain: [],
    area: [],
    topic: [],
    tags: ["beta", "alpha"],
    type: "News",
  },
  {
    id: "charlie",
    title: "Charlie",
    url: "https://charlie.example.com/rss.xml",
    imageUrl: "",
    domain: ["Technology"],
    subdomain: [],
    area: [],
    topic: [],
    tags: [],
    type: "Blog",
    createdAt: "2024-06-01T00:00:00.000Z",
  },
  {
    id: "bravo",
    title: "Bravo",
    url: "https://bravo.example.com/rss.xml",
    imageUrl: "",
    domain: ["Technology"],
    subdomain: [],
    area: [],
    topic: [],
    tags: ["alpha"],
    type: "Blog",
    createdAt: "2023-12-01T00:00:00.000Z",
  },
];

interface SortableDiscoverView {
  feeds: FeedMetadata[];
  filteredFeeds: FeedMetadata[];
  currentSort: string;
  filterFeeds: () => void;
}

function createSortableView(): SortableDiscoverView {
  const app = new App();
  const leaf = new (
    WorkspaceLeaf as unknown as { new (app: App): WorkspaceLeaf }
  )(app);
  const plugin = { settings: { feeds: [] } } as unknown as RssDashboardPlugin;
  return new DiscoverView(leaf, plugin) as unknown as SortableDiscoverView;
}

describe("DiscoverView feed sort characterization", () => {
  it.each([
    ["title-asc", ["alpha", "bravo", "charlie", "delta"]],
    ["title-desc", ["delta", "charlie", "bravo", "alpha"]],
    ["type-asc", ["charlie", "bravo", "alpha", "delta"]],
    ["type-desc", ["delta", "alpha", "charlie", "bravo"]],
    ["created-desc", ["charlie", "delta", "bravo", "alpha"]],
    ["created-asc", ["alpha", "bravo", "delta", "charlie"]],
    ["tags-desc", ["alpha", "delta", "bravo", "charlie"]],
    ["tags-asc", ["charlie", "delta", "bravo", "alpha"]],
    ["category-asc", ["alpha", "delta", "charlie", "bravo"]],
    ["tag-name-asc", ["charlie", "bravo", "alpha", "delta"]],
  ])(
    "sort mode %s preserves its current feed order",
    (sortMode, expectedIds) => {
      const view = createSortableView();
      view.feeds = SORT_FEEDS;
      view.currentSort = sortMode;

      view.filterFeeds();

      expect(view.filteredFeeds.map((feed) => feed.id)).toEqual(expectedIds);
    },
  );
});
