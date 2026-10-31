/** The plugin surface the Highlights tab sections read and write. */
import type { App, WorkspaceLeaf } from "obsidian";
import type { RssDashboardSettings } from "../../types/types";

export interface HighlightsSettingsPlugin {
  app: App;
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
    refreshFilterStatusBarOnly(): void;
  } | null>;
  getActiveReaderView(): Promise<object | null>;
}
