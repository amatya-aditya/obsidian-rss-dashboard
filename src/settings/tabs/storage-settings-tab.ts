/**
 * Storage Settings Tab renderer.
 *
 * The tab entry point stays here while its renderers live in a focused module.
 */
import {
  getHiddenUserStateHint,
  renderStorageSettingsSections,
  type StorageSettingsPlugin,
} from "./storage-settings-sections";

export { getHiddenUserStateHint };

export function renderStorageSettingsTab(
  containerEl: HTMLElement,
  plugin: StorageSettingsPlugin,
): void {
  renderStorageSettingsSections(containerEl, plugin);
}
