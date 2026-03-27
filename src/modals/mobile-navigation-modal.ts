import { App, Modal, Platform } from "obsidian";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../components/sidebar";
import type RssDashboardPlugin from "../../main";
import { RssDashboardSettings } from "../types/types";

export class MobileNavigationModal extends Modal {
  private sidebar!: Sidebar;
  private isResizing: boolean = false;
  private resizeHandle: HTMLElement | null = null;
  private modalWidth: number;

  constructor(
    app: App,
    private plugin: RssDashboardPlugin,
    private settings: RssDashboardSettings,
    private options: SidebarOptions,
    private callbacks: SidebarCallbacks,
  ) {
    super(app);
    // Use saved width or default
    this.modalWidth = settings.sidebarWidth || 280;
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
    this.modalEl.addClass("rss-mobile-navigation-modal");
    this.modalEl.classList.remove(
      "rss-mobile-platform-ios",
      "rss-mobile-platform-android",
    );
    this.modalEl.classList.add(
      Platform.isAndroidApp
        ? "rss-mobile-platform-android"
        : "rss-mobile-platform-ios",
    );

    // Remove the default Obsidian close button
    const closeBtn = this.modalEl.querySelector(".modal-close-button");
    if (closeBtn) {
      closeBtn.remove();
    }

    const sidebarWrapper = contentEl.createDiv({
      cls: "rss-dashboard-sidebar-container",
    });

    // Create resize handle for modal (positioned on left side)
    this.resizeHandle = sidebarWrapper.createDiv({
      cls: "rss-dashboard-sidebar-resize-handle",
    });

    // Apply initial width
    this.applyModalWidth();

    // Setup resize handlers
    this.setupModalResize();

    const wrappedCallbacks: SidebarCallbacks = {
      ...this.callbacks,
      onFolderClick: (folder: string | null) => {
        this.callbacks.onFolderClick(folder);
        this.close();
      },
      onFeedClick: (feed) => {
        this.callbacks.onFeedClick(feed);
        this.close();
      },
      onTagToggle: (tag: string) => {
        this.callbacks.onTagToggle(tag);
        // We don't close the modal on toggle so users can select multiple tags
      },
      onClearTags: () => {
        this.callbacks.onClearTags();
      },
      onTagFilterModeChange: (mode) => {
        this.callbacks.onTagFilterModeChange(mode);
      },
      onActivateDashboard: () => {
        if (this.callbacks.onActivateDashboard) {
          this.callbacks.onActivateDashboard();
        }
        this.close();
      },
      onActivateDiscover: () => {
        if (this.callbacks.onActivateDiscover) {
          this.callbacks.onActivateDiscover();
        }
        this.close();
      },
      onCloseMobileSidebar: () => {
        this.close();
      },
    };

    this.sidebar = new Sidebar(
      this.app,
      sidebarWrapper,
      this.plugin,
      this.settings,
      this.options,
      wrappedCallbacks,
    );

    this.sidebar.render();
  }

  private setupModalResize(): void {
    if (!this.resizeHandle) return;

    this.resizeHandle.addEventListener("mousedown", (e) => {
      this.handleResizeStart(e);
    });

    document.addEventListener("mousemove", (e) => {
      this.handleResizeMove(e);
    });

    document.addEventListener("mouseup", () => {
      this.handleResizeEnd();
    });
  }

  private handleResizeStart(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.isResizing = true;
    this.resizeHandle?.addClass("dragging");
  }

  private handleResizeMove(e: MouseEvent): void {
    if (!this.isResizing) return;

    // For modal, calculate width from right edge
    const windowWidth = window.innerWidth;
    let newWidth = windowWidth - e.clientX;

    // Apply constraints
    const minWidth = 200;
    const maxWidth = Math.min(500, windowWidth * 0.8);
    newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

    this.modalWidth = newWidth;
    this.settings.sidebarWidth = newWidth;
    this.applyModalWidth();
  }

  private handleResizeEnd(): void {
    if (!this.isResizing) return;

    this.isResizing = false;
    this.resizeHandle?.removeClass("dragging");

    // Save width to settings
    void this.plugin.saveSettings();
  }

  private applyModalWidth(): void {
    const maxAllowedWidth = Math.floor(window.innerWidth * 0.8);
    const width = Math.max(240, Math.min(this.modalWidth, maxAllowedWidth));
    this.modalEl.style.width = `${width}px`;
    this.modalEl.style.maxWidth = `${width}px`;
  }

  onClose() {
    this.sidebar?.destroy();
    const { contentEl } = this;
    contentEl.empty();
    this.resizeHandle = null;
  }
}
