/** The plugin surface the General tab sections read and write. */
import type { App, WorkspaceLeaf } from "obsidian";
import type { ImportResult } from "../../services/import-export-service";
import type { RssDashboardSettings } from "../../types/types";
import type { ProxyCheckStore } from "../../utils/proxy-check";

export interface GeneralSettingsPlugin {
  app: App;
  settingTab: { display(): void } | null;
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
  } | null>;
  importPortableDataBundleFromFile(file: File): Promise<ImportResult>;
  exportPortableDataBundle(): Promise<void>;
  applyFeedLimitsToAllFeeds(): Promise<void>;
  refreshFeeds(): Promise<void>;
  openShortcutHelp(): void;
  /** Session-only holder for the last proxy check (#1298); never persisted. */
  proxyCheckStore: ProxyCheckStore;
}
