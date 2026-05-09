import { setIcon } from "obsidian";
import { RssDashboardSettings } from "../types/types";

export interface FilterChangeEvent {
  type: string;
  value: unknown;
  checked?: boolean;
  isTag?: boolean;
  logic?: "AND" | "OR";
  batch?: {
    statusFilters?: Set<string>;
    tagFilters?: Set<string>;
    logic?: "AND" | "OR";
    bypassAll?: boolean;
    highlightsEnabled?: boolean;
    statusBarVisible?: boolean;
    cardColumnsPerRow?: number;
    cardSpacing?: number;
  };
}

export interface ArticleFilterCallbacks {
  onFilterChange: (event: FilterChangeEvent) => void;
}

/**
 * ArticleFilterMenu Component
 * 
 * Extracted from ArticleList.ts to manage complex multi-filtering (Status + Tags).
 * Renders a custom portal-based menu to ensure correct theme inheritance.
 * This component is decoupled from ArticleList via the ArticleFilterCallbacks interface.
 */
export class ArticleFilterMenu {
  private settings: RssDashboardSettings;
  private statusFilters: Set<string>;
  private tagFilters: Set<string>;
  private filterLogic: "AND" | "OR";
  private callbacks: ArticleFilterCallbacks;

  /**
   * Renders the filter menu UI into a portal (document.body).
   * Uses a custom menu structure to avoid native Obsidian menu limitations
   * while maintaining the look and feel of the app.
   */
  private renderMenu(portal: HTMLElement): void {
  }

  private activePortal: HTMLElement | null = null;
  private activeFilterOutsideListenerCleanup: (() => void) | null = null;
  private activeFilterToggleBtn: HTMLElement | null = null;
  private documentListeners: Array<{
    target: Document;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }> = [];

  constructor(
    settings: RssDashboardSettings,
    statusFilters: Set<string>,
    tagFilters: Set<string>,
    filterLogic: "AND" | "OR",
    callbacks: ArticleFilterCallbacks
  ) {
    this.settings = settings;
    this.statusFilters = statusFilters;
    this.tagFilters = tagFilters;
    this.filterLogic = filterLogic;
    this.callbacks = callbacks;
  }

  // Open the floating menu and stage all filter changes locally until Apply.
  public show(toggleBtn: HTMLElement): void {
    const targetDocument = toggleBtn.ownerDocument;
    const targetBody = targetDocument.body;
    const targetWindow = targetDocument.defaultView || window;

    // Toggle close when clicking the same trigger.
    if (this.activePortal && this.activeFilterToggleBtn === toggleBtn) {
      this.close();
      return;
    }
    this.close();

    // Remove any existing menus from stale state.
    targetDocument
      .querySelectorAll(".rss-dashboard-filter-menu-portal")
      .forEach((el) => el.remove());

    const menuPortal = targetBody.createDiv({
      cls: "rss-dashboard-filter-menu rss-dashboard-filter-menu-portal",
    });
    this.activePortal = menuPortal;
    this.activeFilterToggleBtn = toggleBtn;
    toggleBtn.addClass("active");

    const pendingStatusFilters = new Set(this.statusFilters);
    const pendingTagFilters = new Set(this.tagFilters);
    let pendingAllChecked =
      pendingStatusFilters.size === 0 && pendingTagFilters.size === 0;
    let pendingFilterLogic: "AND" | "OR" = this.filterLogic;
    const currentBypassAll = this.settings.keywordRules?.bypassAll ?? false;
    let pendingBypassAll = currentBypassAll;
    const currentHighlightsEnabled = this.settings.highlights?.enabled ?? false;
    let pendingHighlightsEnabled = currentHighlightsEnabled;
    const currentStatusBarVisible =
      this.settings.display.showFilterStatusBar ?? true;
    let pendingStatusBarVisible = currentStatusBarVisible;

    const removeTagSubmenus = () => {
      menuPortal
        .querySelectorAll(".rss-dashboard-tag-submenu")
        .forEach((el) => el.remove());
    };

    // Filter logic toggle section.
    const logicToggles = menuPortal.createDiv({
      cls: "rss-dashboard-filter-logic-toggles",
    });

    const andBtn = logicToggles.createEl("button", {
      cls: "rss-dashboard-filter-logic-btn" +
        (pendingFilterLogic === "AND" ? " active" : ""),
      text: "And",
    });
    const orBtn = logicToggles.createEl("button", {
      cls: "rss-dashboard-filter-logic-btn" +
        (pendingFilterLogic === "OR" ? " active" : ""),
      text: "Or",
    });

    andBtn.addEventListener("click", () => {
      pendingFilterLogic = "AND";
      andBtn.addClass("active");
      orBtn.removeClass("active");
    });

    orBtn.addEventListener("click", () => {
      pendingFilterLogic = "OR";
      orBtn.addClass("active");
      andBtn.removeClass("active");
    });

    menuPortal.createDiv({ cls: "rss-dashboard-filter-menu-separator" });

    // Quick reset for all filter checkboxes.
    const allItem = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-filter-all-item",
    });

    const allCheckbox = allItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    allCheckbox.checked = pendingAllChecked;

    const allIconDiv = allItem.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(allIconDiv, "fullscreen");

    allItem.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "All",
    });

    const uncheckAllFilterCheckboxes = () => {
      pendingStatusFilters.clear();
      pendingTagFilters.clear();
      pendingAllChecked = true;
      filterCheckboxes.forEach((cb) => {
        cb.checked = false;
      });
    };

    allCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      if (allCheckbox.checked) {
        uncheckAllFilterCheckboxes();
      } else {
        pendingAllChecked = false;
      }
    });

    allItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== allCheckbox) {
        allCheckbox.checked = !allCheckbox.checked;
        if (allCheckbox.checked) {
          uncheckAllFilterCheckboxes();
        } else {
          pendingAllChecked = false;
        }
      }
    });

    allItem.addEventListener("mouseenter", removeTagSubmenus);

    // Standard article status filters.
    const filterCheckboxes: Map<string, HTMLInputElement> = new Map();
    const filterOptions = [
      { id: "unread", name: "Unread", icon: "circle" },
      { id: "read", name: "Read", icon: "check-circle" },
      { id: "saved", name: "Saved", icon: "save" },
      { id: "starred", name: "Starred", icon: "star" },
      { id: "podcasts", name: "Podcast", icon: "mic" },
      { id: "videos", name: "Videos", icon: "play" },
      { id: "tagged", name: "Tagged", icon: "tag" },
      { id: "untagged", name: "Untagged", icon: "ban" },
    ];

    filterOptions.forEach((opt) => {
      const item = menuPortal.createDiv({ cls: "rss-dashboard-filter-menu-item" });
      const checkbox = item.createEl("input", {
        attr: { type: "checkbox" },
        cls: "rss-dashboard-filter-checkbox",
      });
      checkbox.checked = this.statusFilters.has(opt.id);
      filterCheckboxes.set(opt.id, checkbox);

      const iconDiv = item.createDiv({ cls: "rss-dashboard-filter-menu-icon" });
      setIcon(iconDiv, opt.icon);

      item.createDiv({
        cls: "rss-dashboard-filter-menu-text",
        text: opt.name,
      });

      if (opt.id === "tagged") {
        const arrow = item.createDiv({ cls: "rss-dashboard-filter-menu-arrow" });
        setIcon(arrow, "chevron-right");
        item.addEventListener("mouseenter", () => {
          this.showTagsSubMenu(
            item,
            menuPortal,
            pendingTagFilters,
            allCheckbox,
            pendingStatusFilters
          );
        });
      } else {
        item.addEventListener("mouseenter", removeTagSubmenus);
      }

      const handleFilterCheck = (checked: boolean) => {
        if (checked) {
          pendingStatusFilters.add(opt.id);
          allCheckbox.checked = false;
          pendingAllChecked = false;
        } else {
          pendingStatusFilters.delete(opt.id);
          if (opt.id === "tagged") pendingTagFilters.clear();
          if (pendingStatusFilters.size === 0 && pendingTagFilters.size === 0) {
            allCheckbox.checked = true;
            pendingAllChecked = true;
          }
        }
      };

      checkbox.addEventListener("change", (e) => {
        e.stopPropagation();
        handleFilterCheck(checkbox.checked);
      });

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          handleFilterCheck(checkbox.checked);
        }
      });
    });

    // Display toggles that affect article rendering and filtering behavior.
    const postFilterSeparator = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-separator",
    });
    postFilterSeparator.addEventListener("mouseenter", removeTagSubmenus);

    const statusBarItem = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-status-bar-toggle",
    });
    const statusBarCheckbox = statusBarItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    statusBarCheckbox.checked = pendingStatusBarVisible;
    const statusBarIconDiv = statusBarItem.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(statusBarIconDiv, "info");
    statusBarItem.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Show Status Bar",
    });
    statusBarCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      pendingStatusBarVisible = statusBarCheckbox.checked;
    });
    statusBarItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== statusBarCheckbox) {
        statusBarCheckbox.checked = !statusBarCheckbox.checked;
        pendingStatusBarVisible = statusBarCheckbox.checked;
      }
    });

    // Keyword-rule bypass toggle.
    const postStatusBarSeparator = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-separator",
    });
    postStatusBarSeparator.addEventListener("mouseenter", removeTagSubmenus);

    const bypassItem = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-bypass-filters-toggle",
    });
    const bypassCheckbox = bypassItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    bypassCheckbox.checked = pendingBypassAll;
    const bypassIconDiv = bypassItem.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(bypassIconDiv, "power");
    bypassItem.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Bypass Keyword Rules",
    });
    bypassCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      pendingBypassAll = bypassCheckbox.checked;
    });
    bypassItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== bypassCheckbox) {
        bypassCheckbox.checked = !bypassCheckbox.checked;
        pendingBypassAll = bypassCheckbox.checked;
      }
    });

    // Highlights toggle.
    const postBypassSeparator = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-separator",
    });
    postBypassSeparator.addEventListener("mouseenter", removeTagSubmenus);

    const highlightsItem = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-highlights-toggle",
    });
    const highlightsCheckbox = highlightsItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    highlightsCheckbox.checked = pendingHighlightsEnabled;
    const highlightsIconDiv = highlightsItem.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(highlightsIconDiv, "highlighter");
    highlightsItem.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Show Highlights",
    });
    highlightsCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      pendingHighlightsEnabled = highlightsCheckbox.checked;
    });
    highlightsItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== highlightsCheckbox) {
        highlightsCheckbox.checked = !highlightsCheckbox.checked;
        pendingHighlightsEnabled = highlightsCheckbox.checked;
      }
    });

    // Apply button commits all staged changes at once.
    const applyBtn = menuPortal.createEl("button", { cls: "rss-dashboard-filter-apply-btn", text: "Apply" });
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.applyFilters({
        pendingFilterLogic,
        pendingStatusFilters,
        pendingTagFilters,
        pendingBypassAll,
        pendingHighlightsEnabled,
        pendingStatusBarVisible,
        currentBypassAll,
        currentHighlightsEnabled,
        currentStatusBarVisible
      });
      this.close();
    });

    const rect = toggleBtn.getBoundingClientRect();
    menuPortal.style.top = `${rect.bottom + 5}px`;
    menuPortal.style.left = `${rect.left}px`;
    targetWindow.requestAnimationFrame(() => {
      const menuRect = menuPortal.getBoundingClientRect();
      const margin = 8;
      const maxLeft = targetWindow.innerWidth - menuRect.width - margin;
      const nextLeft = Math.max(margin, Math.min(rect.left, maxLeft));
      menuPortal.style.left = `${nextLeft}px`;
    });

    targetWindow.setTimeout(() => {
      if (this.activePortal !== menuPortal) return;
      this.activeFilterOutsideListenerCleanup = this.addDocumentListener(
        targetDocument,
        "mousedown",
        (e: Event) => {
          if (
            !menuPortal.contains(e.target as Node) &&
            !toggleBtn.contains(e.target as Node)
          ) {
            this.close();
          }
        }
      );
    }, 0);
  }

  // Commit the staged filter state in one batch event.
  private applyFilters(state: {
    pendingFilterLogic: "AND" | "OR";
    pendingStatusFilters: Set<string>;
    pendingTagFilters: Set<string>;
    pendingBypassAll: boolean;
    pendingHighlightsEnabled: boolean;
    pendingStatusBarVisible: boolean;
    currentBypassAll: boolean;
    currentHighlightsEnabled: boolean;
    currentStatusBarVisible: boolean;
  }): void {
    const {
      pendingFilterLogic,
      pendingStatusFilters,
      pendingTagFilters,
      pendingBypassAll,
      pendingHighlightsEnabled,
      pendingStatusBarVisible,
    } = state;

    // Send a single batch update event to minimize re-renders and ensure atomic state change
    this.callbacks.onFilterChange({
      type: "batch",
      value: null,
      batch: {
        logic: pendingFilterLogic,
        statusFilters: pendingStatusFilters,
        tagFilters: pendingTagFilters,
        bypassAll: pendingBypassAll,
        highlightsEnabled: pendingHighlightsEnabled,
        statusBarVisible: pendingStatusBarVisible,
      },
    });
  }

  // Render the nested tag submenu and keep tag selection state synchronized.
  private showTagsSubMenu(
    parentItem: HTMLElement,
    parentMenu: HTMLElement,
    pendingTagFilters: Set<string>,
    allCheckbox: HTMLInputElement,
    pendingStatusFilters: Set<string>
  ): void {
    parentMenu
      .querySelectorAll(".rss-dashboard-tag-submenu")
      .forEach((el) => el.remove());
    const subMenu = parentMenu.createDiv({
      cls: "rss-dashboard-filter-menu rss-dashboard-tag-submenu",
    });

    if (this.settings.availableTags.length === 0) {
      subMenu.createDiv({
        cls: "rss-dashboard-filter-menu-item empty",
        text: "No tags available",
      });
    }

    this.settings.availableTags.forEach((tag) => {
      const item = subMenu.createDiv({ cls: "rss-dashboard-filter-menu-item" });
      const checkbox = item.createEl("input", {
        attr: { type: "checkbox" },
        cls: "rss-dashboard-filter-checkbox",
      });
      checkbox.checked = pendingTagFilters.has(tag.name);
      const colorDot = item.createDiv({ cls: "rss-dashboard-tag-color-dot" });
      colorDot.style.setProperty(
        "--tag-color",
        tag.color || "var(--interactive-accent)"
      );
      item.createDiv({
        cls: "rss-dashboard-filter-menu-text",
        text: tag.name,
      });

      checkbox.addEventListener("change", (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          pendingTagFilters.add(tag.name);
          allCheckbox.checked = false;
        } else {
          pendingTagFilters.delete(tag.name);
          if (pendingStatusFilters.size === 0 && pendingTagFilters.size === 0) allCheckbox.checked = true;
        }
      });

      item.addEventListener("click", (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          if (checkbox.checked) {
            pendingTagFilters.add(tag.name);
            allCheckbox.checked = false;
          } else {
            pendingTagFilters.delete(tag.name);
            if (
              pendingStatusFilters.size === 0 &&
              pendingTagFilters.size === 0
            )
              allCheckbox.checked = true;
          }
        }
      });
    });

    const rect = parentItem.getBoundingClientRect();
    const parentMenuRect = parentMenu.getBoundingClientRect();
    let subLeft = parentMenuRect.right + 4;
    let subTop = rect.top;

    subMenu.addClass("rss-dashboard-submenu-fixed");
    subMenu.style.setProperty("--submenu-top", `${subTop}px`);
    subMenu.style.setProperty("--submenu-left", `${subLeft}px`);

    requestAnimationFrame(() => {
      const subRect = subMenu.getBoundingClientRect();
      if (subRect.right > window.innerWidth)
        subMenu.style.setProperty(
          "--submenu-left",
          `${parentMenuRect.left - subRect.width - 4}px`
        );
      if (subRect.bottom > window.innerHeight)
        subMenu.style.setProperty(
          "--submenu-top",
          `${window.innerHeight - subRect.height - 8}px`
        );
    });
  }

  // Remove the active portal and detach any temporary listeners.
  private close(): void {
    if (this.activeFilterOutsideListenerCleanup) {
      this.activeFilterOutsideListenerCleanup();
      this.activeFilterOutsideListenerCleanup = null;
    }
    if (this.activePortal) {
      this.activePortal.remove();
      this.activePortal = null;
    }
    if (this.activeFilterToggleBtn) {
      this.activeFilterToggleBtn.removeClass("active");
      this.activeFilterToggleBtn = null;
    }
    this.documentListeners.forEach(({ target, type, listener }) => {
      target.removeEventListener(type, listener);
    });
    this.documentListeners = [];
  }

  // Register document or window listeners so they can be cleaned up later.
  private addDocumentListener(
    target: Document | Window,
    type: string,
    listener: EventListenerOrEventListenerObject
  ) {
    target.addEventListener(type, listener);
    const entry = { target: target as Document, type, listener };
    this.documentListeners.push(entry);
    return () => {
      target.removeEventListener(type, listener);
      this.documentListeners = this.documentListeners.filter((e) => e !== entry);
    };
  }
}
