import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type WorkspaceLeaf } from "obsidian";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";

type ScopeState = {
  currentFeed: Feed | null;
  currentFolder: string | null;
};

const openViews: RssDashboardView[] = [];
beforeEach(() => {
  // jsdom lacks CSS.escape; fixture identifiers contain only letters/hyphens.
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});
afterEach(async () => {
  for (const view of openViews.splice(0)) await view.onClose();
  document.body.empty();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.viewStyle = "list";
  settings.articleGroupBy = "none";
  settings.articleFilter = { type: "none", value: null };
  settings.dashboardMultiFilters = {
    statusFilters: [],
    tagFilters: [],
    logic: "OR",
  };
  settings.display.showFilterStatusBar = true;
  settings.allArticlesPageSize = 0;
  settings.keywordRules.rules = [];
  settings.folders = [
    {
      name: "News",
      pinned: false,
      subfolders: [{ name: "Tech", pinned: false, subfolders: [] }],
    },
  ];
  const makeFeed = (name: string, folder: string): Feed => {
    const url = `https://example.com/${name}`;
    const item: FeedItem = {
      guid: name,
      title: name,
      link: `${url}/article`,
      description: "",
      pubDate: "2026-10-12T12:00:00Z",
      read: false,
      starred: false,
      tags: [],
      feedUrl: url,
      feedTitle: name,
      coverImage: "",
    };
    return { title: name, url, folder, items: [item], lastUpdated: 0 };
  };
  const alpha = makeFeed("alpha", "News/Tech");
  const beta = makeFeed("beta", "Other");
  settings.feeds = [alpha, beta];
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    resolveCachedImageUrl: () => undefined,
  };
  const view = new RssDashboardView(
    { app } as unknown as WorkspaceLeaf,
    plugin as never,
  );
  const scope = view as unknown as ScopeState;
  openViews.push(view);
  document.body.append(view.containerEl);
  const rows = () =>
    Array.from(view.containerEl.querySelectorAll(".rss-dashboard-article-item"))
      .map((el) => el.id)
      .sort();
  const status = () =>
    view.containerEl.querySelector(".rss-dashboard-filter-subheader")
      ?.textContent ?? "";
  const update = (feed: Feed, updates: Partial<FeedItem>) =>
    view.applyExternalArticleUpdate(feed.items[0].guid, feed.url, updates);
  return { view, scope, settings, alpha, beta, rows, status, update };
}

type Fixture = ReturnType<typeof fixture>;
const scopes = [
  {
    name: "current feed",
    select: (f: Fixture) => {
      f.scope.currentFeed = f.alpha;
    },
  },
  {
    name: "selected feeds",
    select: (f: Fixture) => {
      f.view.selectedFeeds = [f.alpha.url];
    },
  },
  {
    name: "selected folder descendants",
    select: (f: Fixture) => {
      f.view.selectedFolders = ["News"];
    },
  },
  {
    name: "current folder descendants",
    select: (f: Fixture) => {
      f.scope.currentFolder = "News";
    },
  },
];
const changes = [
  { name: "star", value: { starred: true } },
  { name: "read", value: { read: true } },
  { name: "tag", value: { tags: [{ name: "Review", color: "#123456" }] } },
];

describe.each(scopes)("External article updates in $name", ({ select }) => {
  it.each(changes)(
    "keeps an outside article absent after $name",
    ({ value }) => {
      const f = fixture();
      select(f);
      f.view.render();
      expect(f.rows()).toEqual(["article-alpha"]);
      f.update(f.beta, value);
      expect(f.status()).toContain("Showing 1");
      expect(f.rows()).toEqual(["article-alpha"]);
      expect(f.beta.items[0]).toMatchObject(value);
      f.view.render();
      expect(f.rows()).toEqual(["article-alpha"]);
    },
  );

  it("removes an outside article already displayed", async () => {
    const f = fixture();
    f.view.render();
    expect(f.rows()).toEqual(["article-alpha", "article-beta"]);
    select(f);
    f.update(f.beta, { starred: true });
    await vi.waitFor(() => expect(f.rows()).toEqual(["article-alpha"]));
    expect(f.status()).toContain("Showing 1");
  });

  it("updates an in-scope article without replacing its row", () => {
    const f = fixture();
    select(f);
    f.view.render();
    const row = f.view.containerEl.querySelector("#article-alpha");
    f.update(f.alpha, { starred: true });
    expect(f.rows()).toEqual(["article-alpha"]);
    expect(f.view.containerEl.querySelector("#article-alpha")).toBe(row);
    expect(f.status()).toContain("Showing 1");
  });
});

it("keeps all articles in scope without a selection", () => {
  const f = fixture();
  f.view.render();
  f.update(f.beta, { starred: true });
  expect(f.rows()).toEqual(["article-alpha", "article-beta"]);
  expect(f.status()).toContain("Showing 2");
});

it("combines selected feeds and descendant folders", () => {
  const f = fixture();
  f.view.selectedFeeds = [f.beta.url];
  f.view.selectedFolders = ["News"];
  f.view.render();
  f.update(f.alpha, { starred: true });
  f.update(f.beta, { read: true });
  expect(f.rows()).toEqual(["article-alpha", "article-beta"]);
  expect(f.status()).toContain("Showing 2");
});

it("lets the current feed override a multi-selection", () => {
  const f = fixture();
  f.scope.currentFeed = f.alpha;
  f.view.selectedFeeds = [f.beta.url];
  f.scope.currentFolder = "Other";
  f.view.render();
  f.update(f.beta, { starred: true });
  expect(f.rows()).toEqual(["article-alpha"]);
  expect(f.status()).toContain("Showing 1");
});

it("lets a multi-selection override the current folder", () => {
  const f = fixture();
  f.view.selectedFeeds = [f.alpha.url];
  f.scope.currentFolder = "Other";
  f.view.render();
  f.update(f.beta, { starred: true });
  expect(f.rows()).toEqual(["article-alpha"]);
  expect(f.status()).toContain("Showing 1");
});

it.each(["read", "unread", "starred", "saved", "videos", "podcasts"])(
  "preserves the %s special-folder filter within a feed",
  (folder) => {
    const f = fixture();
    f.scope.currentFeed = f.beta;
    f.scope.currentFolder = folder;
    const matching: Partial<FeedItem> = {
      read: folder === "read",
      starred: folder === "starred",
      saved: folder === "saved",
      mediaType: folder === "videos" ? "video" : "podcast",
    };
    Object.assign(f.beta.items[0], matching);
    f.view.render();
    expect(f.rows()).toEqual(["article-beta"]);
    f.update(f.beta, { tags: [{ name: "Review", color: "#123456" }] });
    expect(f.rows()).toEqual(["article-beta"]);
    expect(f.status()).toContain("Showing 1");
    f.view.render();
    expect(f.rows()).toEqual(["article-beta"]);
  },
);

it("uses the backing feed despite misleading article display metadata", () => {
  const f = fixture();
  f.scope.currentFeed = f.alpha;
  f.beta.items[0].feedUrl = f.alpha.url;
  f.beta.items[0].feedTitle = f.alpha.title;
  f.view.render();
  f.update(f.beta, { starred: true });
  expect(f.rows()).toEqual(["article-alpha"]);
  expect(f.status()).toContain("Showing 1");
  expect(f.beta.items[0].starred).toBe(true);
});

it("removes a previously rendered outside row despite misleading metadata", async () => {
  const f = fixture();
  f.beta.items[0].feedUrl = f.alpha.url;
  f.beta.items[0].feedTitle = f.alpha.title;
  f.view.render();
  expect(f.rows()).toEqual(["article-alpha", "article-beta"]);
  f.scope.currentFeed = f.alpha;
  f.update(f.beta, { starred: true });
  await vi.waitFor(() => expect(f.rows()).toEqual(["article-alpha"]));
  expect(f.status()).toContain("Showing 1");
});

it("inserts an eligible article within a restricted scope", () => {
  const f = fixture();
  f.scope.currentFeed = f.beta;
  f.scope.currentFolder = "starred";
  f.view.render();
  expect(f.rows()).toEqual([]);
  f.update(f.beta, { starred: true });
  expect(f.rows()).toEqual(["article-beta"]);
  expect(f.status()).toContain("Showing 1");
  f.view.render();
  expect(f.rows()).toEqual(["article-beta"]);
});

it("removes a current-feed row that stops matching its special filter", async () => {
  const f = fixture();
  f.scope.currentFeed = f.beta;
  f.scope.currentFolder = "starred";
  f.beta.items[0].feedUrl = f.alpha.url;
  f.beta.items[0].starred = true;
  f.view.render();
  expect(f.rows()).toEqual(["article-beta"]);
  f.update(f.beta, { starred: false });
  await vi.waitFor(() => expect(f.rows()).toEqual([]));
  expect(f.status()).toContain("Showing 0");
});
