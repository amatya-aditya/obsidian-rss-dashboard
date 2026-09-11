import { Notice } from "obsidian";
import type { PortableDataBundle, RssDashboardSettings } from "../types/types";
import { OpmlManager } from "./opml-manager";
import {
  exportBlob,
  copyTextToClipboard,
  type ExportBlobResult,
} from "../utils/export-utils";

/**
 * Service for import/export functionality: JSON settings, OPML feeds, and clipboard operations.
 * Extracted from RssDashboardPlugin to allow isolated testing.
 */
export class ImportExportService {
  private settings: RssDashboardSettings;
  private isMobile: boolean;
  private getPortableDataBundle?: () => PortableDataBundle;
  private importPortableDataBundle?: (bundle: unknown) => Promise<void>;

  /**
   * Creates a new ImportExportService instance
   * @param {Object} options Configuration options
   * @param {RssDashboardSettings} options.settings Plugin settings to export
   * @param {boolean} options.isMobile Whether running on mobile platform
   * @param {Function} [options.getPortableDataBundle] Optional function to retrieve portable data bundle
   * @param {Function} [options.importPortableDataBundle] Optional function to import portable data bundle
   */
  constructor(options: {
    settings: RssDashboardSettings;
    isMobile: boolean;
    getPortableDataBundle?: () => PortableDataBundle;
    importPortableDataBundle?: (bundle: unknown) => Promise<void>;
  }) {
    this.settings = options.settings;
    this.isMobile = options.isMobile;
    this.getPortableDataBundle = options.getPortableDataBundle;
    this.importPortableDataBundle = options.importPortableDataBundle;
  }

  /**
   * Serialize settings to JSON string, excluding feeds and folders
   * @returns {string} JSON string of user settings only
   */
  getUserSettingsJson(): string {
    const settingsOnly: Partial<RssDashboardSettings> = { ...this.settings };
    delete settingsOnly.feeds;
    delete settingsOnly.folders;
    delete settingsOnly.availableTags;
    return JSON.stringify(settingsOnly, null, 2);
  }

  /**
   * Export user settings (excluding feeds and folders) as a JSON file
   * @returns {Promise<void>}
   */
  async exportUserSettingsJson(): Promise<void> {
    const filename = "usersettings.json";
    const blob = new Blob([this.getUserSettingsJson()], {
      type: "application/json",
    });
    const result = await exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
    this.showExportNotice(result, filename);
  }

  /**
   * Export complete settings including feeds, folders, and tags as data.json
   * @returns {Promise<void>}
   */
  async exportDataJson(): Promise<void> {
    const filename = "data.json";
    const blob = new Blob([JSON.stringify(this.settings, null, 2)], {
      type: "application/json",
    });
    const result = await exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
    this.showExportNotice(result, filename);
  }

  /**
   * Export feeds and folder structure in OPML format
   * @returns {Promise<void>}
   */
  async exportOpml(): Promise<void> {
    const opmlContent = OpmlManager.generateOpml(
      this.settings.feeds,
      this.settings.folders,
    );
    const filename = "feeds.opml";
    const blob = new Blob([opmlContent], { type: "text/xml" });
    const result = await exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
    this.showExportNotice(result, filename);
  }

  /**
   * Export portable data bundle containing all feeds, folders, and settings
   * @returns {Promise<void>}
   */
  async exportPortableDataBundle(): Promise<void> {
    const filename = "rss-dashboard-portable-bundle.json";
    const bundle = this.getPortableDataBundle?.();
    const blob = new Blob(
      [JSON.stringify(bundle ?? { settings: this.settings }, null, 2)],
      {
        type: "application/json",
      },
    );
    const result = await exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
    this.showExportNotice(result, filename);
  }

  /**
   * Import a portable data bundle from a file
   * @param {File} file The bundle file to import
   * @returns {Promise<void>}
   * @throws {Error} If JSON parsing fails or import handler is not available
   */
  async importPortableDataBundleFromFile(file: File): Promise<void> {
    const text = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `Invalid portable bundle JSON${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }

    if (!this.importPortableDataBundle) {
      throw new Error(
        "Portable bundle import is not available in this context",
      );
    }

    await this.importPortableDataBundle(parsed);
    new Notice("Portable data bundle imported");
  }

  /**
   * Show a user notice based on export result
   * @param {ExportBlobResult} result The result of the export operation
   * @param {string} filename Name of the exported file
   * @returns {void}
   */
  public showExportNotice(result: ExportBlobResult, filename: string): void {
    if (result === "downloaded") {
      new Notice(`Downloading ${filename}`);
      return;
    }
    if (result === "shared" || result === "opened") {
      new Notice(`Opened save menu for ${filename}`);
      return;
    }
    if (result === "canceled") {
      new Notice("Export canceled");
      return;
    }
    new Notice(`Unable to export ${filename}`);
  }

  /**
   * Copy complete settings (data.json) to clipboard
   * @returns {Promise<void>}
   */
  async copyDataJsonToClipboard(): Promise<void> {
    const filename = "data.json";
    const result = await copyTextToClipboard(
      JSON.stringify(this.settings, null, 2),
    );
    this.showCopyNotice(result, filename);
  }

  /**
   * Copy user settings only (usersettings.json) to clipboard
   * @returns {Promise<void>}
   */
  async copyUserSettingsJsonToClipboard(): Promise<void> {
    const filename = "usersettings.json";
    const result = await copyTextToClipboard(this.getUserSettingsJson());
    this.showCopyNotice(result, filename);
  }

  /**
   * Copy feeds and folder structure in OPML format to clipboard
   * @returns {Promise<void>}
   */
  async copyOpmlToClipboard(): Promise<void> {
    const filename = "feeds.opml";
    const opmlContent = OpmlManager.generateOpml(
      this.settings.feeds,
      this.settings.folders,
    );
    const result = await copyTextToClipboard(opmlContent);
    this.showCopyNotice(result, filename);
  }

  /**
   * Show a user notice based on clipboard copy result
   * @param {string} result The result of the copy operation ("copied" or "failed")
   * @param {string} filename Name of the data that was copied
   * @returns {void}
   */
  public showCopyNotice(result: "copied" | "failed", filename: string): void {
    if (result === "copied") {
      new Notice(`Copied ${filename} to clipboard`);
      return;
    }
    new Notice(`Unable to copy ${filename}`);
  }
}
