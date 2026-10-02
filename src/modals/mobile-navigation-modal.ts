import { App, Modal, Platform, setIcon, setTooltip } from "obsidian";
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
  private sidebarWrapper!: HTMLElement;
  private refreshIntervalId: number | null = null;
  // Aborted on close: document listeners would otherwise keep every closed
  // modal, and its sidebar rows, reachable from the document (#664).
  private documentListenerAbort = new AbortController();

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
    this.modalWidth = Math.floor(activeWindow.innerWidth * 0.8);
    this.modalEl.addClass("rss-mobile-navigation-modal");
    this.modalEl.classList.remove(
      "rss-mobile-platform-ios",
      "rss-mobile-platform-android",
    );
    // Keep the Android marker as a platform hook; it has no built-in CSS rules.
    this.modalEl.classList.add(
      Platform.isAndroidApp
        ? "rss-mobile-platform-android"
        : "rss-mobile-platform-ios",
    );

    this.sidebarWrapper = contentEl.createDiv({
      cls: "rss-dashboard-sidebar-container",
    });

    // Create resize handle for modal (positioned on left side)
    this.resizeHandle = this.sidebarWrapper.createDiv({
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
      onFeedClick: (feed, e) => {
        this.callbacks.onFeedClick(feed, e);
        // Ctrl/Cmd+click toggles multi-selection, so keep the drawer open and
        // redraw it (as a folder Ctrl/Cmd+click does) instead of closing.
        if (e && (Platform.isMacOS ? e.metaKey : e.ctrlKey)) {
          this.sidebar?.render();
          return;
        }
        this.close();
      },
      onTagToggle: (tag: string) => {
        // Mirror the toggle into the local options BEFORE calling the dashboard
        // callback, so the sidebar's own render() (called by the click handler
        // immediately after this callback returns) reads the updated state.
        const idx = this.options.selectedTags.indexOf(tag);
        if (idx !== -1) {
          this.options.selectedTags.splice(idx, 1);
        } else {
          this.options.selectedTags.push(tag);
        }
        this.callbacks.onTagToggle(tag);
      },
      onFolderMultiSelect: (folders: string[]) => {
        // Mirror multi-select into local options so the modal's sidebar
        // shows the updated selection immediately.
        this.options.selectedFolders = folders;
        this.callbacks.onFolderMultiSelect?.(folders);
        this.sidebar?.render();
      },
      onRangeSelect: (clickedKey: string, visibleKeys: string[]) => {
        // Proxy range select to parent and close modal
        this.callbacks.onRangeSelect?.(clickedKey, visibleKeys);
        this.close();
      },
      // The dashboard re-renders its own sidebar after a delete, not this
      // modal's, so re-render here or the deleted row stays until reopen.
      onDeleteFeed: (feed) => {
        this.callbacks.onDeleteFeed(feed);
        this.sidebar?.render();
      },
      onDeleteFolder: (folder: string) => {
        this.callbacks.onDeleteFolder(folder);
        this.sidebar?.render();
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
    };

    this.sidebar = new Sidebar(
      this.app,
      this.sidebarWrapper,
      this.plugin,
      this.settings,
      this.options,
      wrappedCallbacks,
    );

    this.sidebar.render();

    // Update all-feeds-icon refresh state immediately after render
    this.updateAllFeedsIconRefreshState();

    // Register to update refresh state when feeds are being refreshed
    this.refreshIntervalId = window.setInterval(() => {
      this.updateAllFeedsIconRefreshState();
    }, 100);
  }

  private updateAllFeedsIconRefreshState(): void {
    const isCancellable = this.plugin.isGlobalRefreshCancellable ?? false;
    const isRefreshActive =
      !isCancellable &&
      (this.plugin.isMultiFeedRefreshActive ||
        (this.plugin.activeRefreshState?.size ?? 0) > 0);

    const allFeedsIcon = this.sidebarWrapper.querySelector(
      ".rss-dashboard-all-feeds-icon",
    );
    if (allFeedsIcon instanceof HTMLElement) {
      allFeedsIcon.classList.toggle("stop", isCancellable);
      allFeedsIcon.classList.toggle("refreshing", isRefreshActive);
      setTooltip(
        allFeedsIcon,
        isCancellable ? "Stop refresh" : "Refresh all feeds",
      );
      setIcon(allFeedsIcon, isCancellable ? "square-stop" : "refresh-cw");
    }
  }

  private setupModalResize(): void {
    if (!this.resizeHandle) return;

    this.resizeHandle.addEventListener("mousedown", (e) => {
      this.handleResizeStart(e);
    });

    const { signal } = this.documentListenerAbort;

    activeDocument.addEventListener(
      "mousemove",
      (e) => {
        this.handleResizeMove(e);
      },
      { signal },
    );

    activeDocument.addEventListener(
      "mouseup",
      () => {
        this.handleResizeEnd();
      },
      { signal },
    );
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
    const windowWidth = activeWindow.innerWidth;
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
    const maxAllowedWidth = Math.floor(activeWindow.innerWidth * 0.8);
    const width = Math.max(240, Math.min(this.modalWidth, maxAllowedWidth));
    this.modalEl.style.width = `${width}px`;
    this.modalEl.style.maxWidth = `${width}px`;
  }

  onClose() {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }

    this.documentListenerAbort.abort();
    this.documentListenerAbort = new AbortController();
    this.isResizing = false;

    this.sidebar?.destroy();
    const { contentEl } = this;
    contentEl.empty();
    this.resizeHandle = null;
  }
}
