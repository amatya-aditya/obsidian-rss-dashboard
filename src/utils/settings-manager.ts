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
  close?: () => void;
  containerEl?: HTMLElement;
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

/**
 * Opens the settings modal so it sits above every other open modal.
 *
 * Obsidian leaves an already-open settings modal where it is, so a modal
 * launched from a settings tab (such as the starred import) keeps covering
 * it. Reopening moves settings to the top of the modal stack and its focus
 * scope, leaving the other modal open underneath.
 *
 * @param setting Internal settings manager from getSettingManager
 */
export function openSettingsOnTop(setting: SettingManager): void {
  if (setting.close && hasModalAbove(setting.containerEl)) {
    setting.close();
  }
  setting.open();
}

function hasModalAbove(containerEl: HTMLElement | undefined): boolean {
  if (!containerEl?.isConnected) return false;
  let sibling = containerEl.nextElementSibling;
  while (sibling) {
    if (sibling.matches(".modal-container")) return true;
    sibling = sibling.nextElementSibling;
  }
  return false;
}
