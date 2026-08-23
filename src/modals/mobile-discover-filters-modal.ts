import { App, Modal, Platform } from "obsidian";
import { DiscoverSidebar } from "../components/discover-sidebar";
import type RssDashboardPlugin from "../../main";
import { DiscoverFilters, FeedMetadata } from "../types/discover-types";

export class MobileDiscoverFiltersModal extends Modal {
  private sidebar!: DiscoverSidebar;

  constructor(
    app: App,
    private plugin: RssDashboardPlugin,
    private filters: DiscoverFilters,
    private feeds: FeedMetadata[],
    private activeSidebarSection: "types" | "categories" | "tags",
    private onFilterChange: () => void,
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rss-mobile-discover-filters-modal");
    this.modalEl.classList.remove(
      "rss-mobile-platform-ios",
      "rss-mobile-platform-android",
    );
    this.modalEl.classList.add(
      Platform.isAndroidApp
        ? "rss-mobile-platform-android"
        : "rss-mobile-platform-ios",
    );

    const sidebarWrapper = contentEl.createDiv({
      cls: "rss-dashboard-sidebar-container",
    });

    this.sidebar = new DiscoverSidebar(
      this.app,
      sidebarWrapper,
      this.plugin,
      this.filters,
      this.feeds,
      this.activeSidebarSection,
      {
        onFilterChange: () => {
          this.onFilterChange();
        },
        onActivateView: () => {
          this.close();
          void this.plugin.activateView().then(() => {
            window.setTimeout(() => {
              void this.plugin
                .getActiveDashboardView()
                .then((dashboardView) => {
                  if (dashboardView) {
                    dashboardView.openMobileSidebar();
                  }
                });
            }, 50);
          });
        },
        onActivateDiscoverView: () => {
          // Already here
        },
        onActivateSmallwebView: () => {
          this.close();
          void this.plugin.activateSmallwebView();
        },
      },
    );

    this.sidebar.render();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
