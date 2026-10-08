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

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(url: string, items: Partial<FeedItem>[] = []): Feed {
  return {
    title: `Feed (${url})`,
    url,
    folder: "",
    items: items.map((item, index) => ({
      title: `Item ${index}`,
      link: `${url}#${index}`,
      description: "<p>Excerpt</p>",
      pubDate: new Date(Date.now() - index * 1000).toISOString(),
      guid: `${url}#${index}`,
      read: false,
      starred: false,
      tags: [],
      feedTitle: `Feed (${url})`,
      feedUrl: url,
      coverImage: "",
      ...item,
    })),
    lastUpdated: Date.now(),
  };
}

interface DashboardViewInternal {
  containerEl: HTMLElement;
  inlineArticle: FeedItem | null;
  selectedArticle: FeedItem | null;
  render(): void;
}

// The real render() rebuilds the inline Reader, so these tests drive it
// rather than the stubbed render the other dashboard tests use.
function makeView(settings: RssDashboardSettings): DashboardViewInternal {
  const app = new App();
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    updateArticle: vi.fn(async () => {}),
  };
  const leaf = {
    app,
    updateHeader: vi.fn(),
  } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(
    leaf,
    plugin as never,
  ) as unknown as DashboardViewInternal;
  // render() draws into the second child of the view root.
  view.containerEl.empty();
  view.containerEl.createDiv();
  view.containerEl.createDiv();
  document.body.appendChild(view.containerEl);
  return view;
}

function toolbarButton(
  view: DashboardViewInternal,
  action: string,
): HTMLButtonElement {
  const button = view.containerEl.querySelector<HTMLButtonElement>(
    `.inline-reader-header [role='toolbar'] [data-rss-action='${action}']`,
  );
  if (!button) throw new Error(`No ${action} button`);
  return button;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe("Dashboard inline Reader toolbar focus", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  function openInline(): DashboardViewInternal {
    const settings = cloneSettings();
    const feed = makeFeed("https://example.com/feed", [{ title: "Article" }]);
    settings.feeds = [feed];
    const view = makeView(settings);
    view.inlineArticle = feed.items[0];
    view.selectedArticle = feed.items[0];
    view.render();
    return view;
  }

  it.each(["read", "star"])(
    "keeps focus and the Tab stop on the %s button after it is activated",
    async (action) => {
      const view = openInline();
      toolbarButton(view, action).focus();

      toolbarButton(view, action).click();
      await flush();

      const rebuilt = toolbarButton(view, action);
      expect(document.activeElement).toBe(rebuilt);
      expect(rebuilt.getAttribute("tabindex")).toBe("0");
      expect(toolbarButton(view, "save").getAttribute("tabindex")).toBe("-1");
    },
  );

  it("does not take focus when focus was outside the toolbar", async () => {
    const view = openInline();
    const outside = document.body.createEl("input");
    outside.focus();

    toolbarButton(view, "star").click();
    await flush();

    expect(document.activeElement).toBe(outside);
  });
});
