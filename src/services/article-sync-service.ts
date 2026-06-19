/**
 * ArticleSyncService
 *
 * Manages cross-view article state synchronisation: propagating saves,
 * tag updates, and read/starred changes from one open view into every
 * other open view without requiring the caller to hold references to
 * individual view instances.
 *
 * All methods previously lived as private/anonymous functions inside
 * RssDashboardPlugin (main.ts). They have been extracted here to
 * satisfy Phase 5 of the main-refactoring-roadmap.
 *
 * Backward compatibility: main.ts retains 1-line delegating facades for
 * onArticleSaved(), updateArticleFromReader(), syncReaderArticleUpdate(),
 * syncDashboardArticleUpdate(), and updateArticle() so that the 71+
 * call-sites that go through `this.plugin.*` continue to work unchanged.
 */

import { requireApiVersion } from "obsidian";
import type { FeedItem, RssDashboardSettings } from "../types/types";
import {
  RssDashboardView,
  RSS_DASHBOARD_VIEW_TYPE,
} from "../views/dashboard-view";
import { ReaderView, RSS_READER_VIEW_TYPE } from "../views/reader-view";
import { applyAutomaticArticleTags } from "../utils/tag-utils";

// ---------------------------------------------------------------------------
// Dependency interfaces – kept minimal to stay easy to mock in tests
// ---------------------------------------------------------------------------

export interface IAppForArticleSync {
  workspace: {
    getLeavesOfType(type: string): Array<{
      loadIfDeferred?(): Promise<void>;
      view: unknown;
    }>;
  };
}

export interface IPluginForArticleSync {
  settings: RssDashboardSettings;
  saveSettings(): Promise<void>;
  getActiveDashboardView(): Promise<RssDashboardView | null>;
}

// ---------------------------------------------------------------------------

export class ArticleSyncService {
  constructor(
    private readonly app: IAppForArticleSync,
    private readonly plugin: IPluginForArticleSync,
  ) {}

  // -------------------------------------------------------------------------
  // Public API (delegated from main.ts facades)
  // -------------------------------------------------------------------------

  /**
   * Called after an article is saved to disk. Updates the in-memory
   * feed item (saved flag + savedFilePath), applies the "saved" tag,
   * persists settings, and pushes the diff to open dashboard/reader leaves.
   */
  public async onArticleSaved(item: FeedItem): Promise<void> {
    if (!item.feedUrl) return;

    const feed = this.plugin.settings.feeds.find(
      (f) => f.url === item.feedUrl,
    );
    if (!feed) return;

    const originalItem = feed.items.find((i) => i.guid === item.guid);
    if (!originalItem) return;

    originalItem.saved = true;
    originalItem.savedFilePath = item.savedFilePath;

    if (this.plugin.settings.articleSaving.addSavedTag) {
      if (!originalItem.tags) {
        originalItem.tags = [];
      }

      if (!originalItem.tags.some((t) => t.name.toLowerCase() === "saved")) {
        const savedTag = this.plugin.settings.availableTags.find(
          (t) => t.name.toLowerCase() === "saved",
        );
        if (savedTag) {
          originalItem.tags.push({ ...savedTag });
        } else {
          originalItem.tags.push({ name: "saved", color: "#3498db" });
        }
      }
    }

    await this.plugin.saveSettings();

    await this.syncDashboardArticleUpdate(
      item.guid,
      item.feedUrl,
      {
        saved: true,
        savedFilePath: originalItem.savedFilePath,
        tags: originalItem.tags ? [...originalItem.tags] : [],
      },
      false,
    );
    await this.syncReaderArticleUpdate(item.guid, {
      saved: true,
      savedFilePath: originalItem.savedFilePath,
      tags: originalItem.tags ? [...originalItem.tags] : [],
    });
  }

  /**
   * Called when the Reader view makes a change to an article (e.g. marks it
   * read, starred, saves it). Applies automatic tag rules, mirrors the diff
   * into every open dashboard leaf and the reader leaf, then persists.
   */
  public async updateArticleFromReader(
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ): Promise<void> {
    const resolvedFeed =
      this.plugin.settings.feeds.find((f) => f.url === item.feedUrl) ||
      this.plugin.settings.feeds.find((f) =>
        f.items.some((candidate) => candidate.guid === item.guid),
      );
    if (!resolvedFeed) return;

    const resolvedFeedUrl = resolvedFeed.url;
    item.feedUrl = resolvedFeedUrl;

    const normalizedUpdates = applyAutomaticArticleTags(
      item,
      updates,
      this.plugin.settings,
    );
    const originalItem = resolvedFeed.items.find((i) => i.guid === item.guid);
    if (!originalItem) return;

    Object.assign(originalItem, normalizedUpdates);
    await this.syncDashboardArticleUpdate(
      item.guid,
      resolvedFeedUrl,
      normalizedUpdates,
      !!shouldRerender,
    );
    await this.syncReaderArticleUpdate(item.guid, normalizedUpdates);
    await this.updateArticle(item.guid, resolvedFeedUrl, normalizedUpdates, false);
  }

  /**
   * Pushes a partial article update to every open Reader leaf.
   */
  public async syncReaderArticleUpdate(
    articleGuid: string,
    updates: Partial<FeedItem>,
  ): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred?.();
      }
      const view = leaf.view;
      if (view instanceof ReaderView) {
        view.applyExternalUpdate(articleGuid, updates);
      }
    }
  }

  /**
   * Pushes a partial article update to every open Dashboard leaf.
   */
  public async syncDashboardArticleUpdate(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRerender: boolean,
  ): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred?.();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        view.applyExternalArticleUpdate(
          articleGuid,
          feedUrl,
          updates,
          shouldRerender,
        );
      }
    }
  }

  /**
   * Persists a partial article update to in-memory settings and optionally
   * triggers a view refresh.  Also mirrors the change into open reader leaves.
   */
  public async updateArticle(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRefreshView = true,
  ): Promise<void> {
    const feed = this.plugin.settings.feeds.find((f) => f.url === feedUrl);
    if (!feed) return;

    const article = feed.items.find((item) => item.guid === articleGuid);
    if (!article) return;

    Object.assign(article, updates);

    await this.plugin.saveSettings();

    if (shouldRefreshView) {
      const view = await this.plugin.getActiveDashboardView();
      if (view) {
        view.refresh();
      }
    }

    await this.syncReaderArticleUpdate(articleGuid, updates);
  }
}
