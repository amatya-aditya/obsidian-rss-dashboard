/** The plugin surface the Edit feed modal and its sections read and write. */
import type { App } from "obsidian";
import type { Feed, RssDashboardSettings } from "../../types/types";
import type { FeedLocalStorageAddress } from "../../services/feed-storage-repository";

export interface EditFeedPlugin {
  app: App;
  settings: RssDashboardSettings;
  getFeedLocalStorageAddress?(feed: Feed): FeedLocalStorageAddress;
  ensureFolderExists(folderPath: string): Promise<boolean>;
  saveSettings(): Promise<void>;
  notifyFiltersUpdated(payload: {
    source: string;
    feedUrl?: string;
    timestamp: number;
  }): void;
  refreshSelectedFeed?(feed: Feed): Promise<void>;
}
