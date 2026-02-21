import { App, Modal } from "obsidian";
import { Sidebar, SidebarOptions, SidebarCallbacks } from "../components/sidebar";
import type RssDashboardPlugin from "../../main";
import { RssDashboardSettings } from "../types/types";

export class MobileNavigationModal extends Modal {
    private sidebar: Sidebar;

    constructor(
        app: App,
        private plugin: RssDashboardPlugin,
        private settings: RssDashboardSettings,
        private options: SidebarOptions,
        private callbacks: SidebarCallbacks
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("rss-mobile-navigation-modal");

        const sidebarWrapper = contentEl.createDiv({
            cls: "rss-dashboard-sidebar-container"
        });

        const wrappedCallbacks: SidebarCallbacks = {
            ...this.callbacks,
            onFolderClick: (folder) => {
                this.callbacks.onFolderClick(folder);
                this.close();
            },
            onFeedClick: (feed) => {
                this.callbacks.onFeedClick(feed);
                this.close();
            },
            onTagClick: (tag) => {
                this.callbacks.onTagClick(tag);
                this.close();
            },
            onActivateDiscoverView: async () => {
                this.close();
                await this.plugin.activateDiscoverView();
                setTimeout(async () => {
                    const discoverView = await this.plugin.getActiveDiscoverView();
                    if (discoverView) {
                        discoverView.openMobileSidebar();
                    }
                }, 50);
            }
        };

        this.sidebar = new Sidebar(
            this.app,
            sidebarWrapper,
            this.plugin,
            this.settings,
            this.options,
            wrappedCallbacks
        );

        this.sidebar.render();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
