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

  constructor(options: {
    settings: RssDashboardSettings;
    isMobile: boolean;
    getPortableDataBundle?: () => PortableDataBundle;
  }) {
    this.settings = options.settings;
    this.isMobile = options.isMobile;
    this.getPortableDataBundle = options.getPortableDataBundle;
  }

  getUserSettingsJson(): string {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { feeds, folders, availableTags, ...settingsOnly } = this.settings;
    return JSON.stringify(settingsOnly, null, 2);
  }

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

  async copyDataJsonToClipboard(): Promise<void> {
    const filename = "data.json";
    const result = await copyTextToClipboard(
      JSON.stringify(this.settings, null, 2),
    );
    this.showCopyNotice(result, filename);
  }

  async copyUserSettingsJsonToClipboard(): Promise<void> {
    const filename = "usersettings.json";
    const result = await copyTextToClipboard(this.getUserSettingsJson());
    this.showCopyNotice(result, filename);
  }

  async copyOpmlToClipboard(): Promise<void> {
    const filename = "feeds.opml";
    const opmlContent = OpmlManager.generateOpml(
      this.settings.feeds,
      this.settings.folders,
    );
    const result = await copyTextToClipboard(opmlContent);
    this.showCopyNotice(result, filename);
  }

  public showCopyNotice(result: "copied" | "failed", filename: string): void {
    if (result === "copied") {
      new Notice(`Copied ${filename} to clipboard`);
      return;
    }
    new Notice(`Unable to copy ${filename}`);
  }
}
