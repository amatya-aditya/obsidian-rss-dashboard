import { Notice } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../types/types";
import type {
  FeedStorageRepository,
  PersistSettingsOptions,
} from "./feed-storage-repository";
import type { ImportKind } from "./import-export-service";

function storageLog(_message: string, _details?: unknown): void {}

function storageError(
  _message: string,
  _error: unknown,
  _details?: unknown,
): void {}

export interface SettingsImportApplierOptions {
  /** Returns the live settings object; the applier never holds its own copy. */
  getSettings: () => RssDashboardSettings;
  /** The plugin owns the settings reference; a Replacing or Overwriting import reassigns it. */
  setSettings: (settings: RssDashboardSettings) => void;
  isSettingsLoadFailed: () => boolean;
  /** Read on every call. */
  getFeedStorageRepository: () => FeedStorageRepository;
  getMetadataSaveCallback: () => (data: unknown) => Promise<void>;
  saveSettings: (options?: PersistSettingsOptions) => Promise<void>;
  migrateLegacySettings: () => boolean;
  initializeSettingsBackedServices: () => void;
  refreshSettingTab: () => void;
  refreshDashboardViews: () => Promise<void>;
  renderDiscoverView: () => Promise<void>;
}

/**
 * Applies a confirmed import: replaces or overwrites the settings, runs the
 * legacy migration, rebuilds the settings-backed services, saves, and redraws
 * the setting tab and open views.
 */
export class SettingsImportApplier {
  constructor(private readonly options: SettingsImportApplierOptions) {}

  private get settings(): RssDashboardSettings {
    return this.options.getSettings();
  }

  private get feedStorageRepository(): FeedStorageRepository {
    return this.options.getFeedStorageRepository();
  }

  public async applyUserPreferencesImport(
    parsed: Partial<RssDashboardSettings>,
    kind: ImportKind,
  ): Promise<void> {
    const parsedWithCollections = parsed as Partial<RssDashboardSettings> & {
      feeds?: unknown;
      folders?: unknown;
      availableTags?: unknown;
    };

    if (kind === "replacing") {
      const { folders, availableTags } = this.settings;
      this.options.setSettings(
        Object.assign({}, DEFAULT_SETTINGS, this.settings, parsed),
      );
      // A file without a feed list keeps the current feeds, as it keeps
      // the current folders and tags (issue #386).
      const importedFeeds = parsedWithCollections.feeds;
      const replacesFeedList = Array.isArray(importedFeeds);
      if (replacesFeedList) {
        this.settings.feeds = importedFeeds;
      }
      this.settings.folders = Array.isArray(parsedWithCollections.folders)
        ? parsedWithCollections.folders
        : folders;
      this.settings.availableTags = Array.isArray(
        parsedWithCollections.availableTags,
      )
        ? parsedWithCollections.availableTags
        : availableTags;

      this.options.migrateLegacySettings();
      for (const feed of this.settings.feeds) {
        if (!feed.keywordRules) {
          feed.keywordRules = {
            overrideGlobalRules: false,
            includeLogic: "AND",
            rules: [],
          };
          continue;
        }
        feed.keywordRules = Object.assign(
          {},
          {
            overrideGlobalRules: false,
            includeLogic: "AND",
            rules: [],
          },
          feed.keywordRules,
        );

        // Migrate legacy feeds: apply default auto-delete and maxItems if not set
        // This ensures feeds imported before the fix will respect the global defaults
        if (typeof feed.autoDeleteDuration !== "number") {
          feed.autoDeleteDuration = this.settings.defaultAutoDeleteDuration;
        }
        if (typeof feed.maxItemsLimit !== "number") {
          feed.maxItemsLimit = this.settings.maxItems;
        }
      }

      this.options.initializeSettingsBackedServices();
      // When the imported file replaces the feed list, feeds it lacks keep
      // their article state rather than counting as removed (issue #374).
      await this.options.saveSettings({ replacesFeedList });
      await this.options.refreshDashboardViews();
      await this.options.renderDiscoverView();

      new Notice("Imported JSON with feeds and settings");
      return;
    }

    const {
      feeds: _feeds,
      folders: _folders,
      availableTags: _availableTags,
      ...settingsOnly
    } = parsed as Partial<RssDashboardSettings> & {
      feeds?: unknown;
      folders?: unknown;
      availableTags?: unknown;
    };
    void _feeds;
    void _folders;
    void _availableTags;

    this.options.setSettings(
      Object.assign({}, DEFAULT_SETTINGS, this.settings, settingsOnly),
    );

    // Keep legacy keys and nested defaults normalized after import.
    this.options.migrateLegacySettings();

    this.options.initializeSettingsBackedServices();
    await this.options.saveSettings();
    await this.options.refreshDashboardViews();
    await this.options.renderDiscoverView();

    new Notice("Imported rss-dashboard-user-preferences.json");
  }

  public async applyPortableDataBundleImport(bundle: unknown): Promise<void> {
    if (this.options.isSettingsLoadFailed()) return;
    storageLog("Plugin portable bundle import requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });
    try {
      await this.feedStorageRepository.importPortableDataBundle(
        bundle,
        this.settings,
        this.options.getMetadataSaveCallback(),
      );
      this.options.migrateLegacySettings();
      this.options.initializeSettingsBackedServices();
      this.options.refreshSettingTab();

      await this.options.refreshDashboardViews();
      await this.options.renderDiscoverView();
      storageLog("Plugin portable bundle import completed", {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
        feedCount: this.settings.feeds.length,
      });
    } catch (error) {
      storageError("Plugin portable bundle import failed", error, {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async applyFeedBundleImport(bundle: unknown): Promise<void> {
    if (this.options.isSettingsLoadFailed()) return;
    storageLog("Plugin Feed bundle import requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
      feedCount: this.settings.feeds.length,
    });
    try {
      await this.feedStorageRepository.importFeedBundle(
        bundle,
        this.settings,
        this.options.getMetadataSaveCallback(),
      );
      this.options.migrateLegacySettings();
      this.options.initializeSettingsBackedServices();
      this.options.refreshSettingTab();

      await this.options.refreshDashboardViews();
      await this.options.renderDiscoverView();
      storageLog("Plugin Feed bundle import completed", {
        feedCount: this.settings.feeds.length,
      });
    } catch (error) {
      storageError("Plugin Feed bundle import failed", error, {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  public async applySettingsBundleImport(bundle: unknown): Promise<void> {
    if (this.options.isSettingsLoadFailed()) return;
    storageLog("Plugin Settings bundle import requested", {
      currentMode: this.settings.storageMode,
      folder: this.settings.storageFolder,
    });
    try {
      await this.feedStorageRepository.importSettingsBundle(
        bundle,
        this.settings,
        this.options.getMetadataSaveCallback(),
      );
      this.options.migrateLegacySettings();
      this.options.initializeSettingsBackedServices();
      this.options.refreshSettingTab();

      await this.options.refreshDashboardViews();
      await this.options.renderDiscoverView();
      storageLog("Plugin Settings bundle import completed", {
        mode: this.settings.storageMode,
      });
    } catch (error) {
      storageError("Plugin Settings bundle import failed", error, {
        currentMode: this.settings.storageMode,
        folder: this.settings.storageFolder,
      });
      throw error instanceof Error ? error : new Error(String(error));
    }
  }
}
