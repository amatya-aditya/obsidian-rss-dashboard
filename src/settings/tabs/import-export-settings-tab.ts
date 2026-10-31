/**
 * Import/Export Settings Tab renderer.
 *
 * The tab entry point stays here while its renderers live in
 * import-export-settings-sections.ts.
 * Exports:
 *   - renderImportExportSettingsTab(containerEl, plugin)
 */
import type RssDashboardPlugin from "../../../main";
import type { AutoBackupSettings } from "../../types/types";
import {
  FactoryResetConfirmModal,
  renderImportExportSettingsSections,
} from "./import-export-settings-sections";

export { FactoryResetConfirmModal };

/**
 * Returns a fresh copy of the default auto-backup settings.
 */
export function buildDefaultAutoBackupSettings(): AutoBackupSettings {
  return {
    backupDataJson: false,
    backupOpml: true,
    backupUserdata: true,
  };
}

/**
 * Appends .backup to the provided filename.
 */
export function getBackupFilename(filename: string): string {
  return `${filename}.backup`;
}

export function renderImportExportSettingsTab(
  containerEl: HTMLElement,
  plugin: RssDashboardPlugin,
): void {
  renderImportExportSettingsSections(containerEl, plugin);
}
