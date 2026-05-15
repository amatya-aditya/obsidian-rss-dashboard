/**
 * Internal Obsidian Settings Manager Utility
 *
 * WARNING: This utility accesses undocumented internal Obsidian APIs (app.setting).
 * There is currently NO public API for programmatically opening settings or navigating to plugin tabs.
 * This is a community-standard workaround, used by many plugins, and is necessary for feature parity.
 *
 * If Obsidian adds a public API in the future, migrate all usages here.
 *
 * See: https://github.com/obsidianmd/obsidian-api/issues/123
 */
import type { App } from "obsidian";

export interface SettingManager {
  open: () => void;
  openTabById: (pluginId: string) => void;
}

type AppWithInternalSetting = App & {
  setting?: SettingManager;
};

/**
 * Returns the internal settings manager if available, otherwise null.
 *
 * @param app Obsidian app instance
 * @returns SettingManager or null
 */
export function getSettingManager(app: App): SettingManager | null {
  const setting = (app as AppWithInternalSetting).setting;
  return setting ?? null;
}

/**
 * Opens the settings panel and navigates to the plugin tab if possible.
 *
 * @param app Obsidian app instance
 * @param pluginId Plugin manifest id
 * @returns true if successful, false otherwise
 */
export function openSettingsPanel(app: App, pluginId: string): boolean {
  const setting = getSettingManager(app);
  if (!setting) return false;
  setting.open();
  setting.openTabById(pluginId);
  return true;
}
