import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type WorkspaceLeaf } from "obsidian";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type KeywordFilterRule,
  type RssDashboardSettings,
  type Tag,
} from "../../../src/types/types";

type ReaderState = {
  currentItem: FeedItem;
  toggleTag(item: FeedItem, tag: Tag, add: boolean): void;
};

const openViews: RssDashboardView[] = [];

beforeEach(() => {
  // jsdom lacks CSS.escape; the fixture IDs contain only letters/hyphens.
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});

afterEach(async () => {
  for (const view of openViews.splice(0)) await view.onClose();
  document.body.empty();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function rule(overrides: Partial<KeywordFilterRule> = {}): KeywordFilterRule {
  return {
    id: "exclude-blocked",
    createdAt: 0,
    enabled: true,
    type: "exclude",
    keyword: "Blocked",
    matchMode: "partial",
    applyToTitle: true,
    applyToSummary: false,
    applyToContent: false,
    applyToURL: false,
    ...overrides,
  };
}

function fixture(configure?: (settings: RssDashboardSettings) => void) {
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
  settings.keywordRules = {
    bypassAll: false,
    includeLogic: "OR",
    rules: [rule()],
  };
  const makeItem = (guid: string, title: string): FeedItem => ({
    guid,
    title,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: "2026-10-12T12:00:00Z",
    read: false,
    starred: false,
    tags: [],
    feedUrl: "https://example.com/feed",
    feedTitle: "Fixture",
    coverImage: "",
  });
  const blocked = makeItem("blocked", "Blocked article");
  settings.feeds = [
    {
      title: "Fixture",
      url: blocked.feedUrl,
      folder: "",
      items: [blocked, makeItem("allowed", "Allowed article")],
      lastUpdated: 0,
    },
  ];
  configure?.(settings);
  const app = new App();
  const makeLeaf = () => ({ app }) as unknown as WorkspaceLeaf;
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    resolveCachedImageUrl: () => undefined,
  };
  const view = new RssDashboardView(makeLeaf(), plugin as never);
  openViews.push(view);
  document.body.append(view.containerEl);
  const updates: Partial<FeedItem>[] = [];
  const reader = new ReaderView(
    makeLeaf(),
    settings,
    {} as never,
    () => {},
    (item, update, rerender) => {
      updates.push(update);
      view.applyExternalArticleUpdate(
        item.guid,
        item.feedUrl,
        update,
        rerender,
      );
    },
  );
  // Model an already-open Reader without fetching a page. Its mutation methods,
  // external dashboard sync, filter predicates, and ArticleList remain real.
  const readerState = reader as unknown as ReaderState;
  readerState.currentItem = blocked;
  const rows = () =>
    Array.from(
      view.containerEl.querySelectorAll(".rss-dashboard-article-item"),
    ).map((el) => el.id);
  const status = () =>
    view.containerEl.querySelector(".rss-dashboard-filter-subheader")
      ?.textContent ?? "";
  const update = (kind: "star" | "read" | "tag") => {
    if (kind === "star") reader.actionToggleStarStatus();
    else if (kind === "read") reader.actionToggleReadStatus();
    else
      readerState.toggleTag(
        blocked,
        { name: "Review", color: "#123456" },
        true,
      );
  };
  return { settings, blocked, view, rows, status, update, updates };
}

const ruleSources = [
  { name: "global", configure: (_settings: RssDashboardSettings) => {} },
  {
    name: "per-feed",
    configure: (settings: RssDashboardSettings) => {
      settings.keywordRules.rules = [];
      settings.feeds[0].keywordRules = {
        overrideGlobalRules: false,
        includeLogic: "OR",
        rules: [rule()],
      };
    },
  },
  {
    name: "per-feed overriding global",
    configure: (settings: RssDashboardSettings) => {
      settings.keywordRules.rules = [rule({ keyword: "Allowed" })];
      settings.feeds[0].keywordRules = {
        overrideGlobalRules: true,
        includeLogic: "AND",
        rules: [rule()],
      };
    },
  },
];

describe.each(ruleSources)(
  "Reader updates with $name keyword rules (#1083)",
  ({ configure }) => {
    it.each(["star", "read", "tag"] as const)(
      "keeps the excluded article absent after a %s update",
      async (kind) => {
        const f = fixture(configure);
        f.view.render();
        expect(f.rows()).toEqual(["article-allowed"]);
        f.settings.keywordRules.bypassAll = true;
        f.view.render();
        expect(f.rows()).toHaveLength(2);
        f.settings.keywordRules.bypassAll = false;
        f.view.render();
        expect(f.rows()).toEqual(["article-allowed"]);

        f.update(kind);
        await Promise.resolve();
        expect(f.updates).toHaveLength(1);
        expect(f.rows()).toEqual(["article-allowed"]);
        expect(f.status()).toContain("Showing 1");
        f.view.render();
        expect(f.rows()).toEqual(["article-allowed"]);
        if (kind === "star") expect(f.blocked.starred).toBe(true);
        if (kind === "read") expect(f.blocked.read).toBe(true);
        if (kind === "tag")
          expect(f.blocked.tags).toEqual([
            { name: "Review", color: "#123456" },
          ]);
      },
    );

    it.each(["star", "read", "tag"] as const)(
      "preserves bypassed %s updates",
      async (kind) => {
        const f = fixture(configure);
        f.settings.keywordRules.bypassAll = true;
        f.view.render();
        f.update(kind);
        await Promise.resolve();
        expect(f.updates).toHaveLength(1);
        if (kind === "star") expect(f.blocked.starred).toBe(true);
        if (kind === "read") expect(f.blocked.read).toBe(true);
        if (kind === "tag") {
          expect(f.blocked.tags).toEqual([
            { name: "Review", color: "#123456" },
          ]);
        }
        expect(f.rows()).toHaveLength(2);
        expect(f.rows()).toContain("article-blocked");
        expect(f.status()).toContain("Showing 2");
        expect(f.status()).toContain("Keyword rules bypassed");
      },
    );

    it("removes an already-displayed article when the keyword rule excludes it", async () => {
      const f = fixture(configure);
      f.settings.keywordRules.bypassAll = true;
      f.view.render();
      expect(f.rows()).toHaveLength(2);
      // Change eligibility without a full render to exercise the removal branch.
      f.settings.keywordRules.bypassAll = false;
      f.update("star");
      await vi.waitFor(() => expect(f.rows()).toEqual(["article-allowed"]));
      expect(f.status()).toContain("Showing 1");
    });
  },
);

it("lets a feed override a global exclusion and insert an eligible article", async () => {
  const f = fixture();
  f.view.render();
  expect(f.rows()).toEqual(["article-allowed"]);
  f.settings.feeds[0].keywordRules = {
    overrideGlobalRules: true,
    includeLogic: "AND",
    rules: [],
  };
  f.update("star");
  await Promise.resolve();
  expect(f.rows()).toHaveLength(2);
  expect(f.status()).toContain("Showing 2");
});

it.each(["disabled", "empty", "missing"] as const)(
  "preserves updates with %s global keyword settings",
  async (kind) => {
    const f = fixture((settings) => {
      if (kind === "disabled") settings.keywordRules.rules[0].enabled = false;
      else if (kind === "empty") settings.keywordRules.rules = [];
      else Reflect.deleteProperty(settings, "keywordRules");
    });
    f.view.render();
    f.update("star");
    await Promise.resolve();
    expect(f.rows()).toHaveLength(2);
    expect(f.status()).toContain("Showing 2");
  },
);
