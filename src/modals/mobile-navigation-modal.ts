import { App, Platform } from "obsidian";
import { AccessibleModal } from "../utils/accessible-modal";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../components/sidebar";
import type RssDashboardPlugin from "../../main";
import { RssDashboardSettings } from "../types/types";

export class MobileNavigationModal extends AccessibleModal {
  private sidebar!: Sidebar;
  private sidebarWrapper!: HTMLElement;

  constructor(
    app: App,
    private plugin: RssDashboardPlugin,
    private settings: RssDashboardSettings,
    private options: SidebarOptions,
    private callbacks: SidebarCallbacks,
  ) {
    super(app);
  }

  // The sheet shows the sidebar and no heading of its own.
  protected getDialogLabel(): string {
    return "Dashboard navigation";
  }

  onOpen() {
    const { contentEl } = this;

    contentEl.empty();
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

    this.applyModalWidth();

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
  }

  /**
   * Re-renders the drawer after a refresh-status change, so an open drawer
   * shows live progress, per-feed refresh state, and the Stop affordance the
   * same way the inline desktop sidebar does. The dashboard's current
   * selection is copied in, without replacing the object the drawer's own
   * callbacks mutate.
   */
  public refreshSidebar(options?: SidebarOptions): void {
    if (!this.sidebar) return;
    if (options) Object.assign(this.options, options);
    this.sidebar["settings"] = this.plugin.settings;
    // Match the inline sidebar: cached folder paths must be dropped so feeds
    // and folders added while the drawer is open (for example by an import)
    // appear on the next render instead of on reopen.
    this.sidebar.clearFolderPathCache();
    this.sidebar.render();
  }

  /**
   * Applies refresh-status changes to the open drawer's rows in place, so a
   * refresh run never interrupts a scroll through the drawer.
   */
  public refreshSidebarStatus(): void {
    if (!this.sidebar) return;
    this.sidebar["settings"] = this.plugin.settings;
    this.sidebar.refreshStatusInPlace();
  }

  /** Updates only the global-refresh progress text, without rebuilding rows. */
  public refreshGlobalRefreshProgressOnly(): void {
    this.sidebar?.refreshGlobalRefreshProgressOnly();
  }

  private applyModalWidth(): void {
    const width = Math.max(240, Math.floor(activeWindow.innerWidth * 0.8));
    this.modalEl.style.width = `${width}px`;
    this.modalEl.style.maxWidth = `${width}px`;
  }

  onClose() {
    this.sidebar?.destroy();
    const { contentEl } = this;
    contentEl.empty();
  }
}
