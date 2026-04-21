/**
 * Settings tab name constants and pure helpers.
 *
 * Extracted into a separate zero-dependency module so tests can import these
 * without pulling in the Obsidian PluginSettingTab class.
 */

/** The ordered list of settings tab names. */
export const SETTINGS_TAB_NAMES = [
  "General",
  "Display",
  "Media",
  "Article saving",
  "Rules",
  "Highlights",
  "Import/Export",
  "Tags",
  "About",
] as const;

export type SettingsTabName = (typeof SETTINGS_TAB_NAMES)[number];

/** Returns true if @param name is a known settings tab name. */
export function isValidSettingsTab(name: string): name is SettingsTabName {
  return (SETTINGS_TAB_NAMES as readonly string[]).includes(name);
}

/** Returns the default tab shown when the settings panel is first opened. */
export function getInitialTab(): SettingsTabName {
  return SETTINGS_TAB_NAMES[0];
}
