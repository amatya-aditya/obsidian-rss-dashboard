import { setIcon } from "obsidian";
import { ArticleGroupByOption, RssDashboardSettings } from "../types/types";
import { FilterChangeEvent } from "./article-filter-menu";
import { SelectOptionEntries, ThemedSelectPopup } from "./themed-select-popup";

let menuInstanceId = 0;

const CARD_COLUMN_OPTIONS: SelectOptionEntries = [
  ["Auto", "0"],
  ["1", "1"],
  ["2", "2"],
  ["3", "3"],
  ["4", "4"],
  ["5", "5"],
  ["6", "6"],
];

export interface ArticleHeaderMenuCallbacks {
  onSearch: (query: string) => void;
  onSortChange: (value: "newest" | "oldest") => void;
  onGroupChange: (value: ArticleGroupByOption) => void;
  onFilterChange: (event: FilterChangeEvent) => void;
  onToggleViewStyle: (style: "list" | "card" | "feed") => void;
  onPersistSettings: () => Promise<void> | void;
  onRefreshFeeds: () => Promise<void>;
  onMarkAllAsRead: () => void;
  onMarkAllAsUnread: () => void;
}

export class ArticleHeaderMenu {
  private settings: RssDashboardSettings;
  private searchQuery: string;
  private callbacks: ArticleHeaderMenuCallbacks;
  private searchInput: HTMLInputElement | null = null;
  private hamburgerBtn: HTMLElement | null = null;
  private dropdownMenu: HTMLElement | null = null;
  private rootEl: HTMLElement | null = null;
  private popup = new ThemedSelectPopup({
    addDocumentListener: (target, type, listener) =>
      this.addDocumentListener(target, type, listener),
    persistSettings: () => this.callbacks.onPersistSettings(),
  });
  private documentListeners: Array<{
    target: Document | Window;
    type: string;
    listener: EventListenerOrEventListenerObject;
  }> = [];

  constructor(
    settings: RssDashboardSettings,
    searchQuery: string,
    callbacks: ArticleHeaderMenuCallbacks,
  ) {
    this.settings = settings;
    this.searchQuery = searchQuery;
    this.callbacks = callbacks;
  }

  public render(parent: HTMLElement): void {
    this.destroy();

    const hamburgerMenu = parent.createDiv({
      cls: "rss-dashboard-hamburger-menu",
    });
    this.rootEl = hamburgerMenu;

    const instanceId = ++menuInstanceId;
    const hamburgerBtn = hamburgerMenu.createEl("button", {
      cls: "rss-dashboard-hamburger-button clickable-icon",
      attr: {
        type: "button",
        "aria-label": "Menu",
        "aria-expanded": "false",
        "aria-controls": `rss-dashboard-dropdown-${instanceId}`,
      },
    });
    setIcon(hamburgerBtn, "menu");

    const dropdownMenu = hamburgerMenu.createDiv({
      cls: "rss-dashboard-dropdown-menu",
      attr: { id: `rss-dashboard-dropdown-${instanceId}` },
    });
    const dropdownControls = dropdownMenu.createDiv({
      cls: "rss-dashboard-dropdown-controls",
    });
    this.createControls(dropdownControls);

    this.hamburgerBtn = hamburgerBtn;
    this.dropdownMenu = dropdownMenu;

    hamburgerBtn.addEventListener(
      "click",
      (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        this.toggleMenu();
      },
      { capture: true },
    );
    hamburgerBtn.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Tab" && e.shiftKey) {
        targetDocument.defaultView?.setTimeout(() => this.closeMenu(), 0);
      }
    });
    dropdownMenu.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.shiftKey) return;
      const lastMenuButton = dropdownMenu.querySelector(
        ".rss-dashboard-mark-all-buttons-row .rss-dashboard-mark-all-button:last-child",
      );
      if (lastMenuButton === targetDocument.activeElement) {
        targetDocument.defaultView?.setTimeout(() => this.closeMenu(), 0);
      }
    });

    const targetDocument = parent.ownerDocument;
    this.addDocumentListener(targetDocument, "keydown", (e: Event) => {
      const keyboardEvent = e as KeyboardEvent;
      if (keyboardEvent.key !== "Escape") return;

      if (this.popup.isOpen) {
        this.popup.close();
        return;
      }
      if (!dropdownMenu.classList.contains("is-menu-open")) return;

      keyboardEvent.preventDefault();
      keyboardEvent.stopPropagation();
      this.closeMenu();
      hamburgerBtn.focus();
    });
    this.addDocumentListener(targetDocument, "pointerdown", (e: Event) => {
      if (!dropdownMenu.classList.contains("is-menu-open")) return;

      const target = e.target as Node | null;
      if (!target) return;
      if (hamburgerBtn.contains(target)) return;
      if (dropdownMenu.contains(target)) return;
      if (this.popup.contains(target)) return;

      this.closeMenu();
    });
  }

  public destroy(): void {
    this.closeMenu();
    this.popup.close();
    this.documentListeners.forEach(({ target, type, listener }) => {
      target.removeEventListener(type, listener);
    });
    this.documentListeners = [];
  }

  public setSearchQuery(query: string): void {
    this.searchQuery = query;
    if (this.searchInput) {
      this.searchInput.value = query;
    }
  }

  /**
   * Opens the dropdown if it is closed, then focuses and selects its search
   * input. Resolves true once the input has focus, and false when the menu is
   * not rendered, the input is detached by a re-render, or focus never lands.
   */
  public focusSearch(): Promise<boolean> {
    const input = this.searchInput;
    if (!input || !this.dropdownMenu) return Promise.resolve(false);
    if (!this.dropdownMenu.classList.contains("is-menu-open")) {
      this.toggleMenu();
    }
    return new Promise((resolve) => this.focusWhenVisible(input, 10, resolve));
  }

  /**
   * The dropdown fades in (`visibility` only flips once its transition has
   * started), and a hidden input refuses focus. Retry on animation frames until
   * the focus lands, giving up after `framesLeft` frames.
   */
  private focusWhenVisible(
    input: HTMLInputElement,
    framesLeft: number,
    done: (focused: boolean) => void,
  ): void {
    if (!input.isConnected) {
      done(false);
      return;
    }
    input.focus();
    if (input.ownerDocument.activeElement === input) {
      input.select();
      done(true);
      return;
    }
    const view = input.ownerDocument.defaultView;
    if (framesLeft <= 0 || !view) {
      done(false);
      return;
    }
    view.requestAnimationFrame(() =>
      this.focusWhenVisible(input, framesLeft - 1, done),
    );
  }

  private closeMenu(): void {
    this.popup.close();
    this.dropdownMenu?.classList.remove("is-menu-open");
    this.hamburgerBtn?.classList.remove("is-menu-open");
    this.hamburgerBtn?.setAttribute("aria-expanded", "false");
  }

  private toggleMenu(): void {
    if (this.dropdownMenu?.classList.contains("is-menu-open")) {
      this.closeMenu();
      return;
    }
    this.popup.close();
    this.dropdownMenu?.classList.add("is-menu-open");
    this.hamburgerBtn?.classList.add("is-menu-open");
    this.hamburgerBtn?.setAttribute("aria-expanded", "true");
  }

  private clampCardColumnsPerRow(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(6, Math.round(value)));
  }

  private clampCardSpacing(value: number): number {
    if (!Number.isFinite(value)) {
      return 15;
    }
    return Math.max(0, Math.min(40, Math.round(value)));
  }

  private createControls(container: HTMLElement): void {
    const controls = container.createDiv({
      cls: "rss-dashboard-article-controls",
    });

    const searchContainer = controls.createDiv({
      cls: "rss-dashboard-article-search-container",
    });
    setIcon(
      searchContainer.createDiv({ cls: "rss-dashboard-article-search-icon" }),
      "search",
    );
    const searchInput = searchContainer.createEl("input", {
      cls: "rss-dashboard-article-search-input",
      attr: {
        type: "text",
        placeholder: "Search articles...",
        autocomplete: "off",
        spellcheck: "false",
      },
    });
    searchInput.value = this.searchQuery;
    this.searchInput = searchInput;
    searchInput.addEventListener("input", (e) => {
      const val = (e.target as HTMLInputElement).value;
      this.searchQuery = val;
      this.callbacks.onSearch(val);
    });

    this.popup.createSelector(
      controls,
      "history",
      "Age:",
      this.getAgeOptions(),
      () => this.getCurrentAgeFilterValue(),
      (val) =>
        this.callbacks.onFilterChange({
          type: Number(val) === 0 ? "none" : "age",
          value: Number(val),
        }),
      "rss-dashboard-filter",
    );

    this.popup.createSelector(
      controls,
      "sort-asc",
      "Sort:",
      { Newest: "newest", Oldest: "oldest" },
      () => this.settings.articleSort,
      (val) => this.callbacks.onSortChange(val as "newest" | "oldest"),
      "rss-dashboard-sort",
    );

    this.popup.createSelector(
      controls,
      "folders",
      "Grouping:",
      {
        None: "none",
        Feed: "feed",
        Date: "date",
        "Date > Feed": "date_feed",
        Folder: "folder",
        "Folder > Feed": "folder_feed",
      },
      () => this.settings.articleGroupBy,
      (val) => this.callbacks.onGroupChange(val as ArticleGroupByOption),
      "rss-dashboard-group",
    );

    const viewStyleRow = controls.createDiv({
      cls: "rss-dashboard-view-style-row",
    });
    this.popup.createViewStyleSelector(
      viewStyleRow,
      () => this.settings.viewStyle,
      (style) => this.callbacks.onToggleViewStyle(style),
    );
    this.createRefreshButton(viewStyleRow, "rss-dashboard-view-refresh-button");

    if (this.settings.viewStyle === "card") {
      this.createDropdownCardLayoutControls(controls);
    }

    const markAllRow = controls.createDiv({
      cls: "rss-dashboard-mark-all-row",
    });
    markAllRow.createSpan({
      text: "Mark all:",
      cls: "rss-dashboard-mark-all-label",
    });
    const markAllBtns = markAllRow.createDiv({
      cls: "rss-dashboard-mark-all-buttons-row",
    });

    const readBtn = markAllBtns.createEl("button", {
      cls: "rss-dashboard-mark-all-button rss-dashboard-mark-read",
    });
    setIcon(readBtn.createDiv(), "check-circle");
    readBtn.createSpan({ text: "Read", cls: "rss-dashboard-mark-all-text" });
    readBtn.onclick = () => this.callbacks.onMarkAllAsRead();

    const unreadBtn = markAllBtns.createEl("button", {
      cls: "rss-dashboard-mark-all-button",
    });
    setIcon(unreadBtn.createDiv(), "circle");
    unreadBtn.createSpan({
      text: "Unread",
      cls: "rss-dashboard-mark-all-text",
    });
    unreadBtn.onclick = () => this.callbacks.onMarkAllAsUnread();
  }

  private createDropdownCardLayoutControls(parent: HTMLElement): void {
    const cardLayoutControls = parent.createDiv({
      cls: "rss-dashboard-dropdown-card-layout-controls",
    });

    const cardsPerRowRow = cardLayoutControls.createDiv({
      cls: "rss-dashboard-dropdown-card-layout-row",
    });
    cardsPerRowRow.createSpan({
      cls: "rss-dashboard-dropdown-card-layout-label",
      text: "Cards / row:",
    });

    const cardsPerRowTrigger = cardsPerRowRow.createDiv({
      cls: "rss-dashboard-dropdown-card-layout-trigger rss-dashboard-themed-select-trigger rss-dashboard-dropdown-cards-per-row-trigger",
      attr: {
        role: "combobox",
        tabindex: "0",
        "aria-label": "Cards per row",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
      },
    });
    const getCardsPerRowLabel = () => {
      const currentValue = this.clampCardColumnsPerRow(
        this.settings.display.cardColumnsPerRow ?? 0,
      );
      return currentValue === 0 ? "Auto" : String(currentValue);
    };
    cardsPerRowTrigger.createSpan({
      text: getCardsPerRowLabel(),
      cls: "rss-dashboard-themed-select-value",
    });
    cardsPerRowTrigger.setAttribute("aria-valuetext", getCardsPerRowLabel());
    setIcon(
      cardsPerRowTrigger.createDiv({ cls: "rss-dashboard-selector-arrow" }),
      "chevron-down",
    );
    this.popup.bind(cardsPerRowTrigger, {
      options: CARD_COLUMN_OPTIONS,
      getValue: () =>
        String(
          this.clampCardColumnsPerRow(
            this.settings.display.cardColumnsPerRow ?? 0,
          ),
        ),
      onChange: (val) =>
        this.callbacks.onFilterChange({
          type: "batch",
          value: null,
          batch: {
            cardColumnsPerRow: this.clampCardColumnsPerRow(Number(val)),
          },
        }),
    });

    const cardSpacingGroup = cardLayoutControls.createDiv({
      cls: "rss-dashboard-dropdown-card-spacing-group",
    });
    const cardSpacingLabel = cardSpacingGroup.createDiv({
      cls: "rss-dashboard-dropdown-card-layout-label",
      attr: { id: "rss-dashboard-card-spacing-label" },
      text: `Card spacing: ${this.clampCardSpacing(
        this.settings.display.cardSpacing ?? 15,
      )}px`,
    });
    const cardSpacingInput = cardSpacingGroup.createEl("input", {
      cls: "rss-dashboard-dropdown-card-spacing-input",
      attr: {
        type: "range",
        min: "0",
        max: "40",
        step: "1",
        "aria-labelledby": "rss-dashboard-card-spacing-label",
      },
    });
    cardSpacingInput.value = String(
      this.clampCardSpacing(this.settings.display.cardSpacing ?? 15),
    );
    cardSpacingInput.addEventListener("click", (e) => e.stopPropagation());
    cardSpacingInput.addEventListener("input", () => {
      const nextValue = this.clampCardSpacing(Number(cardSpacingInput.value));
      cardSpacingInput.value = String(nextValue);
      cardSpacingLabel.setText(`Card spacing: ${nextValue}px`);
      this.callbacks.onFilterChange({
        type: "card-spacing-live",
        value: nextValue,
      });
    });
    cardSpacingInput.addEventListener("change", () => {
      const nextValue = this.clampCardSpacing(Number(cardSpacingInput.value));
      cardSpacingInput.value = String(nextValue);
      cardSpacingLabel.setText(`Card spacing: ${nextValue}px`);
      this.callbacks.onFilterChange({
        type: "card-spacing-commit",
        value: nextValue,
      });
    });
  }

  private createRefreshButton(parent: HTMLElement, cls: string): void {
    const btn = parent.createEl("button", {
      cls: "rss-dashboard-refresh-button " + cls,
      attr: { "aria-label": "Refresh feeds" },
    });
    setIcon(btn.createDiv({ cls: "rss-dashboard-refresh-icon" }), "refresh-cw");
    btn.onclick = () => this.callbacks.onRefreshFeeds();
  }

  private getAgeOptions(): Record<string, string> {
    return {
      All: "0",
      "1 hour": "3600000",
      "2 hours": "7200000",
      "4 hours": "14400000",
      "8 hours": "28800000",
      "24 hours": "86400000",
      "48 hours": "172800000",
      "3 days": "259200000",
      "1 week": "604800000",
      "2 weeks": "1209600000",
      "1 month": "2592000000",
      "6 months": "15552000000",
      "1 year": "31536000000",
    };
  }

  private getCurrentAgeFilterValue(): string {
    if (this.settings.articleFilter.type !== "age") {
      return "0";
    }

    const currentValue = this.settings.articleFilter.value;
    if (typeof currentValue !== "number" || currentValue <= 0) {
      return "0";
    }

    return String(currentValue);
  }

  private addDocumentListener(
    target: Document | Window,
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): () => void {
    target.addEventListener(type, listener);
    const entry = { target, type, listener };
    this.documentListeners.push(entry);
    return () => {
      target.removeEventListener(type, listener);
      this.documentListeners = this.documentListeners.filter(
        (existingEntry) => existingEntry !== entry,
      );
    };
  }
}
