import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerPaletteCommands,
  type DashboardCommandTarget,
  type PaletteCommandPlugin,
  type ReaderCommandTarget,
} from "../../../src/commands/palette-commands";
import { SETTINGS_TAB_NAMES } from "../../../src/settings/tab-names";

vi.mock("../../../src/views/dashboard-view", () => ({
  RSS_DASHBOARD_VIEW_TYPE: "rss-dashboard-view",
}));
vi.mock("../../../src/views/reader-view", () => ({
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

interface RegisteredCommand {
  id: string;
  name: string;
  hotkeys?: unknown;
  callback?: () => void;
  checkCallback?: (checking: boolean) => boolean | void;
}

const EXPECTED_SETTINGS_IDS = [
  "open-settings-general",
  "open-settings-storage",
  "open-settings-display",
  "open-settings-sidebar",
  "open-settings-media",
  "open-settings-article-saving",
  "open-settings-rules",
  "open-settings-highlights",
  "open-settings-import-export",
  "open-settings-tags",
  "open-settings-about",
];

const EXPECTED_DASHBOARD_IDS = [
  "dashboard-focus-search",
  "dashboard-clear-filters",
  "dashboard-filter-all",
  "dashboard-filter-unread",
  "dashboard-filter-read",
  "dashboard-filter-starred",
  "dashboard-view-list",
  "dashboard-view-card",
  "dashboard-view-feed",
  "dashboard-collapse-all-folders",
  "dashboard-expand-all-folders",
];

const EXPECTED_READER_IDS = [
  "reader-next-article",
  "reader-previous-article",
  "reader-close",
  "reader-toggle-star",
  "reader-toggle-read",
  "reader-open-tags",
  "reader-open-original",
];

function createDashboardStub() {
  return {
    actionFocusSearch: vi.fn(),
    actionClearFilters: vi.fn(),
    actionSetStatusFilter: vi.fn(),
    actionShowStarred: vi.fn(),
    actionSetViewStyle: vi.fn(),
    actionSetAllFoldersCollapsed: vi.fn(),
  } satisfies DashboardCommandTarget;
}

function createReaderStub() {
  return {
    actionNavigateNext: vi.fn(),
    actionNavigatePrevious: vi.fn(),
    actionToggleArticleOpen: vi.fn(),
    actionToggleStarStatus: vi.fn(),
    actionToggleReadStatus: vi.fn(),
    actionToggleTagsMenu: vi.fn(),
    actionOpenOriginal: vi.fn(),
  } satisfies ReaderCommandTarget;
}

function setup(open: { dashboard?: boolean; reader?: boolean } = {}) {
  const commands: RegisteredCommand[] = [];
  const dashboard = createDashboardStub();
  const reader = createReaderStub();
  const getLeavesOfType = vi.fn((type: string) => {
    if (type === "rss-dashboard-view") return open.dashboard ? [{}] : [];
    if (type === "rss-reader-view") return open.reader ? [{}] : [];
    return [];
  });
  const plugin: PaletteCommandPlugin = {
    app: { workspace: { getLeavesOfType } },
    addCommand: (command) => {
      commands.push(command as RegisteredCommand);
    },
    getActiveDashboardView: vi.fn(async () => dashboard),
    getActiveReaderView: vi.fn(async () => reader),
    openSettingsToTab: vi.fn(async () => {}),
  };
  registerPaletteCommands(plugin);
  const byId = (id: string): RegisteredCommand => {
    const found = commands.find((command) => command.id === id);
    if (!found) throw new Error(`Command not registered: ${id}`);
    return found;
  };
  const run = async (id: string) => {
    const command = byId(id);
    command.checkCallback?.(false);
    command.callback?.();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { commands, byId, run, plugin, dashboard, reader };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("palette command registration", () => {
  it("registers the stable kebab-case ids and nothing else", () => {
    const { commands } = setup();

    expect(commands.map((command) => command.id)).toEqual([
      ...EXPECTED_SETTINGS_IDS,
      ...EXPECTED_DASHBOARD_IDS,
      ...EXPECTED_READER_IDS,
    ]);
    for (const command of commands) {
      expect(command.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    expect(new Set(commands.map((c) => c.id)).size).toBe(commands.length);
  });

  it("gives every command a distinct sentence-case name", () => {
    const { commands } = setup();

    expect(new Set(commands.map((c) => c.name)).size).toBe(commands.length);
    for (const command of commands) {
      expect(command.name).toMatch(/^[A-Z]/);
    }
  });

  it("sets no default hotkeys", () => {
    const { commands } = setup();

    for (const command of commands) {
      expect(command.hotkeys).toBeUndefined();
    }
  });

  it("covers every settings tab", () => {
    const { commands } = setup();

    const settingsCommands = commands.filter((c) =>
      c.id.startsWith("open-settings-"),
    );
    expect(settingsCommands).toHaveLength(SETTINGS_TAB_NAMES.length);
  });
});

describe("settings commands", () => {
  it("open settings at the matching tab, whatever is open", async () => {
    const { run, plugin } = setup();

    for (const [index, tabName] of SETTINGS_TAB_NAMES.entries()) {
      await run(EXPECTED_SETTINGS_IDS[index] ?? "");
      expect(plugin.openSettingsToTab).toHaveBeenLastCalledWith(tabName);
    }
    expect(plugin.openSettingsToTab).toHaveBeenCalledTimes(
      SETTINGS_TAB_NAMES.length,
    );
  });
});

describe("dashboard commands", () => {
  it("delegate to the dashboard view methods", async () => {
    const { run, dashboard } = setup({ dashboard: true });

    await run("dashboard-focus-search");
    expect(dashboard.actionFocusSearch).toHaveBeenCalledTimes(1);

    await run("dashboard-clear-filters");
    expect(dashboard.actionClearFilters).toHaveBeenCalledTimes(1);

    await run("dashboard-filter-all");
    await run("dashboard-filter-unread");
    await run("dashboard-filter-read");
    expect(dashboard.actionSetStatusFilter.mock.calls).toEqual([
      ["all"],
      ["unread"],
      ["read"],
    ]);

    await run("dashboard-filter-starred");
    expect(dashboard.actionShowStarred).toHaveBeenCalledTimes(1);

    await run("dashboard-view-list");
    await run("dashboard-view-card");
    await run("dashboard-view-feed");
    expect(dashboard.actionSetViewStyle.mock.calls).toEqual([
      ["list"],
      ["card"],
      ["feed"],
    ]);

    await run("dashboard-collapse-all-folders");
    await run("dashboard-expand-all-folders");
    expect(dashboard.actionSetAllFoldersCollapsed.mock.calls).toEqual([
      [true],
      [false],
    ]);
  });

  it("are listed only while a dashboard view exists", () => {
    const closed = setup({ reader: true });
    const open = setup({ dashboard: true });

    for (const id of EXPECTED_DASHBOARD_IDS) {
      expect(closed.byId(id).checkCallback?.(true)).toBe(false);
      expect(open.byId(id).checkCallback?.(true)).toBe(true);
    }
  });

  it("do nothing when the dashboard is gone by the time they run", async () => {
    const { byId, plugin, dashboard } = setup({ dashboard: true });
    vi.mocked(plugin.getActiveDashboardView).mockResolvedValue(null);

    byId("dashboard-focus-search").checkCallback?.(false);
    await Promise.resolve();
    await Promise.resolve();

    expect(dashboard.actionFocusSearch).not.toHaveBeenCalled();
  });
});

describe("reader commands", () => {
  it("delegate to the reader view methods", async () => {
    const { run, reader } = setup({ reader: true });

    await run("reader-next-article");
    expect(reader.actionNavigateNext).toHaveBeenCalledTimes(1);
    await run("reader-previous-article");
    expect(reader.actionNavigatePrevious).toHaveBeenCalledTimes(1);
    await run("reader-close");
    expect(reader.actionToggleArticleOpen).toHaveBeenCalledTimes(1);
    await run("reader-toggle-star");
    expect(reader.actionToggleStarStatus).toHaveBeenCalledTimes(1);
    await run("reader-toggle-read");
    expect(reader.actionToggleReadStatus).toHaveBeenCalledTimes(1);
    await run("reader-open-tags");
    expect(reader.actionToggleTagsMenu).toHaveBeenCalledTimes(1);
    await run("reader-open-original");
    expect(reader.actionOpenOriginal).toHaveBeenCalledTimes(1);
  });

  it("are listed only while a reader view exists", () => {
    const closed = setup({ dashboard: true });
    const open = setup({ reader: true });

    for (const id of EXPECTED_READER_IDS) {
      expect(closed.byId(id).checkCallback?.(true)).toBe(false);
      expect(open.byId(id).checkCallback?.(true)).toBe(true);
    }
  });
});

describe("checkCallback with checking=true", () => {
  it("has no side effects in any availability state", async () => {
    const states = [
      {},
      { dashboard: true },
      { reader: true },
      { dashboard: true, reader: true },
    ];

    for (const state of states) {
      const { commands, plugin, dashboard, reader } = setup(state);
      for (const command of commands) {
        command.checkCallback?.(true);
      }
      await Promise.resolve();
      await Promise.resolve();

      expect(plugin.getActiveDashboardView).not.toHaveBeenCalled();
      expect(plugin.getActiveReaderView).not.toHaveBeenCalled();
      expect(plugin.openSettingsToTab).not.toHaveBeenCalled();
      for (const stub of [dashboard, reader]) {
        for (const method of Object.values(stub)) {
          expect(method).not.toHaveBeenCalled();
        }
      }
    }
  });

  it("does not act when unavailable and checking=false", async () => {
    const { byId, plugin } = setup();

    expect(byId("dashboard-filter-all").checkCallback?.(false)).toBe(false);
    expect(byId("reader-close").checkCallback?.(false)).toBe(false);
    await Promise.resolve();

    expect(plugin.getActiveDashboardView).not.toHaveBeenCalled();
    expect(plugin.getActiveReaderView).not.toHaveBeenCalled();
  });
});
