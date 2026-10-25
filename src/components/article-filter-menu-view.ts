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

interface PendingFilterState {
  pendingStatusFilters: Set<string>;
  pendingTagFilters: Set<string>;
  pendingAllChecked: boolean;
  pendingFilterLogic: "AND" | "OR";
  currentBypassAll: boolean;
  pendingBypassAll: boolean;
  currentHighlightsEnabled: boolean;
  pendingHighlightsEnabled: boolean;
  currentStatusBarVisible: boolean;
  pendingStatusBarVisible: boolean;
}

/**
 * Controls that open the menu through the Filters button, mapped to the one
 * the person used. The Filters button reads and clears its entry while its own
 * click runs, so an entry never outlives `openFilterMenuFrom`.
 */
const pendingOpeners = new WeakMap<HTMLElement, HTMLElement>();

/**
 * Opens the menu by activating `trigger` (the Filters button), on behalf of
 * another control such as the viewing-filters icon. The menu reports its open
 * state on `opener` too, and Esc returns focus to `opener` (WCAG 2.4.3).
 */
export function openFilterMenuFrom(
  trigger: HTMLElement,
  opener: HTMLElement,
): void {
  pendingOpeners.set(trigger, opener);
  try {
    trigger.click();
  } finally {
    pendingOpeners.delete(trigger);
  }
}

/** The control that asked `trigger` to open the menu, if any. */
export function takePendingFilterMenuOpener(
  trigger: HTMLElement,
): HTMLElement | undefined {
  const opener = pendingOpeners.get(trigger);
  pendingOpeners.delete(trigger);
  return opener;
}

/**
 * ArticleFilterMenu Component
 *
 * Extracted from ArticleList.ts to manage complex multi-filtering (Status + Tags).
 * Renders a custom portal-based menu to ensure correct theme inheritance.
 * This component is decoupled from ArticleList via the ArticleFilterCallbacks interface.
 */
export class ArticleFilterMenu {
  private static activeMobileMenus = new WeakMap<
    HTMLElement,
    ArticleFilterMenu
  >();
  private settings: RssDashboardSettings;
  private statusFilters: Set<string>;
  private tagFilters: Set<string>;
  private filterLogic: "AND" | "OR";
  private callbacks: ArticleFilterCallbacks;

  private activePortal: HTMLElement | null = null;
  private activeFilterOutsideListenerCleanup: (() => void) | null = null;
  private activeFilterToggleBtn: HTMLElement | null = null;
  private activeOpener: HTMLElement | null = null;
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
    callbacks: ArticleFilterCallbacks,
  ) {
    this.settings = settings;
    this.statusFilters = statusFilters;
    this.tagFilters = tagFilters;
    this.filterLogic = filterLogic;
    this.callbacks = callbacks;
  }

  // Open the floating menu and stage all filter changes locally until Apply.
  // `opener` is the control the person used when it is not `toggleBtn`: it
  // reports the open state and takes focus back on Escape.
  public show(toggleBtn: HTMLElement, opener: HTMLElement = toggleBtn): void {
    const targetDocument = toggleBtn.ownerDocument;
    const targetBody = targetDocument.body;
    const targetWindow = targetDocument.defaultView || activeWindow;

    const activeMobileMenu = ArticleFilterMenu.activeMobileMenus.get(toggleBtn);
    if (activeMobileMenu) {
      if (activeMobileMenu.activePortal?.isConnected) {
        activeMobileMenu.close();
        return;
      }
      activeMobileMenu.close();
    }

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
    if (toggleBtn.classList.contains("rss-dashboard-mobile-filter-button")) {
      ArticleFilterMenu.activeMobileMenus.set(toggleBtn, this);
    }
    this.activeOpener = opener;
    toggleBtn.addClass("active");
    toggleBtn.setAttribute("aria-expanded", "true");
    opener.setAttribute("aria-expanded", "true");

    const pendingState: PendingFilterState = {
      pendingStatusFilters: new Set(this.statusFilters),
      pendingTagFilters: new Set(this.tagFilters),
      pendingAllChecked:
        this.statusFilters.size === 0 && this.tagFilters.size === 0,
      pendingFilterLogic: this.filterLogic,
      currentBypassAll: this.settings.keywordRules?.bypassAll ?? false,
      pendingBypassAll: this.settings.keywordRules?.bypassAll ?? false,
      currentHighlightsEnabled: this.settings.highlights?.enabled ?? false,
      pendingHighlightsEnabled: this.settings.highlights?.enabled ?? false,
      currentStatusBarVisible:
        this.settings.display.showFilterStatusBar ?? true,
      pendingStatusBarVisible:
        this.settings.display.showFilterStatusBar ?? true,
    };
    const filterCheckboxes = new Map<string, HTMLInputElement>();
    const removeTagSubmenus = () => this.removeTagSubmenus(menuPortal);

    this.renderFilterLogicToggles(menuPortal, pendingState);
    const allCheckbox = this.renderAllFilterItem(
      menuPortal,
      pendingState,
      filterCheckboxes,
      removeTagSubmenus,
    );
    this.renderStatusFilterItems(
      menuPortal,
      pendingState,
      allCheckbox,
      filterCheckboxes,
      removeTagSubmenus,
    );
    this.renderDisplayToggles(menuPortal, pendingState, removeTagSubmenus);
    this.renderApplyButton(menuPortal, pendingState);
    this.positionMenu(targetWindow, toggleBtn, menuPortal);
    this.registerDismissalListeners(
      targetDocument,
      targetWindow,
      menuPortal,
      opener,
    );
  }

  private removeTagSubmenus(menuPortal: HTMLElement): void {
    menuPortal
      .querySelectorAll(".rss-dashboard-tag-submenu")
      .forEach((el) => el.remove());
  }

  private renderFilterLogicToggles(
    menuPortal: HTMLElement,
    state: PendingFilterState,
  ): void {
    const logicToggles = menuPortal.createDiv({
      cls: "rss-dashboard-filter-logic-toggles",
    });
    const andBtn = logicToggles.createEl("button", {
      cls:
        "rss-dashboard-filter-logic-btn" +
        (state.pendingFilterLogic === "AND" ? " active" : ""),
      text: "And",
    });
    const orBtn = logicToggles.createEl("button", {
      cls:
        "rss-dashboard-filter-logic-btn" +
        (state.pendingFilterLogic === "OR" ? " active" : ""),
      text: "Or",
    });
    andBtn.addEventListener("click", () => {
      state.pendingFilterLogic = "AND";
      andBtn.addClass("active");
      orBtn.removeClass("active");
    });
    orBtn.addEventListener("click", () => {
      state.pendingFilterLogic = "OR";
      orBtn.addClass("active");
      andBtn.removeClass("active");
    });
    menuPortal.createDiv({ cls: "rss-dashboard-filter-menu-separator" });
  }

  private renderAllFilterItem(
    menuPortal: HTMLElement,
    state: PendingFilterState,
    filterCheckboxes: Map<string, HTMLInputElement>,
    removeTagSubmenus: () => void,
  ): HTMLInputElement {
    const allItem = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-filter-all-item",
    });
    const allCheckbox = allItem.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    allCheckbox.checked = state.pendingAllChecked;
    const allIconDiv = allItem.createDiv({
      cls: "rss-dashboard-filter-menu-icon",
    });
    setIcon(allIconDiv, "fullscreen");
    allItem.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "All",
    });
    const uncheckAllFilterCheckboxes = () => {
      state.pendingStatusFilters.clear();
      state.pendingTagFilters.clear();
      state.pendingAllChecked = true;
      filterCheckboxes.forEach((cb) => {
        cb.checked = false;
      });
    };
    allCheckbox.addEventListener("change", (e) => {
      e.stopPropagation();
      if (allCheckbox.checked) {
        uncheckAllFilterCheckboxes();
      } else {
        state.pendingAllChecked = false;
      }
    });
    allItem.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== allCheckbox) {
        allCheckbox.checked = !allCheckbox.checked;
        if (allCheckbox.checked) {
          uncheckAllFilterCheckboxes();
        } else {
          state.pendingAllChecked = false;
        }
      }
    });
    allItem.addEventListener("mouseenter", removeTagSubmenus);
    return allCheckbox;
  }

  private renderStatusFilterItems(
    menuPortal: HTMLElement,
    state: PendingFilterState,
    allCheckbox: HTMLInputElement,
    filterCheckboxes: Map<string, HTMLInputElement>,
    removeTagSubmenus: () => void,
  ): void {
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
      const item = menuPortal.createDiv({
        cls: "rss-dashboard-filter-menu-item",
      });
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
        const arrow = item.createDiv({
          cls: "rss-dashboard-filter-menu-arrow",
        });
        setIcon(arrow, "chevron-right");
        item.addEventListener("mouseenter", () => {
          this.showTagsSubMenu(
            item,
            menuPortal,
            state.pendingTagFilters,
            allCheckbox,
            state.pendingStatusFilters,
          );
        });
      } else {
        item.addEventListener("mouseenter", removeTagSubmenus);
      }
      const handleFilterCheck = (checked: boolean) => {
        if (checked) {
          state.pendingStatusFilters.add(opt.id);
          allCheckbox.checked = false;
          state.pendingAllChecked = false;
        } else {
          state.pendingStatusFilters.delete(opt.id);
          if (opt.id === "tagged") state.pendingTagFilters.clear();
          if (
            state.pendingStatusFilters.size === 0 &&
            state.pendingTagFilters.size === 0
          ) {
            allCheckbox.checked = true;
            state.pendingAllChecked = true;
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
  }

  private renderDisplayToggles(
    menuPortal: HTMLElement,
    state: PendingFilterState,
    removeTagSubmenus: () => void,
  ): void {
    const separator = () => {
      const item = menuPortal.createDiv({
        cls: "rss-dashboard-filter-menu-separator",
      });
      item.addEventListener("mouseenter", removeTagSubmenus);
    };
    separator();
    this.renderStatusBarToggle(menuPortal, state);
    separator();
    this.renderBypassToggle(menuPortal, state);
    separator();
    this.renderHighlightsToggle(menuPortal, state);
  }

  private renderStatusBarToggle(
    menuPortal: HTMLElement,
    state: PendingFilterState,
  ): void {
    const item = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-status-bar-toggle",
    });
    const checkbox = item.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    checkbox.checked = state.pendingStatusBarVisible;
    const icon = item.createDiv({ cls: "rss-dashboard-filter-menu-icon" });
    setIcon(icon, "info");
    item.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Show status bar",
    });
    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      state.pendingStatusBarVisible = checkbox.checked;
    });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        state.pendingStatusBarVisible = checkbox.checked;
      }
    });
  }

  private renderBypassToggle(
    menuPortal: HTMLElement,
    state: PendingFilterState,
  ): void {
    const item = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-bypass-filters-toggle",
    });
    const checkbox = item.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    checkbox.checked = state.pendingBypassAll;
    const icon = item.createDiv({ cls: "rss-dashboard-filter-menu-icon" });
    setIcon(icon, "power");
    item.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Bypass keyword rules",
    });
    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      state.pendingBypassAll = checkbox.checked;
    });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        state.pendingBypassAll = checkbox.checked;
      }
    });
  }

  private renderHighlightsToggle(
    menuPortal: HTMLElement,
    state: PendingFilterState,
  ): void {
    const item = menuPortal.createDiv({
      cls: "rss-dashboard-filter-menu-item rss-dashboard-highlights-toggle",
    });
    const checkbox = item.createEl("input", {
      attr: { type: "checkbox" },
      cls: "rss-dashboard-filter-checkbox",
    });
    checkbox.checked = state.pendingHighlightsEnabled;
    const icon = item.createDiv({ cls: "rss-dashboard-filter-menu-icon" });
    setIcon(icon, "highlighter");
    item.createDiv({
      cls: "rss-dashboard-filter-menu-text",
      text: "Show highlights",
    });
    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      state.pendingHighlightsEnabled = checkbox.checked;
    });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        state.pendingHighlightsEnabled = checkbox.checked;
      }
    });
  }

  private renderApplyButton(
    menuPortal: HTMLElement,
    state: PendingFilterState,
  ): void {
    const applyBtn = menuPortal.createEl("button", {
      cls: "rss-dashboard-filter-apply-btn",
      text: "Apply",
    });
    applyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.applyFilters(state);
      this.close();
    });
  }

  private positionMenu(
    targetWindow: Window,
    toggleBtn: HTMLElement,
    menuPortal: HTMLElement,
  ): void {
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
  }

  private registerDismissalListeners(
    targetDocument: Document,
    targetWindow: Window,
    menuPortal: HTMLElement,
    opener: HTMLElement,
  ): void {
    this.addDocumentListener(targetDocument, "keydown", (e: Event) => {
      const keyboardEvent = e as KeyboardEvent;
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      const focusTarget = this.activeOpener ?? opener;
      this.close();
      focusTarget.focus();
    });
    targetWindow.setTimeout(() => {
      if (this.activePortal !== menuPortal) return;
      this.activeFilterOutsideListenerCleanup = this.addDocumentListener(
        targetDocument,
        "mousedown",
        (e: Event) => {
          if (
            !menuPortal.contains(e.target as Node) &&
            !this.activeFilterToggleBtn?.contains(e.target as Node)
          ) {
            this.close();
          }
        },
      );
    }, 0);
  }

  // The header rebuilds its Filters button while the menu is open. Move the
  // open state, the toggle and the Esc focus target onto the replacement, so
  // aria-expanded still matches the menu and Esc lands on a live control.
  public retarget(newToggle: HTMLElement): void {
    const oldToggle = this.activeFilterToggleBtn;
    if (
      !oldToggle ||
      oldToggle === newToggle ||
      !this.activePortal?.isConnected
    ) {
      return;
    }
    if (ArticleFilterMenu.activeMobileMenus.get(oldToggle) === this) {
      ArticleFilterMenu.activeMobileMenus.delete(oldToggle);
      ArticleFilterMenu.activeMobileMenus.set(newToggle, this);
    }
    oldToggle.removeClass("active");
    oldToggle.setAttribute("aria-expanded", "false");
    newToggle.addClass("active");
    newToggle.setAttribute("aria-expanded", "true");
    if (this.activeOpener === oldToggle) this.activeOpener = newToggle;
    this.activeFilterToggleBtn = newToggle;
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
    pendingStatusFilters: Set<string>,
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
        tag.color || "var(--interactive-accent)",
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
          if (pendingStatusFilters.size === 0 && pendingTagFilters.size === 0)
            allCheckbox.checked = true;
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
            if (pendingStatusFilters.size === 0 && pendingTagFilters.size === 0)
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

    window.requestAnimationFrame(() => {
      const subRect = subMenu.getBoundingClientRect();
      if (subRect.right > activeWindow.innerWidth)
        subMenu.style.setProperty(
          "--submenu-left",
          `${parentMenuRect.left - subRect.width - 4}px`,
        );
      if (subRect.bottom > activeWindow.innerHeight)
        subMenu.style.setProperty(
          "--submenu-top",
          `${activeWindow.innerHeight - subRect.height - 8}px`,
        );
    });
  }

  // Remove the active portal and detach any temporary listeners.
  private close(): void {
    const toggleBtn = this.activeFilterToggleBtn;
    if (
      toggleBtn &&
      ArticleFilterMenu.activeMobileMenus.get(toggleBtn) === this
    ) {
      ArticleFilterMenu.activeMobileMenus.delete(toggleBtn);
    }
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
      this.activeFilterToggleBtn.setAttribute("aria-expanded", "false");
      this.activeFilterToggleBtn = null;
    }
    if (this.activeOpener) {
      this.activeOpener.setAttribute("aria-expanded", "false");
      this.activeOpener = null;
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
    listener: EventListenerOrEventListenerObject,
  ) {
    target.addEventListener(type, listener);
    const entry = { target: target as Document, type, listener };
    this.documentListeners.push(entry);
    return () => {
      target.removeEventListener(type, listener);
      this.documentListeners = this.documentListeners.filter(
        (e) => e !== entry,
      );
    };
  }
}
