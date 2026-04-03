import {
  Plugin,
  Notice,
  WorkspaceLeaf,
  setIcon,
  Setting,
  Platform,
  requireApiVersion,
} from "obsidian";

import {
  RssDashboardSettings,
  DEFAULT_SETTINGS,
  Feed,
  FeedItem,
  FeedMetadata,
  FeedKeywordRulesSettings,
} from "./src/types/types";
import { RssDashboardSettingTab } from "./src/settings/settings-tab";
import {
  migrateDisplaySettings,
  migrateDefaultFilterToDashboardMultiFilters,
  migrateKeywordRulesSettings,
} from "./src/utils/settings-migration";
import {
  RssDashboardView,
  RSS_DASHBOARD_VIEW_TYPE,
} from "./src/views/dashboard-view";
import {
  DiscoverView,
  RSS_DISCOVER_VIEW_TYPE,
} from "./src/views/discover-view";
import {
  KagiSmallwebView,
  RSS_SMALLWEB_VIEW_TYPE,
} from "./src/views/kagi-smallweb-view";
import { ReaderView, RSS_READER_VIEW_TYPE } from "./src/views/reader-view";
import {
  FeedParser,
  applyFeedRetentionLimits,
  formatFeedParseNoticeMessage,
  getFeedErrorMessage,
} from "./src/services/feed-parser";
import { ArticleSaver } from "./src/services/article-saver";
import { OpmlManager } from "./src/services/opml-manager";
import { MediaService } from "./src/services/media-service";
import { sleep, setCssProps } from "./src/utils/platform-utils";
import { ImportOpmlModal } from "./src/modals/import-opml-modal";
import { copyTextToClipboard, exportBlob } from "./src/utils/export-utils";
import { canonicalizeItemIdentityUrl } from "./src/utils/url-utils";
import { normalizeRefreshIntervalMinutes } from "./src/utils/validation";

export interface FiltersUpdatedEventPayload {
  source: string;
  feedUrl?: string;
  timestamp: number;
}

export default class RssDashboardPlugin extends Plugin {
  settings!: RssDashboardSettings;
  feedParser!: FeedParser;
  articleSaver!: ArticleSaver;
  private importStatusBarItem: HTMLElement | null = null;
  public backgroundImportQueue: FeedMetadata[] = [];
  public settingTab: RssDashboardSettingTab | null = null;
  private isBackgroundImporting = false;
  public vaultAbsolutePath = "";
  private _beforeUnloadHandler: (() => void) | null = null;

  private getAutoRefreshIntervalMs(): number | null {
    const normalizedMinutes = normalizeRefreshIntervalMinutes(
      this.settings.refreshInterval,
    );

    if (normalizedMinutes <= 0) {
      return null;
    }

    return normalizedMinutes * 60 * 1000;
  }

  public async getActiveDashboardView(): Promise<RssDashboardView | null> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        return view;
      }
    }
    return null;
  }

  public async refreshDashboardViews(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof RssDashboardView) {
        view.refresh();
      }
    }
  }

  public notifyFiltersUpdated(payload: FiltersUpdatedEventPayload): void {
    this.app.workspace.trigger("rss-dashboard:filters-updated", payload);
  }

  public async getActiveDiscoverView(): Promise<DiscoverView | null> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DISCOVER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof DiscoverView) {
        return view;
      }
    }
    return null;
  }

  public async getActiveReaderView(): Promise<ReaderView | null> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof ReaderView) {
        return view;
      }
    }
    return null;
  }

  public async openTagsSettings(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const setting = (this.app as any).setting;
    if (setting) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      setting.open();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      setting.openTabById(this.manifest.id);
      if (this.settingTab) {
        this.settingTab.activateTab("Tags");
      }
    }
  }

  public async openSettingsToTab(tabName: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const setting = (this.app as any).setting;
    if (setting) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      setting.open();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      setting.openTabById(this.manifest.id);
      if (this.settingTab) {
        this.settingTab.activateTab(tabName);
      }
    }
  }

  async onload() {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    const adapter = this.app.vault.adapter as any;
    if (adapter.getBasePath)
      this.vaultAbsolutePath = adapter.getBasePath() as string;
    else if (adapter.getFullPath)
      this.vaultAbsolutePath = adapter.getFullPath(".") as string;
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */

    await this.loadSettings();

    const shouldRefreshOnOpen = (): boolean => {
      const intervalMs = this.getAutoRefreshIntervalMs();
      if (intervalMs === null) return false;
      if (!this.settings.lastRefreshTimestamp) return true;
      const elapsed = Date.now() - this.settings.lastRefreshTimestamp;
      return elapsed >= intervalMs;
    };

    // Register a window-level beforeunload listener for reliable backup
    // on Obsidian quit. onunload is NOT reliably called by Electron on window close.
    this._beforeUnloadHandler = () => {
      this.performAutoBackupsSyncDesktop();
    };
    window.addEventListener("beforeunload", this._beforeUnloadHandler);

    const view = await this.getActiveDashboardView();
    if (view) {
      view.render();
    }

    try {
      this.feedParser = new FeedParser(
        this.settings.media,
        this.settings.availableTags,
      );
      this.articleSaver = new ArticleSaver(
        this.app,
        this.settings.articleSaving,
      );

      if (Platform.isMobile) {
        this.applyMobileOptimizations();
      }

      const allArticles = this.getAllArticles();
      await this.articleSaver.fixSavedFilePaths(allArticles);

      await this.validateSavedArticles();

      this.registerView(
        RSS_DASHBOARD_VIEW_TYPE,
        (leaf) => new RssDashboardView(leaf, this),
      );

      this.registerView(
        RSS_DISCOVER_VIEW_TYPE,
        (leaf) => new DiscoverView(leaf, this),
      );

      this.registerView(
        RSS_READER_VIEW_TYPE,
        (leaf) =>
          new ReaderView(
            leaf,
            this.settings,
            this.articleSaver,
            (item: FeedItem) => {
              void this.onArticleSaved(item);
            },
            (
              item: FeedItem,
              updates: Partial<FeedItem>,
              shouldRerender?: boolean,
            ) => {
              void this.updateArticleFromReader(item, updates, shouldRerender);
            },
          ),
      );

      this.registerView(
        RSS_SMALLWEB_VIEW_TYPE,
        (leaf) => new KagiSmallwebView(leaf, this),
      );

      this.addRibbonIcon("compass", "RSS dashboard", () => {
        void this.activateView();
      });

      this.settingTab = new RssDashboardSettingTab(this.app, this);
      this.addSettingTab(this.settingTab);

      this.addCommand({
        id: "open-dashboard",
        name: "Open dashboard",
        callback: () => {
          void this.activateView();
        },
      });

      this.addCommand({
        id: "open-discover",
        name: "Open discover",
        callback: () => {
          void this.activateDiscoverView();
        },
      });

      this.addCommand({
        id: "refresh-feeds",
        name: "Refresh feeds",
        callback: () => {
          void this.refreshFeeds();
        },
      });

      this.addCommand({
        id: "import-opml",
        name: "Import opml",
        callback: () => {
          new ImportOpmlModal(this.app, this).open();
        },
      });

      this.addCommand({
        id: "export-opml",
        name: "Export opml",
        callback: () => {
          void this.exportOpml();
        },
      });

      this.addCommand({
        id: "import-usersettings-json",
        name: "Import usersettings.json",
        callback: () => {
          this.importUserSettingsJson();
        },
      });

      this.addCommand({
        id: "export-usersettings-json",
        name: "Export usersettings.json",
        callback: () => {
          void this.exportUserSettingsJson();
        },
      });

      this.addCommand({
        id: "apply-feed-limits",
        name: "Apply feed limits to all feeds",
        callback: () => {
          void this.applyFeedLimitsToAllFeeds();
        },
      });

      this.addCommand({
        id: "toggle-sidebar",
        name: "Toggle sidebar",
        checkCallback: (checking: boolean) => {
          const leaves = this.app.workspace.getLeavesOfType(
            RSS_DASHBOARD_VIEW_TYPE,
          );
          if (leaves.length > 0) {
            if (!checking) {
              void (async () => {
                const view = await this.getActiveDashboardView();
                if (view) {
                  this.settings.sidebarCollapsed =
                    !this.settings.sidebarCollapsed;
                  await this.saveSettings();
                  view.render();
                }
              })();
            }
            return true;
          }
          return false;
        },
      });

      const autoRefreshIntervalMs = this.getAutoRefreshIntervalMs();
      if (autoRefreshIntervalMs !== null) {
        this.registerInterval(
          window.setInterval(() => {
            void this.refreshFeeds();
          }, autoRefreshIntervalMs),
        );
      }

      if (shouldRefreshOnOpen()) {
        void this.refreshFeeds();
      }
    } catch (e) {
      console.error("[RSS Dashboard] onload initialization failed:", e);
      new Notice("Error initializing RSS dashboard plugin.");
    }
  }

  private applyMobileOptimizations(): void {
    if (this.settings.refreshInterval > 0 && this.settings.refreshInterval < 60) {
      this.settings.refreshInterval = 60;
    }

    if (this.settings.maxItems > 50) {
      this.settings.maxItems = 50;
    }

    if (!this.settings.sidebarCollapsed) {
      this.settings.sidebarCollapsed = true;
    }
  }

  async activateView() {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        switch (this.settings.viewLocation) {
          case "left-sidebar":
            leaf = workspace.getLeftLeaf(false);
            break;
          case "right-sidebar":
            leaf = workspace.getRightLeaf(false);
            break;
          default:
            leaf = workspace.getLeaf("tab");
            break;
        }
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_DASHBOARD_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening RSS dashboard view");
    }
  }

  async activateDiscoverView() {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_DISCOVER_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        switch (this.settings.viewLocation) {
          case "left-sidebar":
            leaf = workspace.getLeftLeaf(false);
            break;
          case "right-sidebar":
            leaf = workspace.getRightLeaf(false);
            break;
          default:
            leaf = workspace.getLeaf("tab");
            break;
        }
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_DISCOVER_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening RSS discover view");
    }
  }

  async activateSmallwebView() {
    const { workspace } = this.app;

    try {
      let leaf: WorkspaceLeaf | null = null;
      const leaves = workspace.getLeavesOfType(RSS_SMALLWEB_VIEW_TYPE);

      if (leaves.length > 0) {
        leaf = leaves[0];
      } else {
        switch (this.settings.viewLocation) {
          case "left-sidebar":
            leaf = workspace.getLeftLeaf(false);
            break;
          case "right-sidebar":
            leaf = workspace.getRightLeaf(false);
            break;
          default:
            leaf = workspace.getLeaf("tab");
            break;
        }
      }

      if (leaf) {
        await leaf.setViewState({
          type: RSS_SMALLWEB_VIEW_TYPE,
          active: true,
        });
        void workspace.revealLeaf(leaf);
      }
    } catch {
      new Notice("Error opening kagi smallweb");
    }
  }

  private async onArticleSaved(item: FeedItem): Promise<void> {
    if (item.feedUrl) {
      const feed = this.settings.feeds.find((f) => f.url === item.feedUrl);
      if (feed) {
        const originalItem = feed.items.find((i) => i.guid === item.guid);
        if (originalItem) {
          originalItem.saved = true;

          if (this.settings.articleSaving.addSavedTag) {
            if (!originalItem.tags) {
              originalItem.tags = [];
            }

            if (
              !originalItem.tags.some((t) => t.name.toLowerCase() === "saved")
            ) {
              const savedTag = this.settings.availableTags.find(
                (t) => t.name.toLowerCase() === "saved",
              );
              if (savedTag) {
                originalItem.tags.push({ ...savedTag });
              } else {
                originalItem.tags.push({ name: "saved", color: "#3498db" });
              }
            }
          }

          await this.saveSettings();

          await this.syncDashboardArticleUpdate(
            item.guid,
            item.feedUrl,
            {
              saved: true,
              tags: originalItem.tags ? [...originalItem.tags] : [],
            },
            false,
          );
          await this.syncReaderArticleUpdate(item.guid, {
            saved: true,
            tags: originalItem.tags ? [...originalItem.tags] : [],
          });
        }
      }
    }
  }

  private async updateArticleFromReader(
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ): Promise<void> {
    if (item.feedUrl) {
      const feed = this.settings.feeds.find((f) => f.url === item.feedUrl);
      if (!feed) return;

      const originalItem = feed.items.find((i) => i.guid === item.guid);
      if (!originalItem) return;

      await this.updateArticle(item.guid, item.feedUrl, updates, false);
      await this.syncDashboardArticleUpdate(
        item.guid,
        item.feedUrl,
        updates,
        !!shouldRerender,
      );
      await this.syncReaderArticleUpdate(item.guid, updates);
    }
  }

  private async syncReaderArticleUpdate(
    articleGuid: string,
    updates: Partial<FeedItem>,
  ): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_READER_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view;
      if (view instanceof ReaderView) {
        view.applyExternalUpdate(articleGuid, updates);
      }
    }
  }

  private async syncDashboardArticleUpdate(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRerender: boolean,
  ): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
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

  async refreshFeeds(selectedFeeds?: Feed[]) {
    try {
      const feedsToRefresh = selectedFeeds || this.settings.feeds;
      if (feedsToRefresh.length === 0) {
        return;
      }

      if (!this.feedParser) {
        console.warn("[RSS dashboard] Feed parser not initialized; skipping refresh.");
        return;
      }

      let feedNoticeText = "";
      if (feedsToRefresh.length === 1) {
        feedNoticeText = feedsToRefresh[0].title;
      } else {
        feedNoticeText = `${feedsToRefresh.length} feeds`;
      }

      new Notice(`Refreshing ${feedNoticeText}...`);
      const updatedFeeds =
        await this.feedParser.refreshAllFeeds(feedsToRefresh);

      updatedFeeds.forEach((updatedFeed) => {
        const index = this.settings.feeds.findIndex(
          (f) => f.url === updatedFeed.url,
        );
        if (index >= 0) {
          this.settings.feeds[index] = updatedFeed;
        }
      });

      await this.validateSavedArticles();
      this.settings.lastRefreshTimestamp = Date.now();
      await this.saveSettings();
      const view = await this.getActiveDashboardView();
      if (view) {
        view.refresh();
        new Notice(`Feeds refreshed: ${feedNoticeText}`);
      }
    } catch (error) {
      console.error(`[RSS dashboard] Error refreshing feeds:`, error);
      new Notice(
        `Error refreshing  ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Apply feed limits (maxItemsLimit and autoDeleteDuration) to all feeds
   * This is useful when users want to apply their current settings to existing feeds
   */
  async applyFeedLimitsToAllFeeds() {
    try {
      let updatedCount = 0;

      for (const feed of this.settings.feeds) {
        const originalCount = feed.items.length;
        const updated = applyFeedRetentionLimits(feed);
        feed.items = updated.items;

        if (feed.items.length !== originalCount) {
          updatedCount++;
        }
      }

      await this.saveSettings();
      const view = await this.getActiveDashboardView();
      if (view) {
        view.refresh();
      }

      if (updatedCount > 0) {
        new Notice(`Applied limits to ${updatedCount} feeds`);
      } else {
        new Notice("No feeds needed limit adjustments");
      }
    } catch (error) {
      new Notice(
        `Error applying feed limits: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async refreshSelectedFeed(feed: Feed) {
    await this.refreshFeeds([feed]);
  }

  async refreshFeedsInFolder(folderPath: string) {
    const feedsInFolder = this.settings.feeds.filter((feed) => {
      if (!feed.folder) return false;
      return (
        feed.folder === folderPath || feed.folder.startsWith(folderPath + "/")
      );
    });

    if (feedsInFolder.length > 0) {
      await this.refreshFeeds(feedsInFolder);
    } else {
      new Notice("No feeds found in the selected folder");
    }
  }

  async updateArticle(
    articleGuid: string,
    feedUrl: string,
    updates: Partial<FeedItem>,
    shouldRefreshView = true,
  ) {
    const feed = this.settings.feeds.find((f) => f.url === feedUrl);
    if (!feed) return;

    const article = feed.items.find((item) => item.guid === articleGuid);
    if (!article) return;

    Object.assign(article, updates);

    await this.saveSettings();

    if (shouldRefreshView) {
      const view = await this.getActiveDashboardView();
      if (view) {
        view.refresh();
      }
    }

    await this.syncReaderArticleUpdate(articleGuid, updates);
  }

  private showImportProgressModal(
    totalFeeds: number,
    onMinimize: () => void,
    onAbort: () => void,
  ): HTMLElement {
    const modal = document.body.createDiv({
      cls: "rss-dashboard-modal rss-dashboard-modal-container rss-dashboard-import-modal",
    });

    const modalContent = modal.createDiv({
      cls: "rss-dashboard-modal-content",
    });

    const modalHeader = modalContent.createDiv({
      cls: "rss-dashboard-import-modal-header",
    });

    new Setting(modalHeader).setName("Importing opml feeds").setHeading();

    const minimizeButton = modalHeader.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "Minimize" },
    });
    setIcon(minimizeButton, "minus");
    minimizeButton.onclick = onMinimize;

    const abortButton = modalHeader.createEl("button", {
      text: "Abort",
      cls: "rss-dashboard-import-abort-button",
    });
    abortButton.onclick = onAbort;

    const buttonGroup = modalHeader.createDiv({
      cls: "import-modal-header-buttons",
    });
    buttonGroup.appendChild(minimizeButton);
    buttonGroup.appendChild(abortButton);

    modalContent.createDiv({
      attr: { id: "import-progress-text" },
      cls: "rss-dashboard-center-text rss-dashboard-import-progress-text",
      text: `Preparing to import ${totalFeeds} feeds...`,
    });

    const progressBar = modalContent.createDiv({
      cls: "rss-dashboard-import-progress-bar",
    });

    const progressFill = progressBar.createDiv({
      attr: { id: "import-progress-fill" },
      cls: "rss-dashboard-import-progress-fill",
    });
    setCssProps(progressFill, { "--progress-width": "0%" });

    modalContent.createDiv({
      attr: { id: "import-current-feed" },
      cls: "rss-dashboard-center-text rss-dashboard-import-current-feed",
    });

    return modal;
  }

  importOpml(): void {
    const handleImportOpmlFile = async (file: File) => {
      const fileName = file.name.toLowerCase() || "";
      if (fileName.endsWith(".opml") || fileName.endsWith(".xml")) {
        const content = await file.text();
        try {
          const { feeds: newFeedsMetadata, folders: newFolders } =
            OpmlManager.parseOpmlMetadata(content);

          const feedsToAdd = newFeedsMetadata.filter(
            (newFeed) =>
              !this.settings.feeds.some((f) => f.url === newFeed.url),
          );

          if (feedsToAdd.length === 0) {
            new Notice("No new feeds found in the file.");
            return;
          }

          const addedFeeds: Feed[] = [];
          for (const feedMetadata of feedsToAdd) {
            const feedToAdd: Feed = {
              title: feedMetadata.title,
              url: feedMetadata.url,
              folder: feedMetadata.folder,
              items: [],
              lastUpdated: Date.now(),
              mediaType: feedMetadata.mediaType || "article",
              autoDeleteDuration:
                typeof feedMetadata.autoDeleteDuration === "number"
                  ? feedMetadata.autoDeleteDuration
                  : this.settings.defaultAutoDeleteDuration,
              maxItemsLimit:
                typeof feedMetadata.maxItemsLimit === "number"
                  ? feedMetadata.maxItemsLimit
                  : this.settings.maxItems,
              scanInterval: feedMetadata.scanInterval,
              keywordRules: {
                overrideGlobalRules: false,
                includeLogic: "AND",
                rules: [],
              },
            };

            if (
              feedToAdd.mediaType === "video" &&
              (!feedToAdd.folder || feedToAdd.folder === "Uncategorized")
            ) {
              feedToAdd.folder = this.settings.media.defaultYouTubeFolder;
            } else if (
              feedToAdd.mediaType === "podcast" &&
              (!feedToAdd.folder || feedToAdd.folder === "Uncategorized")
            ) {
              feedToAdd.folder = this.settings.media.defaultPodcastFolder;
            }

            addedFeeds.push(feedToAdd);
          }

          this.settings.feeds.push(...addedFeeds);
          this.settings.folders = OpmlManager.mergeFolders(
            this.settings.folders,
            newFolders,
          );

          for (const feed of addedFeeds) {
            if (feed.folder) {
              await this.ensureFolderExists(feed.folder, {
                saveSettings: false,
                refreshView: false,
              });
            }
          }
          await this.saveSettings();

          const view = await this.getActiveDashboardView();
          if (view) {
            view.render();
          }

          new Notice(
            `Imported ${addedFeeds.length} feeds. Articles will be fetched in the background.`,
          );

          void this.startBackgroundImport(addedFeeds);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          new Notice(message);
        }
      } else {
        new Notice("Please select a valid OPML or XML file.");
      }
    };

    /**
     * NOTE for future developers: The following block uses Electron's native dialog via 'window.require'
     * to support multiple file extension filters simultaneously (e.g., .opml, .xml) on Windows.
     * This is a known desktop-only pattern in Obsidian. We use 'any' casts and disable ESLint
     * rules here because these Electron-specific APIs are not in the standard Obsidian type
     * definitions. The surrounding try...catch is CRITICAL to ensure the plugin doesn't
     * crash on mobile where these APIs are absent.
     */
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
      const remote =
        (window as any).require?.("@electron/remote") ||
        (window as any).require?.("electron")?.remote;
      if (remote && remote.dialog) {
        const filePaths = remote.dialog.showOpenDialogSync({
          title: "Import feeds from OPML or XML",
          properties: ["openFile"],
          filters: [
            {
              name: "OPML, XML, or Backup Files",
              extensions: ["opml", "xml", "backup"],
            },
            { name: "All Files", extensions: ["*"] },
          ],
        });

        if (filePaths && filePaths.length > 0) {
          const filePath = filePaths[0];
          const fs = (window as any).require("fs");
          const content = fs.readFileSync(filePath, "utf-8");
          const fileName = filePath.split(/[/\\]/).pop() || "file";
          const file = new File([content], fileName, { type: "text/xml" });
          void handleImportOpmlFile(file);
          return;
        } else if (filePaths === undefined) {
          return; // Dialog was cancelled
        }
      }
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
    } catch {
      // Ignore errors and fallback
    }

    const input = document.body.createEl("input", {
      attr: { type: "file", accept: ".opml,.xml" },
    });
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        void handleImportOpmlFile(file);
      }
      input.remove();
    };
    input.click();
  }

  public startBackgroundImport(feeds: Feed[]): void {
    this.backgroundImportQueue.push(
      ...feeds.map((feed) => ({
        ...feed,
        importStatus: "pending" as const,
      })),
    );

    if (!this.isBackgroundImporting) {
      void this.processBackgroundImportQueue();
    }
  }

  private async processBackgroundImportQueue() {
    if (this.isBackgroundImporting || this.backgroundImportQueue.length === 0) {
      return;
    }

    this.isBackgroundImporting = true;

    if (!this.importStatusBarItem) {
      this.importStatusBarItem = this.addStatusBarItem();
      this.importStatusBarItem.textContent = "";
      const iconSpan = this.importStatusBarItem.createSpan({
        cls: "rss-dashboard-import-statusbar-icon",
      });
      setIcon(iconSpan, "rss");
      this.importStatusBarItem.createSpan({
        cls: "import-statusbar-text",
      });
    }

    const totalFeeds = this.backgroundImportQueue.length;
    let processedCount = 0;
    const saveEvery =
      totalFeeds >= 20000
        ? 200
        : totalFeeds >= 5000
          ? 100
          : totalFeeds >= 1000
            ? 25
            : 5;
    const renderEvery =
      totalFeeds >= 20000
        ? 500
        : totalFeeds >= 5000
          ? 150
          : totalFeeds >= 1000
            ? 40
            : 3;
    const interFeedDelayMs = totalFeeds >= 5000 ? 10 : 100;
    const shouldRenderDuringImport = totalFeeds < 5000;

    while (this.backgroundImportQueue.length > 0) {
      const feedMetadata = this.backgroundImportQueue[0];
      if (!feedMetadata) break;

      try {
        feedMetadata.importStatus = "processing";
        this.updateBackgroundImportProgress(
          processedCount,
          totalFeeds,
          feedMetadata.title,
        );

        const parsedFeed = await this.feedParser.parseFeed(feedMetadata.url);

        const feedIndex = this.settings.feeds.findIndex(
          (f) => f.url === feedMetadata.url,
        );
        if (feedIndex >= 0) {
          this.settings.feeds[feedIndex] = {
            ...this.settings.feeds[feedIndex],
            title: parsedFeed.title || feedMetadata.title,
            items: parsedFeed.items.slice(
              0,
              this.settings.feeds[feedIndex].maxItemsLimit ||
                this.settings.maxItems,
            ),
            lastUpdated: Date.now(),
            mediaType: parsedFeed.mediaType,
          };
        }

        feedMetadata.importStatus = "completed";
      } catch (error) {
        feedMetadata.importStatus = "failed";
        feedMetadata.importError = getFeedErrorMessage(error);
      } finally {
        this.backgroundImportQueue.shift();
        processedCount++;
      }

      if (processedCount % saveEvery === 0) {
        await this.saveSettings();
      }

      if (shouldRenderDuringImport && processedCount % renderEvery === 0) {
        const view = await this.getActiveDashboardView();
        if (view) {
          view.render();
        }
      }

      await sleep(interFeedDelayMs);
    }

    await this.saveSettings();
    const view = await this.getActiveDashboardView();
    if (view) {
      view.render();
    }

    if (this.importStatusBarItem) {
      this.importStatusBarItem.remove();
      this.importStatusBarItem = null;
    }

    this.isBackgroundImporting = false;
    new Notice(
      `Background import completed. Processed ${processedCount} feeds.`,
    );
  }

  private updateBackgroundImportProgress(
    current: number,
    total: number,
    currentFeedTitle: string,
  ): void {
    if (this.importStatusBarItem) {
      const textSpan = this.importStatusBarItem.querySelector(
        ".import-statusbar-text",
      );
      if (textSpan) {
        textSpan.textContent = `  Fetching articles: ${current}/${total} - ${currentFeedTitle}`;
      }
    }
  }

  public importUserSettingsJson(): void {
    const input = document.body.createEl("input", {
      attr: {
        type: "file",
        accept: ".json,.backup,application/json",
      },
    });

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void this.importUserSettingsJsonFromFile(file);
    };

    input.click();
  }

  public async importUserSettingsJsonFromFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<RssDashboardSettings>;
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid usersettings.json");
      }

      const parsedWithCollections = parsed as Partial<RssDashboardSettings> & {
        feeds?: unknown;
        folders?: unknown;
        availableTags?: unknown;
      };
      const hasFeedCollections =
        Array.isArray(parsedWithCollections.feeds) ||
        Array.isArray(parsedWithCollections.folders) ||
        Array.isArray(parsedWithCollections.availableTags);

      if (hasFeedCollections) {
        this.settings = Object.assign(
          {},
          DEFAULT_SETTINGS,
          this.settings,
          parsed,
        );
        this.settings.feeds = Array.isArray(parsedWithCollections.feeds)
          ? parsedWithCollections.feeds
          : [];
        this.settings.folders = Array.isArray(parsedWithCollections.folders)
          ? parsedWithCollections.folders
          : this.settings.folders;
        this.settings.availableTags = Array.isArray(
          parsedWithCollections.availableTags,
        )
          ? parsedWithCollections.availableTags
          : this.settings.availableTags;

        this.migrateLegacySettings();
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

        await this.saveSettings();
        await this.refreshDashboardViews();
        const discoverView = await this.getActiveDiscoverView();
        discoverView?.render();

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

      this.settings = Object.assign(
        {},
        DEFAULT_SETTINGS,
        this.settings,
        settingsOnly,
      );

      // Keep legacy keys and nested defaults normalized after import.
      this.migrateLegacySettings();

      await this.saveSettings();
      await this.refreshDashboardViews();
      const discoverView = await this.getActiveDiscoverView();
      discoverView?.render();

      new Notice("Imported usersettings.json");
    } catch (error) {
      new Notice(
        `Invalid usersettings.json file${error instanceof Error ? `: ${error.message}` : ""}`,
      );
    }
  }

  public getUserSettingsJson(): string {
    const {
      feeds: _feeds,
      folders: _folders,
      availableTags: _availableTags,
      ...settingsOnly
    } = this.settings as Partial<RssDashboardSettings> & {
      feeds?: unknown;
      folders?: unknown;
      availableTags?: unknown;
    };

    void _feeds;
    void _folders;
    void _availableTags;

    return JSON.stringify(settingsOnly, null, 2);
  }

  public async exportUserSettingsJson(): Promise<void> {
    const filename = "usersettings.json";
    const blob = new Blob([this.getUserSettingsJson()], {
      type: "application/json",
    });

    const result = await exportBlob({
      blob,
      filename,
      isMobile: Platform.isMobileApp,
    });
    this.showExportNotice(result, filename);
  }

  public async exportDataJson(): Promise<void> {
    const filename = "data.json";
    const blob = new Blob([JSON.stringify(this.settings, null, 2)], {
      type: "application/json",
    });

    const result = await exportBlob({
      blob,
      filename,
      isMobile: Platform.isMobileApp,
    });
    this.showExportNotice(result, filename);
  }

  exportOpml(): void {
    const opmlContent = OpmlManager.generateOpml(
      this.settings.feeds,
      this.settings.folders,
    );

    void (async () => {
      const filename = "feeds.opml";
      const blob = new Blob([opmlContent], { type: "text/xml" });
      const result = await exportBlob({
        blob,
        filename,
        isMobile: Platform.isMobileApp,
      });
      this.showExportNotice(result, filename);
    })();
  }

  private showExportNotice(
    result: "shared" | "downloaded" | "opened" | "canceled" | "failed",
    filename: string,
  ): void {
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

  public async copyDataJsonToClipboard(): Promise<void> {
    const filename = "data.json";
    const result = await copyTextToClipboard(
      JSON.stringify(this.settings, null, 2),
    );
    this.showCopyNotice(result, filename);
  }

  public async copyUserSettingsJsonToClipboard(): Promise<void> {
    const filename = "usersettings.json";
    const result = await copyTextToClipboard(this.getUserSettingsJson());
    this.showCopyNotice(result, filename);
  }

  public async copyOpmlToClipboard(): Promise<void> {
    const filename = "feeds.opml";
    const opmlContent = OpmlManager.generateOpml(
      this.settings.feeds,
      this.settings.folders,
    );
    const result = await copyTextToClipboard(opmlContent);
    this.showCopyNotice(result, filename);
  }

  private showCopyNotice(result: "copied" | "failed", filename: string): void {
    if (result === "copied") {
      new Notice(`Copied ${filename} to clipboard`);
      return;
    }
    new Notice(`Unable to copy ${filename}`);
  }

  private folderPathExists(folderPath: string): boolean {
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

  private async repairMissingFolderPathsForFeeds(): Promise<void> {
    const missingPaths = new Set<string>();

    for (const feed of this.settings.feeds) {
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

    if (changed) {
      await this.saveSettings();
      console.warn(
        `[RSS dashboard] Repaired ${missingPaths.size} missing feed folder path(s) during settings load.`,
      );
    }
  }

  /**
   * Ensures a folder path exists in the settings hierarchy
   * Handles nested paths like "News/Tech"
   */
  async ensureFolderExists(
    folderPath: string,
    options?: { saveSettings?: boolean; refreshView?: boolean },
  ): Promise<boolean> {
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

    if (changed && shouldSave) {
      await this.saveSettings();
      if (shouldRefresh) {
        const view = await this.getActiveDashboardView();
        if (view) {
          void view.refresh();
        }
      }
    }

    return changed;
  }

  async addFeed(
    title: string,
    url: string,
    folder: string,
    autoDeleteDuration?: number,
    maxItemsLimit?: number,
    scanInterval?: number,
    feedKeywordRules?: FeedKeywordRulesSettings,
    customTemplate?: string,
  ) {
    try {
      if (this.settings.feeds.some((f) => f.url === url)) {
        new Notice("This feed URL already exists");
        return false;
      }

      let mediaType: "article" | "video" | "podcast" = "article";
      if (folder === this.settings.media.defaultYouTubeFolder) {
        mediaType = "video";
      } else if (folder === this.settings.media.defaultPodcastFolder) {
        mediaType = "podcast";
      }

      const newFeed: Feed = {
        title,
        url,
        folder,
        items: [],
        lastUpdated: Date.now(),
        autoDeleteDuration:
          typeof autoDeleteDuration === "number"
            ? autoDeleteDuration
            : this.settings.defaultAutoDeleteDuration,
        maxItemsLimit:
          typeof maxItemsLimit === "number"
            ? maxItemsLimit
            : this.settings.maxItems,
        scanInterval: scanInterval || 0,
        mediaType: mediaType,
        customTemplate: customTemplate || undefined,
        keywordRules: feedKeywordRules || {
          overrideGlobalRules: false,
          includeLogic: "AND",
          rules: [],
        },
      };

      // Try to parse the feed BEFORE adding it to settings
      try {
        const parsedFeed = await this.feedParser.parseFeed(url, newFeed, {
          allowEmpty: true,
        });
        if (parsedFeed.folder) {
          await this.ensureFolderExists(parsedFeed.folder, {
            saveSettings: false,
            refreshView: false,
          });
        }
        // Only add to settings if parsing succeeded
        this.settings.feeds.push(parsedFeed);
        await this.saveSettings();

        const view = await this.getActiveDashboardView();
        if (view) {
          void view.refresh();
        }
        new Notice(`Feed "${title}" added`);
        return true;
      } catch (error) {
        new Notice(formatFeedParseNoticeMessage(error));
        return false;
      }
    } catch (error) {
      new Notice(
        `Error adding feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return false;
    }
  }

  async addYouTubeFeed(input: string, customTitle?: string) {
    try {
      const feedUrl = await MediaService.getYouTubeRssFeed(input);

      if (!feedUrl) {
        new Notice("Unable to determine YouTube feed URL from input");
        return;
      }

      if (this.settings.feeds.some((f) => f.url === feedUrl)) {
        new Notice("This YouTube feed already exists");
        return;
      }

      const title = customTitle || `YouTube: ${input}`;
      await this.addFeed(
        title,
        feedUrl,
        this.settings.media.defaultYouTubeFolder,
      );
    } catch (error) {
      new Notice(
        `Error adding YouTube feed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  async addSubfolder(parentFolderName: string, subfolderName: string) {
    const parentFolder = this.settings.folders.find(
      (f) => f.name === parentFolderName,
    );

    if (parentFolder) {
      if (!parentFolder.subfolders.some((sf) => sf.name === subfolderName)) {
        parentFolder.subfolders.push({
          name: subfolderName,
          subfolders: [],
        });

        await this.saveSettings();

        const view = await this.getActiveDashboardView();
        if (view) {
          void view.refresh();
          new Notice(
            `Subfolder "${subfolderName}" created under "${parentFolderName}"`,
          );
        }
      } else {
        new Notice(
          `Subfolder "${subfolderName}" already exists in "${parentFolderName}"`,
        );
      }
    }
  }

  async editFeed(
    feed: Feed,
    newTitle: string,
    newUrl: string,
    newFolder: string,
  ) {
    if (newFolder) {
      await this.ensureFolderExists(newFolder, {
        saveSettings: false,
        refreshView: false,
      });
    }

    const oldTitle = feed.title;
    feed.title = newTitle;
    feed.url = newUrl;
    feed.folder = newFolder;

    // Update feedTitle for all articles in this feed when the title changes
    if (oldTitle !== newTitle) {
      for (const item of feed.items) {
        item.feedTitle = newTitle;
      }
    }

    await this.saveSettings();

    const view = await this.getActiveDashboardView();
    if (view) {
      void view.refresh();
      new Notice(`Feed "${newTitle}" updated`);
    }
  }

  async loadSettings() {
    try {
      const data = (await this.loadData()) as RssDashboardSettings | null;

      this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});

      const normalizedRefreshInterval = Number(this.settings.refreshInterval);
      this.settings.refreshInterval = Number.isFinite(normalizedRefreshInterval)
        ? normalizeRefreshIntervalMinutes(normalizedRefreshInterval)
        : DEFAULT_SETTINGS.refreshInterval;

      const didMigrateKeywordRules = this.migrateLegacySettings();

      if (typeof this.settings.defaultAutoDeleteDuration !== "number") {
        this.settings.defaultAutoDeleteDuration =
          DEFAULT_SETTINGS.defaultAutoDeleteDuration;
      }

      if (!this.settings.readerViewLocation) {
        this.settings.readerViewLocation = "right-sidebar";
      }

      if (this.settings.useWebViewer === undefined) {
        this.settings.useWebViewer = true;
      }

      if (!this.settings.articleSaving) {
        this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
      } else {
        this.settings.articleSaving = Object.assign(
          {},
          DEFAULT_SETTINGS.articleSaving,
          this.settings.articleSaving,
        );
      }

      if (!this.settings.media) {
        this.settings.media = DEFAULT_SETTINGS.media;
      } else {
        this.settings.media = Object.assign(
          {},
          DEFAULT_SETTINGS.media,
          this.settings.media,
        );
      }

      // Ensure display settings are properly initialized
      if (!this.settings.display) {
        this.settings.display = DEFAULT_SETTINGS.display;
      } else {
        this.settings.display = Object.assign(
          {},
          DEFAULT_SETTINGS.display,
          this.settings.display,
        );
      }

      if (!this.settings.readerFormat) {
        this.settings.readerFormat = DEFAULT_SETTINGS.readerFormat;
      } else {
        this.settings.readerFormat = Object.assign(
          {},
          DEFAULT_SETTINGS.readerFormat,
          this.settings.readerFormat,
        );
      }

      if (!this.settings.keywordRules) {
        this.settings.keywordRules = DEFAULT_SETTINGS.keywordRules;
      } else {
        this.settings.keywordRules = Object.assign(
          {},
          DEFAULT_SETTINGS.keywordRules,
          this.settings.keywordRules,
        );
      }

      let didChange = false;

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
          didChange = true;
          console.warn(
            `[RSS Dashboard] Migration: Applied default auto-delete (${this.settings.defaultAutoDeleteDuration} days) to feed: ${feed.title}`,
          );
        }
        if (typeof feed.maxItemsLimit !== "number") {
          feed.maxItemsLimit = this.settings.maxItems;
          didChange = true;
          console.warn(
            `[RSS Dashboard] Migration: Applied default maxItems (${this.settings.maxItems}) to feed: ${feed.title}`,
          );
        }
      }

      // Normalize dashboard page-size settings to a single global value.
      // Older versions allowed per-view sizes; the UI now exposes one value.
      const canonicalPageSizeRaw = this.settings.allArticlesPageSize;
      const canonicalPageSize =
        Number.isFinite(canonicalPageSizeRaw) && canonicalPageSizeRaw >= 0
          ? canonicalPageSizeRaw
          : DEFAULT_SETTINGS.allArticlesPageSize;
      let didNormalizePageSizes = false;
      const pageSizeFields: Array<
        | "allArticlesPageSize"
        | "unreadArticlesPageSize"
        | "readArticlesPageSize"
        | "savedArticlesPageSize"
        | "starredArticlesPageSize"
      > = [
        "allArticlesPageSize",
        "unreadArticlesPageSize",
        "readArticlesPageSize",
        "savedArticlesPageSize",
        "starredArticlesPageSize",
      ];
      for (const field of pageSizeFields) {
        if (this.settings[field] !== canonicalPageSize) {
          this.settings[field] = canonicalPageSize;
          didNormalizePageSizes = true;
        }
      }

      await this.repairMissingFolderPathsForFeeds();

      const didNormalizeAndDedupeItems =
        this.normalizeAndDedupeStoredFeedItems();

      if (
        didMigrateKeywordRules ||
        didNormalizeAndDedupeItems ||
        didNormalizePageSizes ||
        didChange
      ) {
        await this.saveSettings();
      }
    } catch (error) {
      new Notice(
        `Error loading settings: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      this.settings = DEFAULT_SETTINGS;
    }
  }

  private normalizeAndDedupeStoredFeedItems(): boolean {
    let didChange = false;

    const getPubDateMs = (pubDate: string | undefined | null): number => {
      if (!pubDate) return 0;
      const ms = Date.parse(pubDate);
      return Number.isFinite(ms) ? ms : 0;
    };

    const byNewest = (a: FeedItem, b: FeedItem): number => {
      const aMs = getPubDateMs(a.pubDate);
      const bMs = getPubDateMs(b.pubDate);
      if (aMs !== bMs) return bMs - aMs;
      return (a.guid || "").localeCompare(b.guid || "");
    };

    const pickLonger = (a: string, b: string): string => {
      const aTrim = (a ?? "").trim();
      const bTrim = (b ?? "").trim();
      if (!aTrim) return bTrim ? b : a;
      if (!bTrim) return a;
      return bTrim.length > aTrim.length ? b : a;
    };

    const pickLongerOptional = (a?: string, b?: string): string | undefined => {
      const aTrim = (a ?? "").trim();
      const bTrim = (b ?? "").trim();
      if (!aTrim && !bTrim) return a ?? b;
      if (!aTrim) return b;
      if (!bTrim) return a;
      return bTrim.length > aTrim.length ? b : a;
    };

    const mergeTags = (
      a: FeedItem["tags"],
      b: FeedItem["tags"],
    ): FeedItem["tags"] => {
      const out: FeedItem["tags"] = [];
      const seen = new Set<string>();
      for (const tag of [...(a || []), ...(b || [])]) {
        const key = (tag?.name || "").trim().toLowerCase();
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
      }
      return out;
    };

    for (const feed of this.settings.feeds || []) {
      const items = Array.isArray(feed.items) ? feed.items : [];
      if (items.length === 0) continue;

      const mergedByKey = new Map<string, FeedItem>();

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const canonicalKey = canonicalizeItemIdentityUrl(
          item.guid || item.link || "",
        );
        const key = canonicalKey || item.guid || item.link || `__item_${idx}`;

        const existing = mergedByKey.get(key);
        if (!existing) {
          if (canonicalKey && canonicalKey !== item.guid) {
            didChange = true;
          }
          mergedByKey.set(key, {
            ...item,
            guid: canonicalKey || item.guid,
          });
          continue;
        }

        didChange = true;

        mergedByKey.set(key, {
          ...existing,
          guid: canonicalKey || existing.guid,
          read: existing.read || item.read,
          starred: existing.starred || item.starred,
          saved: !!existing.saved || !!item.saved,
          tags: mergeTags(existing.tags, item.tags),
          savedFilePath: existing.savedFilePath || item.savedFilePath,
          title: pickLonger(existing.title, item.title),
          link: existing.link || item.link,
          description: pickLonger(existing.description, item.description),
          content: pickLongerOptional(existing.content, item.content),
          summary: pickLongerOptional(existing.summary, item.summary),
          coverImage: existing.coverImage || item.coverImage,
          image: existing.image || item.image,
        });
      }

      const deduped = Array.from(mergedByKey.values());
      if (deduped.length !== items.length) {
        didChange = true;
      }

      deduped.sort(byNewest);
      feed.items = deduped;
    }

    return didChange;
  }

  private migrateLegacySettings(): boolean {
    const settingsUnknown = this.settings as unknown as Record<string, unknown>;
    const didMigrateKeywordRules = migrateKeywordRulesSettings(settingsUnknown);
    if (
      settingsUnknown.savePath &&
      !this.settings.articleSaving?.defaultFolder
    ) {
      if (!this.settings.articleSaving) {
        this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
      }
      this.settings.articleSaving.defaultFolder =
        settingsUnknown.savePath as string;
      delete settingsUnknown.savePath;
    }

    if (
      settingsUnknown.template &&
      !this.settings.articleSaving?.defaultTemplate
    ) {
      if (!this.settings.articleSaving) {
        this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
      }
      this.settings.articleSaving.defaultTemplate =
        settingsUnknown.template as string;
      delete settingsUnknown.template;
    }

    if (
      settingsUnknown.addSavedTag !== undefined &&
      this.settings.articleSaving?.addSavedTag === undefined
    ) {
      if (!this.settings.articleSaving) {
        this.settings.articleSaving = DEFAULT_SETTINGS.articleSaving;
      }
      this.settings.articleSaving.addSavedTag =
        settingsUnknown.addSavedTag as boolean;
      delete settingsUnknown.addSavedTag;
    }

    const articleSavingUnknown = this.settings
      .articleSaving as unknown as Record<string, unknown>;
    if (
      articleSavingUnknown.template &&
      !this.settings.articleSaving?.defaultTemplate
    ) {
      this.settings.articleSaving.defaultTemplate =
        articleSavingUnknown.template as string;
      delete articleSavingUnknown.template;
    }

    // Migrate display settings
    if (!this.settings.display) {
      this.settings.display = DEFAULT_SETTINGS.display;
    } else {
      // Ensure new display properties exist
      if (this.settings.display.filterDisplayStyle === undefined) {
        this.settings.display.filterDisplayStyle =
          DEFAULT_SETTINGS.display.filterDisplayStyle;
      }
      if (this.settings.display.defaultFilter === undefined) {
        this.settings.display.defaultFilter =
          DEFAULT_SETTINGS.display.defaultFilter;
      }
      if (this.settings.display.hiddenFilters === undefined) {
        this.settings.display.hiddenFilters =
          DEFAULT_SETTINGS.display.hiddenFilters;
      }
      if (this.settings.display.showFilterStatusBar === undefined) {
        this.settings.display.showFilterStatusBar =
          DEFAULT_SETTINGS.display.showFilterStatusBar;
      }
      if (this.settings.display.showFolderUnreadBadges === undefined) {
        this.settings.display.showFolderUnreadBadges =
          DEFAULT_SETTINGS.display.showFolderUnreadBadges;
      }
      if (this.settings.display.showAllFeedsUnreadBadges === undefined) {
        this.settings.display.showAllFeedsUnreadBadges =
          DEFAULT_SETTINGS.display.showAllFeedsUnreadBadges;
      }
      if (this.settings.display.showFeedUnreadBadges === undefined) {
        this.settings.display.showFeedUnreadBadges =
          DEFAULT_SETTINGS.display.showFeedUnreadBadges;
      }
      if (!this.settings.display.allFeedsUnreadBadgeColor) {
        this.settings.display.allFeedsUnreadBadgeColor =
          DEFAULT_SETTINGS.display.allFeedsUnreadBadgeColor;
      }
      if (!this.settings.display.folderUnreadBadgeColor) {
        this.settings.display.folderUnreadBadgeColor =
          DEFAULT_SETTINGS.display.folderUnreadBadgeColor;
      }
      if (!this.settings.display.feedUnreadBadgeColor) {
        this.settings.display.feedUnreadBadgeColor =
          DEFAULT_SETTINGS.display.feedUnreadBadgeColor;
      }
      if (!this.settings.display.allFeedsUnreadBadgeDefaultColor) {
        this.settings.display.allFeedsUnreadBadgeDefaultColor =
          DEFAULT_SETTINGS.display.allFeedsUnreadBadgeDefaultColor;
      }
      if (!this.settings.display.folderUnreadBadgeDefaultColor) {
        this.settings.display.folderUnreadBadgeDefaultColor =
          DEFAULT_SETTINGS.display.folderUnreadBadgeDefaultColor;
      }
      if (!this.settings.display.feedUnreadBadgeDefaultColor) {
        this.settings.display.feedUnreadBadgeDefaultColor =
          DEFAULT_SETTINGS.display.feedUnreadBadgeDefaultColor;
      }
      // Migrate icon visibility and order fields
      migrateDisplaySettings(
        this.settings.display as unknown as Record<string, unknown>,
      );
    }

    if (!this.settings.keywordRules) {
      this.settings.keywordRules = DEFAULT_SETTINGS.keywordRules;
    } else {
      if (!this.settings.keywordRules.includeLogic) {
        this.settings.keywordRules.includeLogic = "AND";
      }
      if (this.settings.keywordRules.bypassAll === undefined) {
        this.settings.keywordRules.bypassAll = false;
      }
      if (!this.settings.keywordRules.rules) {
        this.settings.keywordRules.rules = [];
      }
    }

    if (!this.settings.dashboardMultiFilters) {
      this.settings.dashboardMultiFilters =
        DEFAULT_SETTINGS.dashboardMultiFilters;
    } else {
      const mfUnknown = this.settings
        .dashboardMultiFilters as unknown as Record<string, unknown>;
      const statusFiltersRaw = mfUnknown.statusFilters;
      const tagFiltersRaw = mfUnknown.tagFilters;
      const logicRaw = mfUnknown.logic;

      this.settings.dashboardMultiFilters.statusFilters = Array.isArray(
        statusFiltersRaw,
      )
        ? statusFiltersRaw.filter((v): v is string => typeof v === "string")
        : [];
      this.settings.dashboardMultiFilters.tagFilters = Array.isArray(
        tagFiltersRaw,
      )
        ? tagFiltersRaw.filter((v): v is string => typeof v === "string")
        : [];
      this.settings.dashboardMultiFilters.logic =
        logicRaw === "AND" || logicRaw === "OR" ? logicRaw : "OR";
    }

    migrateDefaultFilterToDashboardMultiFilters(
      this.settings.display as unknown as Record<string, unknown>,
      this.settings.dashboardMultiFilters as unknown as Record<string, unknown>,
    );

    this.settings.feeds.forEach((feed) => {
      if (!feed.keywordRules) {
        feed.keywordRules = {
          overrideGlobalRules: false,
          includeLogic: "AND",
          rules: [],
        };
        return;
      }

      if (feed.keywordRules.overrideGlobalRules === undefined) {
        feed.keywordRules.overrideGlobalRules = false;
      }
      if (!feed.keywordRules.includeLogic) {
        feed.keywordRules.includeLogic = "AND";
      }
      if (!feed.keywordRules.rules) {
        feed.keywordRules.rules = [];
      }
    });

    if (!this.settings.autoBackup) {
      this.settings.autoBackup = Object.assign({}, DEFAULT_SETTINGS.autoBackup);
    } else {
      this.settings.autoBackup = Object.assign(
        {},
        DEFAULT_SETTINGS.autoBackup,
        this.settings.autoBackup,
      );
    }

    return didMigrateKeywordRules;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  public async performAutoBackups(): Promise<void> {
    const { autoBackup } = this.settings;
    if (!autoBackup) return;

    const pluginDir = this.manifest.dir;
    if (!pluginDir) return;

    try {
      // 1. data.json
      if (autoBackup.backupDataJson) {
        const dataPath = `${pluginDir}/data.json`;
        if (await this.app.vault.adapter.exists(dataPath)) {
          const content = await this.app.vault.adapter.read(dataPath);
          await this.app.vault.adapter.write(`${dataPath}.backup`, content);
        }
      }

      // 2. feeds.opml
      if (autoBackup.backupOpml) {
        const opmlContent = OpmlManager.generateOpml(
          this.settings.feeds,
          this.settings.folders,
        );
        const opmlPath = `${pluginDir}/feeds.opml.backup`;
        await this.app.vault.adapter.write(opmlPath, opmlContent);
      }

      // 3. userdata.json / usersettings.json
      if (autoBackup.backupUserdata) {
        // We look for both common names, prioritizing 'usersettings.json' since that's what's exported.
        const userSettingsPath = `${pluginDir}/usersettings.json`;
        const userDataPath = `${pluginDir}/userdata.json`;

        if (await this.app.vault.adapter.exists(userSettingsPath)) {
          const content = await this.app.vault.adapter.read(userSettingsPath);
          await this.app.vault.adapter.write(
            `${userSettingsPath}.backup`,
            content,
          );
        } else if (await this.app.vault.adapter.exists(userDataPath)) {
          const content = await this.app.vault.adapter.read(userDataPath);
          await this.app.vault.adapter.write(`${userDataPath}.backup`, content);
        }
      }
    } catch (e) {
      console.error("[RSS Dashboard] Auto-backup failed:", e);
    }
  }

  public performAutoBackupsSyncDesktop(): boolean {
    const { autoBackup } = this.settings;
    if (!autoBackup) return false;

    const pluginDir = this.manifest.dir;
    if (!pluginDir) return false;

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      const req = (window as any).require;
      if (!req) return false;

      const fs = req("fs");
      const path = req("path");

      if (fs && path) {
        const vaultRoot = this.vaultAbsolutePath;

        if (!vaultRoot) {
          return false;
        }

        const absPluginDir = path.resolve(vaultRoot, pluginDir);

        if (autoBackup.backupDataJson) {
          const dataPath = path.join(absPluginDir, "data.json");
          if (fs.existsSync(dataPath)) {
            fs.copyFileSync(dataPath, `${dataPath}.backup`);
          }
        }

        if (autoBackup.backupOpml) {
          const opmlContent = OpmlManager.generateOpml(
            this.settings.feeds,
            this.settings.folders,
          );
          const opmlPath = path.join(absPluginDir, "feeds.opml.backup");
          fs.writeFileSync(opmlPath, opmlContent, "utf-8");
        }

        if (autoBackup.backupUserdata) {
          const userSettingsPath = path.join(absPluginDir, "usersettings.json");
          const userDataPath = path.join(absPluginDir, "userdata.json");
          const backupPath = path.join(absPluginDir, "userdata.json.backup");

          if (fs.existsSync(userSettingsPath)) {
            fs.copyFileSync(userSettingsPath, backupPath);
          } else if (fs.existsSync(userDataPath)) {
            fs.copyFileSync(userDataPath, backupPath);
          } else {
            fs.writeFileSync(backupPath, this.getUserSettingsJson(), "utf-8");
          }
        }

        return true;
      }

      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    } catch (e) {
      console.error("[RSS Dashboard] Sync Auto-backup failed:", e);
    }
    return false;
  }

  onunload() {
    // Remove the beforeunload listener to avoid it firing when the plugin
    // is manually disabled (onunload handles it instead).
    if (this._beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this._beforeUnloadHandler);
      this._beforeUnloadHandler = null;
    }
    // Run backups synchronously on plugin disable
    const synced = this.performAutoBackupsSyncDesktop();
    if (!synced) {
      void this.performAutoBackups();
    }
  }

  private async validateSavedArticles(): Promise<void> {
    let updatedCount = 0;

    for (const feed of this.settings.feeds) {
      for (const item of feed.items) {
        if (item.saved) {
          const fileExists = this.checkSavedFileExists(item);
          if (!fileExists) {
            item.saved = false;

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
      await this.saveSettings();

      const view = await this.getActiveDashboardView();
      if (view) {
        view.render();
      }
    }
  }

  private checkSavedFileExists(item: FeedItem): boolean {
    try {
      const folder =
        this.settings.articleSaving.defaultFolder || "RSS articles";
      const filename = this.sanitizeFilename(item.title);
      const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;

      return this.app.vault.getAbstractFileByPath(filePath) !== null;
    } catch {
      return false;
    }
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[/\\:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .substring(0, 100);
  }

  private getAllArticles(): FeedItem[] {
    let allArticles: FeedItem[] = [];
    for (const feed of this.settings.feeds) {
      allArticles = allArticles.concat(feed.items);
    }
    return allArticles;
  }
}
