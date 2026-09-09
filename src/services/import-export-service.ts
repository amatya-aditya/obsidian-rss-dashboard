import { Notice } from "obsidian";
import type { PortableDataBundle, RssDashboardSettings } from "../types/types";
import { OpmlManager } from "./opml-manager";
import { generateFreshRssSubscriptionOpml } from "./freshrss-opml-export";
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

  getUserSettingsJson(): string {
    const settingsOnly: Partial<RssDashboardSettings> = { ...this.settings };
    delete settingsOnly.feeds;
    delete settingsOnly.folders;
    delete settingsOnly.availableTags;
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

  /**
   * Exports the dedicated FreshRSS subscription export profile: a
   * subscription-only OPML 2.0 artifact, not an article-state backup. See
   * `generateFreshRssSubscriptionOpml` for the excluded-data guarantees.
   */
  async exportFreshRssOpml(): Promise<void> {
    const { opml, warnings } = generateFreshRssSubscriptionOpml(
      this.settings.feeds,
    );
    const filename = "freshrss-subscriptions.opml";
    const blob = new Blob([opml], { type: "text/xml" });
    const result = await exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
    this.showExportNotice(result, filename);
    this.reportFreshRssExportWarnings(warnings);
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

  /**
   * Copies the dedicated FreshRSS subscription export profile to the
   * clipboard. See `exportFreshRssOpml` for the excluded-data guarantees.
   */
  async copyFreshRssOpmlToClipboard(): Promise<void> {
    const filename = "freshrss-subscriptions.opml";
    const { opml, warnings } = generateFreshRssSubscriptionOpml(
      this.settings.feeds,
    );
    const result = await copyTextToClipboard(opml);
    this.showCopyNotice(result, filename);
    this.reportFreshRssExportWarnings(warnings);
  }

  /**
   * Surfaces every deterministic duplicate-feed-URL collapse from the
   * FreshRSS subscription export. Never silent: at minimum a summary Notice
   * fires, and every individual collapse is also logged for inspection.
   */
  public reportFreshRssExportWarnings(warnings: string[]): void {
    if (warnings.length === 0) {
      return;
    }
    new Notice(
      `FreshRSS subscription export: collapsed ${warnings.length} duplicate feed URL${
        warnings.length === 1 ? "" : "s"
      }. See the developer console for details.`,
    );
    warnings.forEach((warning) => {
      console.warn(`[RSS Dashboard] ${warning}`);
    });
  }
}
