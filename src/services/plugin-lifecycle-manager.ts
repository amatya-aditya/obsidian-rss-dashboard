/**
 * PluginLifecycleManager
 *
 * Owns the plugin startup and teardown sequences that are not owned by other
 * dedicated services:
 *   - Scheduling the startup saved-article validation
 *   - Setting up and cancelling the startup refresh timeout
 *   - Flushing the playback-progress debounce on unload
 *   - Triggering auto-backups on unload
 *   - Performing factory resets
 *
 * Extracted from RssDashboardPlugin (main.ts) as part of Phase 5 of the
 * main-refactoring-roadmap.
 *
 * Backward compatibility: main.ts retains 1-line delegating facades for every
 * public method, so all existing callers continue to work unchanged.
 */

import { Notice } from "obsidian";
import type { RssDashboardSettings } from "../types/types";
import { DEFAULT_SETTINGS } from "../types/types";
import { getAllArticles } from "../utils/plugin-utils";
import {
  isRecord,
  isLegacyPlaybackProgressEntry,
} from "../utils/platform-utils";
import type { FeedItem } from "../types/types";

type LegacyLocalStorageApi = {
  loadLocalStorage?: (key: string) => unknown;
  removeLocalStorage?: (key: string) => void;
  saveLocalStorage?: (key: string, value: unknown) => void;
};

function storageLog(_message: string, _details?: unknown): void {}

// ---------------------------------------------------------------------------
// Dependency interfaces – minimal surface area for testability
// ---------------------------------------------------------------------------

export interface IPluginForLifecycle {
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<{ refresh(): void } | null>;
  getActiveDiscoverView(): Promise<{ render(): void } | null>;
  articleSaver: {
    fixSavedFilePaths(articles: unknown[]): Promise<void>;
    checkSavedFileExists(item: unknown): boolean;
  };
  /** Called after factory reset re-initialises all services. */
  initializeSettingsBackedServices(): void;
  /** Opens/refreshes the settings tab after a factory reset. */
  settingTab: { display(): void } | null;
  refreshFeeds(): Promise<void>;
  cancelPendingStartupRefresh(): void;
  /** Optional – fires backup on unload. */
  performAutoBackups?(): Promise<void>;
}

export interface IAppForLifecycle {
  workspace: {
    onLayoutReady?: (callback: () => void) => void;
    trigger?(event: string, ...args: unknown[]): void;
  };
  removeLocalStorage?: (key: string) => void;
  saveLocalStorage?: (key: string, value: unknown) => void;
}

// ---------------------------------------------------------------------------

export class PluginLifecycleManager {
  private static readonly FACTORY_RESET_LOCAL_STORAGE_KEYS = [
    "rss-discover-filters",
    "rss-podcast-progress",
    "rss-first-launch-coachmark-shown",
  ] as const;

  private hasCompletedStartupSavedArticleValidation = false;
  private startupRefreshTimeoutId: number | null = null;
  private progressSaveDebounce: number | null = null;

  constructor(
    private readonly app: IAppForLifecycle,
    private readonly plugin: IPluginForLifecycle,
  ) {}

  // -------------------------------------------------------------------------
  // Startup
  // -------------------------------------------------------------------------

  /**
   * Run after settings are loaded. Validates saved articles, wires up the
   * startup refresh timer, and registers the auto-refresh interval.
   *
   * The caller (main.ts onload) is responsible for registering the recurring
   * interval via `registerInterval` – that requires the Obsidian Plugin API
   * and cannot be owned here.  This method handles the *one-shot* startup
   * refresh timeout only.
   */
  public scheduleStartupRefreshIfNeeded(
    autoRefreshIntervalMs: number | null,
    startupRefreshDelaySeconds: number,
    lastRefreshTimestamp: number,
  ): void {
    const shouldRefreshOnOpen = (): boolean => {
      if (autoRefreshIntervalMs === null) return false;
      if (!lastRefreshTimestamp) return true;
      const elapsed = Date.now() - lastRefreshTimestamp;
      return elapsed >= autoRefreshIntervalMs;
    };

    if (!shouldRefreshOnOpen()) return;

    const delay = Number.isFinite(startupRefreshDelaySeconds)
      ? startupRefreshDelaySeconds
      : DEFAULT_SETTINGS.startupRefreshDelaySeconds;

    if (delay > 0) {
      this.startupRefreshTimeoutId = activeWindow.setTimeout(() => {
        this.startupRefreshTimeoutId = null;
        void this.plugin.refreshFeeds();
      }, delay * 1000);
    } else {
      void this.plugin.refreshFeeds();
    }
  }

  /** Cancel the pending startup refresh timeout (called from refresh-feeds command and onunload). */
  public cancelPendingStartupRefresh(): void {
    if (this.startupRefreshTimeoutId !== null) {
      activeWindow.clearTimeout(this.startupRefreshTimeoutId);
      this.startupRefreshTimeoutId = null;
    }
  }

  /**
   * Hooks into workspace.onLayoutReady so that saved-article validation
   * (file-existence checks + path fixes) runs after the vault is warm.
   */
  public scheduleStartupSavedArticleValidation(): void {
    const workspaceWithLayoutReady = this.app.workspace as typeof this.app.workspace & {
      onLayoutReady?: (callback: () => void) => void;
    };

    if (typeof workspaceWithLayoutReady.onLayoutReady === "function") {
      workspaceWithLayoutReady.onLayoutReady(() => {
        void this.reconcileSavedArticlesOnStartup();
      });
      return;
    }

    void this.reconcileSavedArticlesOnStartup();
  }

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  /**
   * Flush any pending progress save and trigger auto-backups.
   * Called from main.ts `onunload()`.
   */
  public onUnload(): void {
    if (this.progressSaveDebounce !== null) {
      window.clearTimeout(this.progressSaveDebounce);
      this.progressSaveDebounce = null;
      void this.plugin.saveSettings();
    }

    this.cancelPendingStartupRefresh();

    if (this.plugin.performAutoBackups) {
      void this.plugin.performAutoBackups();
    }
  }

  // -------------------------------------------------------------------------
  // Factory reset
  // -------------------------------------------------------------------------

  public async performFactoryReset(): Promise<void> {
    const resetSettings = this.buildFactoryResetSettings();
    this.plugin.settings = resetSettings;
    this.plugin.initializeSettingsBackedServices();
    this.clearFactoryResetLocalStorage();

    await this.plugin.saveSettings();

    const dashboardView = await this.plugin.getActiveDashboardView();
    if (dashboardView) {
      dashboardView.refresh();
    }

    const discoverView = await this.plugin.getActiveDiscoverView();
    if (discoverView) {
      discoverView.render();
    }

    if (this.plugin.settingTab) {
      this.plugin.settingTab.display();
    }

    new Notice("RSS Dashboard restored to factory defaults.");
  }

  // -------------------------------------------------------------------------
  // Saved-article validation (private)
  // -------------------------------------------------------------------------

  private async reconcileSavedArticlesOnStartup(): Promise<void> {
    if (this.hasCompletedStartupSavedArticleValidation) return;
    this.hasCompletedStartupSavedArticleValidation = true;

    const allArticles = getAllArticles(this.plugin.settings);
    await this.plugin.articleSaver.fixSavedFilePaths(allArticles);
    await this.validateSavedArticles();
  }

  private async validateSavedArticles(): Promise<void> {
    let updatedCount = 0;

    for (const feed of this.plugin.settings.feeds) {
      for (const item of feed.items) {
        if (item.saved) {
          const fileExists = this.plugin.articleSaver.checkSavedFileExists(item);
          if (!fileExists) {
            item.saved = false;
            item.savedFilePath = undefined;

            if (item.tags) {
              item.tags = item.tags.filter(
                (tag) => tag.name.toLowerCase() !== "saved",
              );
            }
            updatedCount++;
          }
        }
      }
    }

    if (updatedCount > 0) {
      await this.plugin.saveSettings();

      const view = await this.plugin.getActiveDashboardView();
      if (view) {
        (view as { render?(): void; refresh(): void }).render?.();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Factory-reset helpers (private)
  // -------------------------------------------------------------------------

  private cloneFactoryResetFolders(
    folders: RssDashboardSettings["folders"],
    timestamp: number,
  ): RssDashboardSettings["folders"] {
    return folders.map((folder) => ({
      ...folder,
      subfolders: this.cloneFactoryResetFolders(
        folder.subfolders ?? [],
        timestamp,
      ),
      createdAt: timestamp,
      modifiedAt: timestamp,
    }));
  }

  // -------------------------------------------------------------------------
  // Playback Progress (moved from main.ts)
  // -------------------------------------------------------------------------

  public updatePlaybackProgress(
    feedUrl: string,
    itemGuid: string,
    position: number,
    duration: number,
    flush = false,
    sourceItem?: FeedItem,
  ): void {
    if (!this.plugin.settings.media.rememberPlaybackProgress) {
      return;
    }

    let item: FeedItem | undefined;

    const resolveVideoMatch = (
      candidateFeed?: (typeof this.plugin.settings.feeds)[number],
    ) => {
      if (!sourceItem || sourceItem.mediaType !== "video") {
        return undefined;
      }

      const feedsToSearch = candidateFeed
        ? [candidateFeed]
        : this.plugin.settings.feeds;

      for (const feed of feedsToSearch) {
        const exactRef = feed.items.find((entry) => entry === sourceItem);
        if (exactRef) {
          return exactRef;
        }

        const byVideoId = sourceItem.videoId
          ? feed.items.find((entry) => entry.videoId === sourceItem.videoId)
          : undefined;
        if (byVideoId) {
          return byVideoId;
        }

        if (sourceItem.link) {
          const byLink = feed.items.find(
            (entry) => entry.link === sourceItem.link,
          );
          if (byLink) {
            return byLink;
          }
        }
      }

      return undefined;
    };

    if (feedUrl) {
      const feed = this.plugin.settings.feeds.find((f) => f.url === feedUrl);
      item = feed?.items.find((i) => i.guid === itemGuid);
      if (!item) {
        item = resolveVideoMatch(feed);
      }
    }

    if (!item) {
      for (const feed of this.plugin.settings.feeds) {
        const match = feed.items.find((i) => i.guid === itemGuid);
        if (match) {
          item = match;
          break;
        }
      }
    }

    if (!item) {
      item = resolveVideoMatch();
    }

    if (!item) return;

    if (!(duration > 0) || position < 0) return;

    item.playbackProgress = { position, duration, lastUpdated: Date.now() };

    if (flush) {
      if (this.progressSaveDebounce !== null) {
        window.clearTimeout(this.progressSaveDebounce);
        this.progressSaveDebounce = null;
      }
      void this.plugin.saveSettings();
      return;
    }

    // Throttle progress persistence: schedule one save at a time.
    // A reset-on-every-event debounce can starve saves during active playback.
    if (this.progressSaveDebounce === null) {
      this.progressSaveDebounce = window.setTimeout(() => {
        void this.plugin.saveSettings();
        this.progressSaveDebounce = null;
      }, 2000);
    }
  }

  public async clearPlaybackProgress(): Promise<number> {
    if (this.progressSaveDebounce !== null) {
      window.clearTimeout(this.progressSaveDebounce);
      this.progressSaveDebounce = null;
    }

    let clearedCount = 0;
    for (const feed of this.plugin.settings.feeds) {
      for (const item of feed.items) {
        if (!item.playbackProgress) {
          continue;
        }

        delete item.playbackProgress;
        clearedCount++;
      }
    }

    const appWithLocalStorage = this.app as unknown as LegacyLocalStorageApi;
    if (typeof appWithLocalStorage.removeLocalStorage === "function") {
      appWithLocalStorage.removeLocalStorage("rss-podcast-progress");
    } else if (typeof appWithLocalStorage.saveLocalStorage === "function") {
      appWithLocalStorage.saveLocalStorage("rss-podcast-progress", null);
    }

    if (clearedCount > 0) {
      await this.plugin.saveSettings();
    }

    return clearedCount;
  }

  public async migrateMediaProgressOnStartup(): Promise<void> {
    if (!this.plugin.settings.media.rememberPlaybackProgress) {
      return;
    }

    const appWithLocalStorage = this.app as unknown as LegacyLocalStorageApi;
    if (typeof appWithLocalStorage.loadLocalStorage !== "function") return;

    const legacyProgress = appWithLocalStorage.loadLocalStorage(
      "rss-podcast-progress",
    );
    if (!isRecord(legacyProgress)) return;

    let migratedCount = 0;
    for (const guid in legacyProgress) {
      const data = legacyProgress[guid];
      if (!isLegacyPlaybackProgressEntry(data)) continue;

      for (const feed of this.plugin.settings.feeds) {
        const item = feed.items.find((i) => i.guid === guid);
        if (!item) continue;

        item.playbackProgress = {
          position: data.position,
          duration: data.duration,
          lastUpdated: Date.now(),
        };
        migratedCount++;
        break;
      }
    }

    if (migratedCount > 0) {
      storageLog(
        `[RSS Dashboard] Migrated ${migratedCount} media progress items.`,
      );
      await this.plugin.saveSettings();
    }

    if (typeof appWithLocalStorage.removeLocalStorage === "function") {
      appWithLocalStorage.removeLocalStorage("rss-podcast-progress");
    }
  }

  private buildFactoryResetSettings(): RssDashboardSettings {
    const settings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as RssDashboardSettings;
    const timestamp = Date.now();

    settings.folders = this.cloneFactoryResetFolders(
      DEFAULT_SETTINGS.folders,
      timestamp,
    );

    return settings;
  }

  private clearFactoryResetLocalStorage(): void {
    const appWithLocalStorage = this.app as unknown as {
      removeLocalStorage?: (key: string) => void;
      saveLocalStorage?: (key: string, value: unknown) => void;
    };

    for (const key of PluginLifecycleManager.FACTORY_RESET_LOCAL_STORAGE_KEYS as readonly string[]) {
      if (typeof appWithLocalStorage.removeLocalStorage === "function") {
        appWithLocalStorage.removeLocalStorage(key);
        continue;
      }

      if (typeof appWithLocalStorage.saveLocalStorage === "function") {
        appWithLocalStorage.saveLocalStorage(key, null);
      }
    }
  }
}
