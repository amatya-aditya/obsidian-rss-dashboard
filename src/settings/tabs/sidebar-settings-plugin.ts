/** The plugin surface the Sidebar tab sections read and write. */
import type { App, WorkspaceLeaf } from "obsidian";
import type { RssDashboardSettings } from "../../types/types";

export interface SidebarSettingsPlugin {
  app: App;
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    sidebar?: { render(): void };
    render(): void;
  } | null>;
}
