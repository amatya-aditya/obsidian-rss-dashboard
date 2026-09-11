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
   * Export user settings (excluding feeds and folders) as a JSON file.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<ExportBlobResult>} The outcome of the export attempt
   */
  async exportUserSettingsJson(): Promise<ExportBlobResult> {
    const filename = "usersettings.json";
    const blob = new Blob([this.getUserSettingsJson()], {
      type: "application/json",
    });
    return exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
  }

  /**
   * Export complete settings including feeds, folders, and tags as data.json.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<ExportBlobResult>} The outcome of the export attempt
   */
  async exportDataJson(): Promise<ExportBlobResult> {
    const filename = "data.json";
    const blob = new Blob([JSON.stringify(this.settings, null, 2)], {
      type: "application/json",
    });
    return exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
  }

  /**
   * Export feeds and folder structure in OPML format.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<ExportBlobResult>} The outcome of the export attempt
   */
  async exportOpml(): Promise<ExportBlobResult> {
    const opmlContent = OpmlManager.generateOpml(
      this.settings.feeds,
      this.settings.folders,
    );
    const filename = "feeds.opml";
    const blob = new Blob([opmlContent], { type: "text/xml" });
    return exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
  }

  /**
   * Export portable data bundle containing all feeds, folders, and settings.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<ExportBlobResult>} The outcome of the export attempt
   */
  async exportPortableDataBundle(): Promise<ExportBlobResult> {
    const filename = "rss-dashboard-portable-bundle.json";
    const bundle = this.getPortableDataBundle?.();
    const blob = new Blob(
      [JSON.stringify(bundle ?? { settings: this.settings }, null, 2)],
      {
        type: "application/json",
      },
    );
    return exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
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
  }

  /**
   * Copy complete settings (data.json) to clipboard.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<"copied" | "failed">} The outcome of the copy attempt
   */
  async copyDataJsonToClipboard(): Promise<"copied" | "failed"> {
    return copyTextToClipboard(JSON.stringify(this.settings, null, 2));
  }

  /**
   * Copy user settings only (usersettings.json) to clipboard.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<"copied" | "failed">} The outcome of the copy attempt
   */
  async copyUserSettingsJsonToClipboard(): Promise<"copied" | "failed"> {
    return copyTextToClipboard(this.getUserSettingsJson());
  }

  /**
   * Copy feeds and folder structure in OPML format to clipboard.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<"copied" | "failed">} The outcome of the copy attempt
   */
  async copyOpmlToClipboard(): Promise<"copied" | "failed"> {
    const opmlContent = OpmlManager.generateOpml(
      this.settings.feeds,
      this.settings.folders,
    );
    return copyTextToClipboard(opmlContent);
  }
}
