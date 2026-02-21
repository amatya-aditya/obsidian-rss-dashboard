import { App, Modal } from "obsidian";
import { DiscoverSidebar } from "../components/discover-sidebar";
import type RssDashboardPlugin from "../../main";
import { DiscoverFilters, FeedMetadata } from "../types/discover-types";

export class MobileDiscoverFiltersModal extends Modal {
    private sidebar: DiscoverSidebar;

    constructor(
        app: App,
        private plugin: RssDashboardPlugin,
        private filters: DiscoverFilters,
        private feeds: FeedMetadata[],
        private activeSidebarSection: "types" | "categories" | "tags",
        private onFilterChange: () => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("rss-mobile-discover-filters-modal");

        const sidebarWrapper = contentEl.createDiv({
            cls: "rss-dashboard-sidebar-container"
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
                onActivateView: async () => {
                    this.close();
                    await this.plugin.activateView();
                    setTimeout(async () => {
                        const dashboardView = await this.plugin.getActiveDashboardView();
                        if (dashboardView) {
                            dashboardView.openMobileSidebar();
                        }
                    }, 50);
                },
                onActivateDiscoverView: () => {
                    // Already here
                }
            }
        );

        this.sidebar.render();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
