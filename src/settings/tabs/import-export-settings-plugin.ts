/** The plugin surface the Import/Export tab sections read and write. */
import type { App, WorkspaceLeaf } from "obsidian";
import type { ImportResult } from "../../services/import-export-service";
import type { PersistSettingsOptions } from "../../services/feed-storage-runner";
import type { ImportOpmlModal } from "../../modals/import-opml-modal";
import type { RssDashboardSettings } from "../../types/types";

/**
 * The plugin the OPML and starred import modals take. Named through the
 * modal's constructor so this module never imports `main.ts`.
 */
export type ImportModalPlugin = ConstructorParameters<
  typeof ImportOpmlModal
>[1];

export interface ImportExportSettingsPlugin {
  app: App;
  settings: RssDashboardSettings;
  saveSettings(options?: PersistSettingsOptions): Promise<void>;
  getActiveDashboardView(): Promise<{
    leaf: WorkspaceLeaf;
    render(): void;
  } | null>;
  exportDataJson(): Promise<void>;
  copyDataJsonToClipboard(): Promise<void>;
  exportPortableDataBundle(): Promise<void>;
  importPortableDataBundleFromFile(file: File): Promise<ImportResult>;
  copyPortableDataBundleToClipboard(): Promise<void>;
  exportFeedBundle(): Promise<void>;
  importFeedBundleFromFile(file: File): Promise<ImportResult>;
  copyFeedBundleToClipboard(): Promise<void>;
  exportSettingsBundle(): Promise<void>;
  importSettingsBundleFromFile(file: File): Promise<ImportResult>;
  copySettingsBundleToClipboard(): Promise<void>;
  exportUserSettingsJson(): Promise<void>;
  importUserSettingsJsonFromFile(file: File): Promise<ImportResult>;
  copyUserSettingsJsonToClipboard(): Promise<void>;
  exportOpml(): void;
  copyOpmlToClipboard(): Promise<void>;
  performFactoryReset(): Promise<void>;
}
