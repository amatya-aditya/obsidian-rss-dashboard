import type {
  Feed,
  FeedBundle,
  PortableDataBundle,
  RssDashboardSettings,
  SettingsBundle,
} from "../types/types";
import { OpmlManager } from "./opml-manager";
import {
  exportBlob,
  copyTextToClipboard,
  type ExportBlobResult,
} from "../utils/export-utils";
import {
  comparePreferences,
  compareStorageLocation,
  countFeedData,
  feedsWithBundleItems,
  type ImportConfirmation,
  type ImportDecision,
  type ImportKind,
  type ImportResult,
} from "./import-confirmation-model";
import {
  normalizeFolderPath,
  parseFeedBundle,
  parsePortableDataBundle,
  parseSettingsBundle,
} from "./feed-storage-repository";

export type {
  ImportConfirmation,
  ImportDecision,
  ImportKind,
  ImportResult,
} from "./import-confirmation-model";

/**
 * Service for import/export functionality: JSON settings, OPML feeds, and clipboard operations.
 * Extracted from RssDashboardPlugin to allow isolated testing.
 */
export class ImportExportService {
  private settings: RssDashboardSettings;
  private isMobile: boolean;
  private getPortableDataBundle?: () => PortableDataBundle;
  private importPortableDataBundle?: (bundle: unknown) => Promise<void>;
  private getFeedBundle?: () => FeedBundle;
  private importFeedBundle?: (bundle: unknown) => Promise<void>;
  private getSettingsBundle?: () => SettingsBundle;
  private importSettingsBundle?: (bundle: unknown) => Promise<void>;
  private importUserPreferences?: (
    preferences: Record<string, unknown>,
    kind: ImportKind,
  ) => Promise<void>;
  private confirmImport: (
    confirmation: ImportConfirmation,
  ) => Promise<ImportDecision>;
  private getUnloadedFeedCount: () => number;

  /**
   * Creates a new ImportExportService instance
   * @param {Object} options Configuration options
   * @param {RssDashboardSettings} options.settings Plugin settings to export
   * @param {boolean} options.isMobile Whether running on mobile platform
   * @param {Function} [options.getPortableDataBundle] Optional function to retrieve portable data bundle
   * @param {Function} [options.importPortableDataBundle] Optional function to import portable data bundle
   * @param {Function} [options.getFeedBundle] Optional function to retrieve the feed bundle
   * @param {Function} [options.importFeedBundle] Optional function to import a feed bundle
   * @param {Function} [options.getSettingsBundle] Optional function to retrieve the settings bundle
   * @param {Function} [options.importSettingsBundle] Optional function to import a settings bundle
   * @param {Function} [options.importUserPreferences] Optional function to apply a user preferences file, as a Replacing or Overwriting import
   * @param {Function} [options.confirmImport] Asks the user to confirm a Replacing or Overwriting import; without it, imports commit unasked
   * @param {Function} [options.getUnloadedFeedCount] Number of feeds whose articles this device has not loaded
   */
  constructor(options: {
    settings: RssDashboardSettings;
    isMobile: boolean;
    getPortableDataBundle?: () => PortableDataBundle;
    importPortableDataBundle?: (bundle: unknown) => Promise<void>;
    getFeedBundle?: () => FeedBundle;
    importFeedBundle?: (bundle: unknown) => Promise<void>;
    getSettingsBundle?: () => SettingsBundle;
    importSettingsBundle?: (bundle: unknown) => Promise<void>;
    importUserPreferences?: (
      preferences: Record<string, unknown>,
      kind: ImportKind,
    ) => Promise<void>;
    confirmImport?: (
      confirmation: ImportConfirmation,
    ) => Promise<ImportDecision>;
    getUnloadedFeedCount?: () => number;
  }) {
    this.settings = options.settings;
    this.isMobile = options.isMobile;
    this.getPortableDataBundle = options.getPortableDataBundle;
    this.importPortableDataBundle = options.importPortableDataBundle;
    this.getFeedBundle = options.getFeedBundle;
    this.importFeedBundle = options.importFeedBundle;
    this.getSettingsBundle = options.getSettingsBundle;
    this.importSettingsBundle = options.importSettingsBundle;
    this.importUserPreferences = options.importUserPreferences;
    this.confirmImport =
      options.confirmImport ?? (() => Promise.resolve("confirm"));
    this.getUnloadedFeedCount = options.getUnloadedFeedCount ?? (() => 0);
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
    const filename = "rss-dashboard-user-preferences.json";
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
   * Import a portable data bundle from a file, once the user confirms the
   * replacement
   * @param {File} file The bundle file to import
   * @returns {Promise<ImportResult>} Whether the import was committed or canceled
   * @throws {Error} If JSON parsing fails or import handler is not available
   */
  async importPortableDataBundleFromFile(file: File): Promise<ImportResult> {
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

    const bundle = parsePortableDataBundle(parsed);
    const current = this.currentPreferences();
    // The preferences as the import applies them: the bundle's own storage
    // mode and data.json location override the copies inside its metadata.
    const incoming: Record<string, unknown> = {
      ...bundle.metadata,
      storageMode: bundle.storageMode,
      metadataStorageMode:
        bundle.metadataStorageMode ?? current.metadataStorageMode,
      metadataStorageFolder:
        bundle.metadataStorageFolder ?? current.metadataStorageFolder,
    };
    if (typeof bundle.metadata.storageFolder === "string") {
      incoming.storageFolder = normalizeFolderPath(bundle.metadata.storageFolder);
    }

    const decision = await this.confirmImport({
      kind: "replacing",
      bundleType: "portable-data-bundle",
      fileName: file.name,
      feedData: {
        current: this.countCurrentFeedData(),
        incoming: countFeedData(
          feedsWithBundleItems({
            feeds: asArray(bundle.metadata.feeds),
            shards: bundle.shards,
          }),
          asArray(bundle.metadata.folders),
          asArray(bundle.metadata.availableTags),
        ),
      },
      unloadedFeedCount: this.getUnloadedFeedCount(),
      preferences: comparePreferences(current, incoming),
      storageLocationChange: compareStorageLocation(current, incoming),
    });
    if (decision !== "confirm") return "canceled";

    await this.importPortableDataBundle(parsed);
    return "committed";
  }

  /**
   * Export the feed bundle: feeds, folders, tags, articles, and article state,
   * with no app settings.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<ExportBlobResult>} The outcome of the export attempt
   */
  async exportFeedBundle(): Promise<ExportBlobResult> {
    const filename = "rss-dashboard-feed-bundle.json";
    const bundle = this.getFeedBundle?.();
    if (!bundle) {
      throw new Error("Feed bundle export is not available in this context");
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    return exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
  }

  /**
   * Import a feed bundle from a file, once the user confirms the replacement
   * @param {File} file The bundle file to import
   * @returns {Promise<ImportResult>} Whether the import was committed or canceled
   * @throws {Error} If JSON parsing fails or import handler is not available
   */
  async importFeedBundleFromFile(file: File): Promise<ImportResult> {
    const text = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `Invalid feed bundle JSON${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }

    if (!this.importFeedBundle) {
      throw new Error("Feed bundle import is not available in this context");
    }

    const bundle = parseFeedBundle(parsed);
    const decision = await this.confirmImport({
      kind: "replacing",
      bundleType: "feed-bundle",
      fileName: file.name,
      feedData: {
        current: this.countCurrentFeedData(),
        incoming: countFeedData(
          feedsWithBundleItems(bundle),
          bundle.folders,
          bundle.availableTags,
        ),
      },
      unloadedFeedCount: this.getUnloadedFeedCount(),
      preferences: null,
      storageLocationChange: null,
    });
    if (decision !== "confirm") return "canceled";

    await this.importFeedBundle(parsed);
    return "committed";
  }

  private countCurrentFeedData() {
    return countFeedData(
      this.settings.feeds,
      this.settings.folders,
      this.settings.availableTags,
    );
  }

  /**
   * Export the settings bundle: app preferences only, with no feeds, folders,
   * tags, or articles.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<ExportBlobResult>} The outcome of the export attempt
   */
  async exportSettingsBundle(): Promise<ExportBlobResult> {
    const filename = "rss-dashboard-settings-bundle.json";
    const bundle = this.getSettingsBundle?.();
    if (!bundle) {
      throw new Error(
        "Settings bundle export is not available in this context",
      );
    }
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    return exportBlob({
      blob,
      filename,
      isMobile: this.isMobile,
    });
  }

  /**
   * Import a settings bundle from a file, once the user confirms overwriting
   * their preferences
   * @param {File} file The bundle file to import
   * @returns {Promise<ImportResult>} Whether the import was committed or canceled
   * @throws {Error} If JSON parsing fails or import handler is not available
   */
  async importSettingsBundleFromFile(file: File): Promise<ImportResult> {
    const text = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `Invalid settings bundle JSON${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }

    if (!this.importSettingsBundle) {
      throw new Error(
        "Settings bundle import is not available in this context",
      );
    }

    const bundle = parseSettingsBundle(parsed);
    const incoming: Record<string, unknown> = { ...bundle.settings };
    if (typeof bundle.settings.storageFolder === "string") {
      incoming.storageFolder = normalizeFolderPath(bundle.settings.storageFolder);
    }
    if (bundle.metadataStorageMode !== undefined) {
      incoming.metadataStorageMode = bundle.metadataStorageMode;
    }
    if (bundle.metadataStorageFolder !== undefined) {
      incoming.metadataStorageFolder = bundle.metadataStorageFolder;
    }

    const current = this.currentPreferences();
    const decision = await this.confirmImport({
      kind: "overwriting",
      bundleType: "settings-bundle",
      fileName: file.name,
      feedData: null,
      unloadedFeedCount: this.getUnloadedFeedCount(),
      preferences: comparePreferences(current, incoming),
      storageLocationChange: compareStorageLocation(current, incoming),
    });
    if (decision !== "confirm") return "canceled";

    await this.importSettingsBundle(parsed);
    return "committed";
  }

  /**
   * Import a user preferences file, once the user confirms. A file carrying
   * feeds, folders, or tags replaces the feed list (a Replacing import);
   * any other file only sets the preferences it carries (an Overwriting one).
   * @param {File} file The preferences file to import
   * @returns {Promise<ImportResult>} Whether the import was committed or canceled
   * @throws {Error} If the file is not a JSON object or import handler is not available
   */
  async importUserPreferencesFromFile(file: File): Promise<ImportResult> {
    const text = await file.text();
    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `Invalid user preferences JSON${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("User preferences file must be a JSON object");
    }

    if (!this.importUserPreferences) {
      throw new Error(
        "User preferences import is not available in this context",
      );
    }

    const preferences = parsed as Record<string, unknown>;
    const { feeds, folders, availableTags } = preferences;
    const kind: ImportKind =
      Array.isArray(feeds) || Array.isArray(folders) || Array.isArray(availableTags)
        ? "replacing"
        : "overwriting";

    const current = this.currentPreferences();
    const incoming: Record<string, unknown> = { ...preferences };
    if (typeof preferences.storageFolder === "string") {
      incoming.storageFolder = normalizeFolderPath(preferences.storageFolder);
    }

    const decision = await this.confirmImport({
      kind,
      bundleType: "user-preferences",
      fileName: file.name,
      // Mirrors the import: feeds, folders, and tags the file omits are
      // kept (#386).
      feedData:
        kind === "replacing"
          ? {
              current: this.countCurrentFeedData(),
              incoming: countFeedData(
                Array.isArray(feeds) ? (feeds as Feed[]) : this.settings.feeds,
                Array.isArray(folders) ? folders : this.settings.folders,
                Array.isArray(availableTags)
                  ? availableTags
                  : this.settings.availableTags,
              ),
            }
          : null,
      unloadedFeedCount: this.getUnloadedFeedCount(),
      preferences: comparePreferences(current, incoming),
      storageLocationChange: compareStorageLocation(current, incoming),
    });
    if (decision !== "confirm") return "canceled";

    await this.importUserPreferences(preferences, kind);
    return "committed";
  }

  /** Current preferences, with the storage folder normalized as on import. */
  private currentPreferences(): Record<string, unknown> {
    return {
      ...this.settings,
      storageFolder: normalizeFolderPath(this.settings.storageFolder ?? ""),
    };
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
   * Copy user settings only (rss-dashboard-user-preferences.json) to clipboard.
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

  /**
   * Copy the portable data bundle (all feeds, folders, and settings) to clipboard.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<"copied" | "failed">} The outcome of the copy attempt
   */
  async copyPortableDataBundleToClipboard(): Promise<"copied" | "failed"> {
    const bundle = this.getPortableDataBundle?.() ?? {
      settings: this.settings,
    };
    return copyTextToClipboard(JSON.stringify(bundle, null, 2));
  }

  /**
   * Copy the feed bundle (feeds, folders, tags, articles, and article state)
   * to clipboard.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<"copied" | "failed">} The outcome of the copy attempt
   * @throws {Error} If no Feed bundle provider is available
   */
  async copyFeedBundleToClipboard(): Promise<"copied" | "failed"> {
    const bundle = this.getFeedBundle?.();
    if (!bundle) {
      throw new Error("Feed bundle export is not available in this context");
    }
    return copyTextToClipboard(JSON.stringify(bundle, null, 2));
  }

  /**
   * Copy the settings bundle (app preferences only) to clipboard.
   * Does not show a Notice — the caller (main.ts/views) turns the result into
   * user-facing feedback.
   * @returns {Promise<"copied" | "failed">} The outcome of the copy attempt
   * @throws {Error} If no Settings bundle provider is available
   */
  async copySettingsBundleToClipboard(): Promise<"copied" | "failed"> {
    const bundle = this.getSettingsBundle?.();
    if (!bundle) {
      throw new Error(
        "Settings bundle export is not available in this context",
      );
    }
    return copyTextToClipboard(JSON.stringify(bundle, null, 2));
  }
}

/** A bundle list the validator does not check, read as empty when absent. */
function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}
