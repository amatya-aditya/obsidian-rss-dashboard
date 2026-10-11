import type { App } from "obsidian";
import {
  loadVaultLocalStorage,
  saveVaultLocalStorage,
} from "./vault-local-storage";

/**
 * Vault-local key for the per-device Left-handed layout preference.
 *
 * Vault-local storage is Obsidian's per-vault `localStorage`, not a vault file,
 * so the value never reaches `data.json` or the exported user preferences and
 * cannot sync to another device.
 */
export const LEFT_HANDED_LAYOUT_STORAGE_KEY = "rss-left-handed-layout";

/** Root class that mirrors the Article footer in card and feed view. */
export const LEFT_HANDED_LAYOUT_ROOT_CLASS = "rss-dashboard-mirrored-footer";

/**
 * Reads the per-device Left-handed layout value. Anything other than a stored
 * `true` (absent, null, or a malformed value) means the setting is off.
 * @param {App} app Plugin app reference that owns the vault-local storage
 * @returns {boolean} Whether the mirrored footer is enabled on this device
 */
export function loadLeftHandedLayout(app: App): boolean {
  return loadVaultLocalStorage(app, LEFT_HANDED_LAYOUT_STORAGE_KEY) === true;
}

/**
 * Writes the per-device Left-handed layout value to vault-local storage.
 * @param {App} app Plugin app reference that owns the vault-local storage
 * @param {boolean} value Whether the mirrored footer is enabled on this device
 */
export function saveLeftHandedLayout(app: App, value: boolean): void {
  saveVaultLocalStorage(app, LEFT_HANDED_LAYOUT_STORAGE_KEY, value);
}
