import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    clearFolderPathCache(): void {}
    destroy(): void {}
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
  },
}));

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

interface ViewWithSubheader {
  renderFilterSubheader(container: HTMLElement): void;
}

async function renderSubheader(options: {
  userStateUnreadable: boolean;
  shardFolderHiddenFromSync?: boolean;
  showFilterStatusBar?: boolean;
}): Promise<HTMLElement> {
  const { RssDashboardView } = await import("../../../src/views/dashboard-view");
  const settings = cloneSettings();
  if (options.showFilterStatusBar !== undefined) {
    settings.display.showFilterStatusBar = options.showFilterStatusBar;
  }
  const plugin = {
    settings,
    saveSettings: vi.fn(async () => {}),
    isUserStateUnreadable: options.userStateUnreadable,
    isShardFolderHiddenFromSync: options.shardFolderHiddenFromSync ?? false,
  };
  const leaf = { app: new App() } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(
    leaf,
    plugin as never,
  ) as unknown as ViewWithSubheader;

  const container = document.body.createDiv();
  view.renderFilterSubheader(container);
  return container;
}

describe("Dashboard unreadable user-state alert", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("shows a persistent alert naming the file and what is not being saved", async () => {
    const container = await renderSubheader({ userStateUnreadable: true });

    const alert = container.querySelector<HTMLElement>(
      ".rss-dashboard-user-state-alert",
    );
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toContain("user-state.json");
    expect(alert?.textContent).toContain("not being saved");
  });

  it("keeps the alert outside the collapsible content so collapsing the strip cannot hide it", async () => {
    const container = await renderSubheader({ userStateUnreadable: true });

    const alert = container.querySelector(".rss-dashboard-user-state-alert");
    expect(alert?.closest(".rss-dashboard-filter-subheader-content")).toBeNull();
    expect(alert?.closest(".rss-dashboard-filter-subheader")).not.toBeNull();
  });

  it("still shows the alert when the user has turned the filter status bar off", async () => {
    const container = await renderSubheader({
      userStateUnreadable: true,
      showFilterStatusBar: false,
    });

    expect(
      container.querySelector(".rss-dashboard-user-state-alert"),
    ).not.toBeNull();
    expect(
      container.querySelector(".rss-dashboard-refresh-status-row"),
    ).toBeNull();
  });

  it("shows no alert when user-state.json is healthy", async () => {
    const container = await renderSubheader({ userStateUnreadable: false });

    expect(container.querySelector(".rss-dashboard-user-state-alert")).toBeNull();
    expect(
      container.querySelector(".rss-dashboard-refresh-status-row"),
    ).not.toBeNull();
  });

  it("renders nothing when healthy and the filter status bar is turned off", async () => {
    const container = await renderSubheader({
      userStateUnreadable: false,
      showFilterStatusBar: false,
    });

    expect(container.querySelector(".rss-dashboard-filter-subheader")).toBeNull();
  });
});

describe("Dashboard hidden storage folder alert", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  it("explains that the hidden storage folder is not synced and warns against repairing on this device", async () => {
    const container = await renderSubheader({
      userStateUnreadable: false,
      shardFolderHiddenFromSync: true,
    });

    const alert = container.querySelector<HTMLElement>(
      ".rss-dashboard-hidden-storage-alert",
    );
    expect(alert?.getAttribute("role")).toBe("alert");
    expect(alert?.textContent).toContain(DEFAULT_SETTINGS.storageFolder);
    expect(alert?.textContent).toContain("Repair");
    expect(alert?.closest(".rss-dashboard-filter-subheader-content")).toBeNull();
  });

  it("still shows the alert when the user has turned the filter status bar off", async () => {
    const container = await renderSubheader({
      userStateUnreadable: false,
      shardFolderHiddenFromSync: true,
      showFilterStatusBar: false,
    });

    expect(
      container.querySelector(".rss-dashboard-hidden-storage-alert"),
    ).not.toBeNull();
  });

  it("shows no alert when the storage folder's shards loaded", async () => {
    const container = await renderSubheader({ userStateUnreadable: false });

    expect(
      container.querySelector(".rss-dashboard-hidden-storage-alert"),
    ).toBeNull();
  });
});
