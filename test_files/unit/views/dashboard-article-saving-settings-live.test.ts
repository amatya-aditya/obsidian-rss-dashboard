import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import * as fetchHelpers from "../../../src/utils/fetch-helpers";
import { RssDashboardView } from "../../../src/views/dashboard-view";

// The heavy dashboard collaborators are mocked for isolation, but the Article
// Saver stays real: this test is about which settings the saver reads.
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

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

interface ViewWithSaver {
  saver: {
    saveArticleWithContentPolicy(item: FeedItem): Promise<unknown>;
  };
}

function createView(settings: RssDashboardSettings) {
  const app = App.createMock();
  const plugin = { settings, saveSettings: vi.fn(async () => {}) };
  const view = new RssDashboardView(
    { app } as never,
    plugin as never,
  ) as unknown as ViewWithSaver;
  return { app, plugin, view };
}

function createItem(): FeedItem {
  return {
    title: "Reloaded article",
    link: "https://example.com/article",
    description: "<p>RSS body</p>",
    pubDate: "2026-09-28",
    guid: "reloaded-article",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
  };
}

describe("Dashboard save settings", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("saves with the Article Saving group that replaced the settings after the view was created", async () => {
    const beforeReload = cloneSettings();
    beforeReload.articleSaving.saveVersion = "fetched";
    beforeReload.articleSaving.defaultFolder = "Old articles";
    // Both groups share one non-minimal template, so the frontmatter below can
    // only come from the reloaded group's `includeFrontmatter` (#1246).
    beforeReload.articleSaving.defaultTemplate = "# {{title}}\n\n{{content}}";
    beforeReload.articleSaving.includeFrontmatter = false;

    // A settings reload re-keys `plugin.settings`: normalization builds a fresh
    // object, so the Article Saving group is a different object too.
    const afterReload = cloneSettings();
    afterReload.articleSaving.saveVersion = "rss";
    afterReload.articleSaving.defaultFolder = "New articles";
    afterReload.articleSaving.defaultTemplate = "# {{title}}\n\n{{content}}";
    afterReload.articleSaving.includeFrontmatter = true;

    const { app, plugin, view } = createView(beforeReload);
    const fetchSpy = vi
      .spyOn(fetchHelpers, "fetchWithProxyFallbackDetailed")
      .mockResolvedValue("" as never);

    plugin.settings = afterReload;

    await view.saver.saveArticleWithContentPolicy(createItem());

    expect(fetchSpy).not.toHaveBeenCalled();
    const savedArticle = await (
      app.vault.adapter as unknown as {
        read(path: string): Promise<string>;
      }
    ).read("New articles/Reloaded article.md");
    expect(savedArticle).toContain("RSS body");
    // Frontmatter is a separate read of the same group, from the reloaded value.
    expect(savedArticle.startsWith("---\n")).toBe(true);
  });
});
