import type { Feed, Folder } from "../types/types";

export interface EnsureFolderExistsOptions {
  saveSettings?: boolean;
  refreshView?: boolean;
  onSaveSettings?: () => Promise<void>;
  onRefreshView?: () => Promise<void>;
}

export interface RepairMissingFoldersOptions {
  onSaveSettings?: () => Promise<void>;
}

/**
 * Service for managing folder hierarchies in RSS Dashboard settings.
 * Provides utilities to check, create, and repair folder paths.
 */
export class FolderService {
  private settings: { folders: Folder[]; feeds?: Feed[] } | undefined;
  private feedsCache: Feed[] | undefined;

  constructor(settings?: { folders: Folder[]; feeds?: Feed[] }) {
    this.settings = settings;
    this.feedsCache = settings?.feeds;
  }

  /**
   * Check whether a folder path exists in the settings hierarchy
   * @param folderPath Path to check (e.g. "News/Tech")
   * @returns true if path exists, false otherwise
   */
  folderPathExists(folderPath: string): boolean {
    if (!this.settings?.folders) {
      return folderPath === "Uncategorized" || !folderPath;
    }

    if (!folderPath || folderPath === "Uncategorized") {
      return true;
    }

    const parts = folderPath
      .split("/")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (parts.length === 0) {
      return true;
    }

    let currentLevel = this.settings.folders;
    for (const part of parts) {
      const folder = currentLevel.find((f) => f.name === part);
      if (!folder) {
        return false;
      }
      currentLevel = folder.subfolders || [];
    }

    return true;
  }

  /**
   * Ensure a folder path exists, creating any missing intermediate folders.
   * Returns true if the path was created, false if it already existed.
   * @param folderPath Path to ensure (e.g. "News/Tech")
   * @param options Control save/refresh behavior and provide callbacks
   * @returns true if folder(s) were created, false if they already existed
   */
  async ensureFolderExists(
    folderPath: string,
    options?: EnsureFolderExistsOptions,
  ): Promise<boolean> {
    if (!this.settings?.folders) {
      return false;
    }

    if (!folderPath || folderPath === "Uncategorized") return false;

    const shouldSave = options?.saveSettings ?? true;
    const shouldRefresh = options?.refreshView ?? true;
    const parts = folderPath.split("/");
    let currentLevel = this.settings.folders;
    let changed = false;

    for (const rawPart of parts) {
      const part = rawPart.trim();
      if (!part) continue;
      let folder = currentLevel.find((f) => f.name === part);
      if (!folder) {
        folder = {
          name: part,
          subfolders: [],
          createdAt: Date.now(),
          modifiedAt: Date.now(),
        };
        currentLevel.push(folder);
        changed = true;
      }
      if (!folder.subfolders) {
        folder.subfolders = [];
      }
      currentLevel = folder.subfolders;
    }

    if (changed) {
      if (shouldSave && options?.onSaveSettings) {
        await options.onSaveSettings();
      }
      if (shouldRefresh && options?.onRefreshView) {
        await options.onRefreshView();
      }
    }

    return changed;
  }

  /**
   * Repair missing folder paths referenced by feeds.
   * Creates any missing folders detected in feed folder properties.
   * @param options Provide callbacks for saving settings
   */
  async repairMissingFolderPathsForFeeds(
    options?: RepairMissingFoldersOptions,
  ): Promise<void> {
    const feeds = this.feedsCache || [];
    const missingPaths = new Set<string>();

    for (const feed of feeds) {
      if (!feed.folder || feed.folder === "Uncategorized") {
        continue;
      }
      if (!this.folderPathExists(feed.folder)) {
        missingPaths.add(feed.folder);
      }
    }

    if (missingPaths.size === 0) {
      return;
    }

    let changed = false;
    for (const path of missingPaths) {
      const created = await this.ensureFolderExists(path, {
        saveSettings: false,
        refreshView: false,
      });
      if (created) {
        changed = true;
      }
    }

    if (changed && options?.onSaveSettings) {
      await options.onSaveSettings();
      console.warn(
        `[RSS dashboard] Repaired ${missingPaths.size} missing feed folder path(s) during settings load.`,
      );
    }
  }
}
