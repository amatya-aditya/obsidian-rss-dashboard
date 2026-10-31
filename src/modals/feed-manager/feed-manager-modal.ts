import { App, Setting } from "obsidian";
import { AccessibleModal } from "../../utils/accessible-modal";
import type RssDashboardPlugin from "../../../main";
import { ImportOpmlModal } from "../import-opml-modal";
import { ImportStarredModal } from "../import-starred-modal";
import { shouldUseMobileSidebarLayout } from "../../utils/platform-utils";
import { AddFeedModal, type AddFeedRequest } from "./add-feed-modal";
import {
  countFoldersRecursively,
  renderDestructiveFeedActions,
  renderPrimaryFeedActions,
} from "./feed-manager-actions";

export class FeedManagerModal extends AccessibleModal {
  plugin: RssDashboardPlugin;

  constructor(app: App, plugin: RssDashboardPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl } = this;
    const isMobile = shouldUseMobileSidebarLayout();

    this.modalEl.className +=
      " rss-dashboard-modal rss-dashboard-modal-container rss-feed-manager-modal";
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-feed-manager-modal");
    }

    contentEl.empty();
    new Setting(contentEl).setName("Manage feeds").setHeading();

    renderPrimaryFeedActions(contentEl, {
      addFeed: () => {
        new AddFeedModal(
          this.app,
          this.plugin.settings.folders,
          async (request: AddFeedRequest) =>
            this.plugin.addFeed(
              request.title,
              request.url,
              request.folder,
              request.autoDeleteDuration,
              request.maxItemsLimit,
              request.scanInterval,
              request.feedKeywordRules,
              request.customTemplate,
              request.excludeFromRefresh,
              request.customTags,
              { feedEncoding: request.feedEncoding },
            ),
          () => this.onOpen(),
          "",
          this.plugin,
        ).open();
      },
      importOpml: () => {
        new ImportOpmlModal(this.app, this.plugin, () => this.close()).open();
      },
      exportOpml: () => this.plugin.exportOpml(),
      importStarred: () => {
        new ImportStarredModal(this.app, this.plugin, () =>
          this.close(),
        ).open();
      },
    });

    renderDestructiveFeedActions(contentEl, this.app, {
      getFeedCount: () => this.plugin.settings.feeds.length,
      getFolderCount: () =>
        countFoldersRecursively(this.plugin.settings.folders),
      getImageCacheSizeBytes: () => this.plugin.getImageCacheSizeBytes(),
      deleteFeeds: async () => {
        this.plugin.settings.feeds = [];
        await this.plugin.saveSettings();
        const result = await this.plugin.clearImageCache();
        const dashboardView = await this.plugin.getActiveDashboardView();
        if (dashboardView) dashboardView.refresh();
        this.close();
        return { failed: result.failed };
      },
      deleteFeedsAndFolders: async () => {
        this.plugin.settings.feeds = [];
        this.plugin.settings.folders = [];
        await this.plugin.saveSettings();
        const result = await this.plugin.clearImageCache();
        const dashboardView = await this.plugin.getActiveDashboardView();
        if (dashboardView) dashboardView.refresh();
        this.close();
        return { failed: result.failed };
      },
    });
  }

  onClose() {
    this.contentEl?.empty();
  }
}
