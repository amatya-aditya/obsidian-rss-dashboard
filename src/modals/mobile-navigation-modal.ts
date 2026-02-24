import { App, Modal } from "obsidian";
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

    // Debug logging
    console.debug("[MobileNavigationModal] onOpen called");
    console.debug(
      "[MobileNavigationModal] window.innerWidth:",
      window.innerWidth,
    );

    contentEl.empty();
    this.modalEl.addClass("rss-mobile-navigation-modal");
    console.debug(
      "[MobileNavigationModal] Added rss-mobile-navigation-modal class",
    );

    // Debug: Log modal element state after classes are added
    console.debug(
      "[MobileNavigationModal] modalEl.className:",
      this.modalEl.className,
    );
    console.debug(
      "[MobileNavigationModal] modalEl classes:",
      this.modalEl.classList.toString(),
    );

    // Debug: Log computed styles after a short delay to ensure CSS is applied
    setTimeout(() => {
      const computedStyle = window.getComputedStyle(this.modalEl);
      console.debug("[MobileNavigationModal] Computed styles:");
      console.debug("  - display:", computedStyle.display);
      console.debug("  - visibility:", computedStyle.visibility);
      console.debug("  - position:", computedStyle.position);
      console.debug("  - z-index:", computedStyle.zIndex);
      console.debug("  - width:", computedStyle.width);
      console.debug("  - height:", computedStyle.height);
      console.debug("  - top:", computedStyle.top);
      console.debug("  - left:", computedStyle.left);
      console.debug("  - bottom:", computedStyle.bottom);
      console.debug("  - right:", computedStyle.right);
      console.debug("  - opacity:", computedStyle.opacity);
      console.debug("  - transform:", computedStyle.transform);
      console.debug(
        "[MobileNavigationModal] modalEl in DOM:",
        document.body.contains(this.modalEl),
      );
      console.debug(
        "[MobileNavigationModal] modalEl parent:",
        this.modalEl.parentElement?.className,
      );
    }, 100);

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
      onTagClick: (tag: string | null) => {
        this.callbacks.onTagClick(tag);
        this.close();
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
    // Modal slides from bottom on mobile, but we can set width for tablet
    if (window.innerWidth > 768) {
      this.modalEl.style.width = `${this.modalWidth}px`;
      this.modalEl.style.maxWidth = `${this.modalWidth}px`;
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.resizeHandle = null;
  }
}
