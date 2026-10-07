import type { Plugin as ObsidianPlugin } from "obsidian";
import {
  SETTINGS_TAB_NAMES,
  type SettingsTabName,
} from "../settings/tab-names";
import {
  RSS_DASHBOARD_VIEW_TYPE,
  type RssDashboardView,
} from "../views/dashboard-view";
import { RSS_READER_VIEW_TYPE, type ReaderView } from "../views/reader-view";

type Command = Parameters<ObsidianPlugin["addCommand"]>[0];

/** The dashboard view methods the palette commands call (DEC-007). */
export type DashboardCommandTarget = Pick<
  RssDashboardView,
  | "actionFocusSearch"
  | "actionClearFilters"
  | "actionSetStatusFilter"
  | "actionShowStarred"
  | "actionSetViewStyle"
  | "actionSetAllFoldersCollapsed"
>;

/** The reader view methods the palette commands call (DEC-007). */
export type ReaderCommandTarget = Pick<
  ReaderView,
  | "actionNavigateNext"
  | "actionNavigatePrevious"
  | "actionToggleArticleOpen"
  | "actionToggleStarStatus"
  | "actionToggleReadStatus"
  | "actionToggleTagsMenu"
  | "actionOpenOriginal"
>;

/** What the commands need from the plugin; the plugin class satisfies it. */
export interface PaletteCommandPlugin {
  app: {
    workspace: { getLeavesOfType: (type: string) => unknown[] };
  };
  addCommand: (command: Command) => unknown;
  getActiveDashboardView: () => Promise<DashboardCommandTarget | null>;
  getActiveReaderView: () => Promise<ReaderCommandTarget | null>;
  openSettingsToTab: (tabName: string) => Promise<void>;
}

/** Turns a settings tab name into its command id segment. */
function slugifyTabName(name: SettingsTabName): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function registerSettingsCommands(plugin: PaletteCommandPlugin): void {
  for (const tabName of SETTINGS_TAB_NAMES) {
    plugin.addCommand({
      id: `open-settings-${slugifyTabName(tabName)}`,
      name: `Open settings: ${tabName.toLowerCase()}`,
      callback: () => {
        void plugin.openSettingsToTab(tabName);
      },
    });
  }
}

/**
 * Adds a command that is listed only while a view of `viewType` is open.
 * With `checking` true it only reports availability and changes nothing.
 */
function addViewCommand<T>(
  plugin: PaletteCommandPlugin,
  viewType: string,
  getView: () => Promise<T | null>,
  id: string,
  name: string,
  run: (view: T) => void,
): void {
  plugin.addCommand({
    id,
    name,
    checkCallback: (checking: boolean) => {
      if (plugin.app.workspace.getLeavesOfType(viewType).length === 0) {
        return false;
      }
      if (!checking) {
        void getView().then((view) => {
          if (view) run(view);
        });
      }
      return true;
    },
  });
}

function registerDashboardCommands(plugin: PaletteCommandPlugin): void {
  const add = (
    id: string,
    name: string,
    run: (view: DashboardCommandTarget) => void,
  ): void =>
    addViewCommand(
      plugin,
      RSS_DASHBOARD_VIEW_TYPE,
      () => plugin.getActiveDashboardView(),
      id,
      name,
      run,
    );

  add("dashboard-focus-search", "Focus article search", (v) =>
    v.actionFocusSearch(),
  );
  add("dashboard-clear-filters", "Clear dashboard filters", (v) =>
    v.actionClearFilters(),
  );
  add("dashboard-filter-all", "Show all articles", (v) =>
    v.actionSetStatusFilter("all"),
  );
  add("dashboard-filter-unread", "Show unread articles", (v) =>
    v.actionSetStatusFilter("unread"),
  );
  add("dashboard-filter-read", "Show read articles", (v) =>
    v.actionSetStatusFilter("read"),
  );
  add("dashboard-filter-starred", "Show starred articles", (v) =>
    v.actionShowStarred(),
  );
  add("dashboard-view-list", "Switch to list view", (v) =>
    v.actionSetViewStyle("list"),
  );
  add("dashboard-view-card", "Switch to card view", (v) =>
    v.actionSetViewStyle("card"),
  );
  add("dashboard-view-feed", "Switch to feed view", (v) =>
    v.actionSetViewStyle("feed"),
  );
  add("dashboard-collapse-all-folders", "Collapse all folders", (v) =>
    v.actionSetAllFoldersCollapsed(true),
  );
  add("dashboard-expand-all-folders", "Expand all folders", (v) =>
    v.actionSetAllFoldersCollapsed(false),
  );
}

function registerReaderCommands(plugin: PaletteCommandPlugin): void {
  const add = (
    id: string,
    name: string,
    run: (view: ReaderCommandTarget) => void,
  ): void =>
    addViewCommand(
      plugin,
      RSS_READER_VIEW_TYPE,
      () => plugin.getActiveReaderView(),
      id,
      name,
      run,
    );

  add("reader-next-article", "Go to next article in reader", (v) =>
    v.actionNavigateNext(),
  );
  add("reader-previous-article", "Go to previous article in reader", (v) =>
    v.actionNavigatePrevious(),
  );
  add("reader-close", "Close reader", (v) => v.actionToggleArticleOpen());
  add("reader-toggle-star", "Toggle starred in reader", (v) =>
    v.actionToggleStarStatus(),
  );
  add("reader-toggle-read", "Toggle read in reader", (v) =>
    v.actionToggleReadStatus(),
  );
  add("reader-open-tags", "Open tags menu in reader", (v) =>
    v.actionToggleTagsMenu(),
  );
  add("reader-open-original", "Open original article in browser", (v) =>
    v.actionOpenOriginal(),
  );
}

/**
 * Registers the settings, dashboard, and reader palette commands. The ids are a
 * test contract (see the testing docs); none sets a default hotkey (DEC-004).
 */
export function registerPaletteCommands(plugin: PaletteCommandPlugin): void {
  registerSettingsCommands(plugin);
  registerDashboardCommands(plugin);
  registerReaderCommands(plugin);
}
