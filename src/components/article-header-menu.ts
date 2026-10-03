import { setIcon } from "obsidian";
import { ArticleGroupByOption, RssDashboardSettings } from "../types/types";
import { FilterChangeEvent } from "./article-filter-menu";

type MenuOptionEntries = Array<[label: string, value: string]>;

interface SelectorFocusContext {
  targetDocument: Document;
  triggerLabel: string;
  menuRootIndex: number;
}

let menuInstanceId = 0;

const CARD_COLUMN_OPTIONS: MenuOptionEntries = [
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
  private activePortal: HTMLElement | null = null;
  private activePortalToggleBtn: HTMLElement | null = null;
  private activePortalCleanup: (() => void) | null = null;
  private activePortalOptions: HTMLElement[] = [];
  private activePortalIndex = -1;
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

      if (this.activePortal) {
        this.closeActivePortal();
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
      if (this.activePortal?.contains(target)) return;

      this.closeMenu();
    });
  }

  public destroy(): void {
    this.closeMenu();
    this.closeActivePortal();
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

  private closeMenu(): void {
    this.closeActivePortal();
    this.dropdownMenu?.classList.remove("is-menu-open");
    this.hamburgerBtn?.classList.remove("is-menu-open");
    this.hamburgerBtn?.setAttribute("aria-expanded", "false");
  }

  private toggleMenu(): void {
    if (this.dropdownMenu?.classList.contains("is-menu-open")) {
      this.closeMenu();
      return;
    }
    this.closeActivePortal();
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

  private closeActivePortal(): void {
    if (this.activePortalCleanup) {
      this.activePortalCleanup();
      this.activePortalCleanup = null;
    }
    if (this.activePortal) {
      this.activePortal.remove();
      this.activePortal = null;
    }
    if (this.activePortalToggleBtn) {
      this.activePortalToggleBtn.setAttribute("aria-expanded", "false");
      this.activePortalToggleBtn.removeAttribute("aria-controls");
      this.activePortalToggleBtn.removeAttribute("aria-activedescendant");
      this.activePortalToggleBtn.removeClass("active");
      this.activePortalToggleBtn = null;
    }
    this.activePortalOptions = [];
    this.activePortalIndex = -1;
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

    this.createThemedSelector(
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

    this.createThemedSelector(
      controls,
      "sort-asc",
      "Sort:",
      { Newest: "newest", Oldest: "oldest" },
      () => this.settings.articleSort,
      (val) => this.callbacks.onSortChange(val as "newest" | "oldest"),
      "rss-dashboard-sort",
    );

    this.createThemedSelector(
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
    this.createViewStyleSelector(viewStyleRow);
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
    cardsPerRowTrigger.onclick = (e) => {
      e.stopPropagation();
      cardsPerRowTrigger.focus();
      if (cardsPerRowTrigger.hasClass("active")) {
        this.closeActivePortal();
        return;
      }
      this.showThemedMenu(
        cardsPerRowTrigger,
        CARD_COLUMN_OPTIONS,
        String(
          this.clampCardColumnsPerRow(
            this.settings.display.cardColumnsPerRow ?? 0,
          ),
        ),
        (val) => {
          this.callbacks.onFilterChange({
            type: "batch",
            value: null,
            batch: {
              cardColumnsPerRow: this.clampCardColumnsPerRow(Number(val)),
            },
          });
        },
      );
    };
    this.addSelectorKeyboard(
      cardsPerRowTrigger,
      CARD_COLUMN_OPTIONS,
      () => String(this.clampCardColumnsPerRow(this.settings.display.cardColumnsPerRow ?? 0)),
      (val) => this.callbacks.onFilterChange({
        type: "batch",
        value: null,
        batch: { cardColumnsPerRow: this.clampCardColumnsPerRow(Number(val)) },
      }),
    );

    const cardSpacingGroup = cardLayoutControls.createDiv({
      cls: "rss-dashboard-dropdown-card-spacing-group",
    });
    const cardSpacingLabel = cardSpacingGroup.createDiv({
      cls: "rss-dashboard-dropdown-card-layout-label",
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

  private createThemedSelector(
    parent: HTMLElement,
    icon: string,
    label: string,
    options: Record<string, string>,
    getValue: () => string,
    onChange: (val: string) => void,
    triggerClass: string,
  ): void {
    const wrapper = parent.createDiv({
      cls: "rss-dashboard-select-with-icon rss-dashboard-select-with-label",
    });
    wrapper.createSpan({ cls: "rss-dashboard-select-label", text: label });

    const inner = wrapper.createDiv({ cls: "rss-dashboard-select-inner" });
    setIcon(inner.createDiv({ cls: "rss-dashboard-select-icon" }), icon);

    const trigger = inner.createDiv({
      cls: `rss-dashboard-themed-select-trigger ${triggerClass}`,
      attr: {
        role: "combobox",
        tabindex: "0",
        "aria-label": label.replace(/:$/, ""),
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
      },
    });
    const currentVal = getValue();
    const currentLabel =
      Object.keys(options).find((key) => options[key] === currentVal) ??
      currentVal;
    trigger.createSpan({
      text: currentLabel,
      cls: "rss-dashboard-themed-select-value",
    });
    trigger.setAttribute("aria-valuetext", currentLabel);
    setIcon(
      trigger.createDiv({ cls: "rss-dashboard-selector-arrow" }),
      "chevron-down",
    );

    trigger.onclick = (e) => {
      e.stopPropagation();
      trigger.focus();
      if (trigger.hasClass("active")) {
        this.closeActivePortal();
        return;
      }
      this.showThemedMenu(trigger, options, getValue(), onChange);
    };
    this.addSelectorKeyboard(trigger, options, getValue, onChange);
  }

  private addSelectorKeyboard(
    trigger: HTMLElement,
    options: Record<string, string> | MenuOptionEntries,
    getValue: () => string,
    onChange: (value: string) => void,
  ): void {
    trigger.addEventListener("keydown", (e: KeyboardEvent) => {
      const isOpen = this.activePortalToggleBtn === trigger;
      if (e.key === "Tab") {
        if (isOpen) this.closeActivePortal();
        return;
      }
      if (!isOpen && ["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        this.showThemedMenu(trigger, options, getValue(), onChange);
        if (e.key === "ArrowDown") this.moveActivePortalOption(1);
        if (e.key === "ArrowUp") this.moveActivePortalOption(-1);
        return;
      }
      if (!isOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.closeActivePortal();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        this.moveActivePortalOption(e.key === "ArrowDown" ? 1 : -1);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        e.stopPropagation();
        this.setActivePortalOption(e.key === "Home" ? 0 : this.activePortalOptions.length - 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.commitActivePortalOption(onChange);
      }
    });
  }

  private moveActivePortalOption(delta: number): void {
    const nextIndex = Math.max(
      0,
      Math.min(this.activePortalOptions.length - 1, this.activePortalIndex + delta),
    );
    this.setActivePortalOption(nextIndex);
  }

  private setActivePortalOption(index: number): void {
    if (index < 0 || index >= this.activePortalOptions.length) return;
    this.activePortalOptions.forEach((option, optionIndex) => {
      option.classList.toggle("is-keyboard-active", optionIndex === index);
    });
    this.activePortalIndex = index;
    const activeOption = this.activePortalOptions[index];
    if (activeOption?.id) {
      this.activePortalToggleBtn?.setAttribute("aria-activedescendant", activeOption.id);
    }
  }

  private getSelectorFocusContext(
    trigger: HTMLElement | null,
  ): SelectorFocusContext | null {
    if (!trigger || trigger.ownerDocument.activeElement !== trigger) return null;
    const triggerLabel = trigger.getAttribute("aria-label");
    const menuRoot = trigger.closest<HTMLElement>(".rss-dashboard-hamburger-menu");
    if (!triggerLabel || !menuRoot) return null;

    const menuRootIndex = Array.from(
      trigger.ownerDocument.querySelectorAll<HTMLElement>(".rss-dashboard-hamburger-menu"),
    ).indexOf(menuRoot);
    if (menuRootIndex < 0) return null;

    return { targetDocument: trigger.ownerDocument, triggerLabel, menuRootIndex };
  }

  private restoreSelectorFocus(context: SelectorFocusContext): void {
    const replacementRoot = context.targetDocument.querySelectorAll<HTMLElement>(
      ".rss-dashboard-hamburger-menu",
    )[context.menuRootIndex];
    if (!replacementRoot) return;
    const replacementTrigger = Array.from(
      replacementRoot.querySelectorAll<HTMLElement>('[role="combobox"]'),
    ).find((candidate) => candidate.getAttribute("aria-label") === context.triggerLabel);
    replacementTrigger?.focus();
    if (context.targetDocument.activeElement !== replacementTrigger) {
      replacementRoot.querySelector<HTMLElement>(".rss-dashboard-hamburger-button")?.focus();
    }
  }

  private commitActivePortalOption(onChange: (value: string) => void): void {
    const option = this.activePortalOptions[this.activePortalIndex];
    if (!option) return;
    const value = option?.getAttribute("data-value");
    if (value === null || value === undefined) return;
    const label = option.querySelector(".rss-dashboard-filter-menu-text")?.textContent ?? value;
    const trigger = this.activePortalToggleBtn;
    const focusContext = this.getSelectorFocusContext(trigger);
    const valueElement = trigger?.querySelector(
      ".rss-dashboard-themed-select-value, .rss-dashboard-selector-text",
    );

    onChange(value);
    trigger?.setAttribute("aria-valuetext", label);
    valueElement?.setText(label);
    this.closeActivePortal();
    if (focusContext) this.restoreSelectorFocus(focusContext);
    void this.callbacks.onPersistSettings();
  }

  private showThemedMenu(
    trigger: HTMLElement,
    options: Record<string, string> | MenuOptionEntries,
    currentVal: string,
    onChange: (val: string) => void,
    icons?: Record<string, string>,
  ): void {
    this.closeActivePortal();
    const targetDocument = trigger.ownerDocument;
    const entries: MenuOptionEntries = Array.isArray(options)
      ? options
      : Object.keys(options).map(
          (label): [string, string] => [label, options[label] ?? label],
        );
    const portalId = `rss-dashboard-options-${++menuInstanceId}`;
    const portal = targetDocument.body.createDiv({
      cls: "rss-dashboard-filter-menu rss-dashboard-themed-menu-portal",
      attr: {
        id: portalId,
        role: "listbox",
        "aria-label": trigger.getAttribute("aria-label") ?? "Options",
      },
    });
    this.activePortal = portal;
    this.activePortalToggleBtn = trigger;
    this.activePortalOptions = [];
    this.activePortalIndex = -1;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", portalId);
    trigger.addClass("active");

    entries.forEach(([label, value], index) => {
      const item = portal.createDiv({
        cls: "rss-dashboard-filter-menu-item",
        attr: {
          id: `${portalId}-option-${index}`,
          role: "option",
          "aria-selected": String(value === currentVal),
          "data-value": value,
        },
      });
      const check = item.createDiv({ cls: "rss-dashboard-filter-menu-check" });
      if (value === currentVal) {
        setIcon(check, "check");
        item.addClass("is-active");
        this.activePortalIndex = index;
      }
      if (icons && icons[value]) {
        const iconDiv = item.createDiv({
          cls: "rss-dashboard-filter-menu-icon",
        });
        setIcon(iconDiv, icons[value]);
      }
      item.createDiv({ text: label, cls: "rss-dashboard-filter-menu-text" });
      item.onclick = () => {
        this.activePortalIndex = index;
        this.commitActivePortalOption(onChange);
      };
      this.activePortalOptions.push(item);
    });
    if (this.activePortalIndex < 0 && this.activePortalOptions.length > 0) {
      this.activePortalIndex = 0;
    }
    this.setActivePortalOption(this.activePortalIndex);

    this.positionPortal(trigger, portal);
    const targetWindow = targetDocument.defaultView || activeWindow;
    targetWindow.setTimeout(() => {
      this.activePortalCleanup = this.addDocumentListener(
        targetDocument,
        "mousedown",
        (e: Event) => {
          if (
            !portal.contains(e.target as Node) &&
            !trigger.contains(e.target as Node)
          ) {
            this.closeActivePortal();
          }
        },
      );
    }, 0);
  }

  private createViewStyleSelector(parent: HTMLElement): void {
    const selector = parent.createDiv({
      cls: "rss-dashboard-view-style-selector",
      attr: {
        role: "combobox",
        tabindex: "0",
        "aria-label": "View style",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
      },
    });
    const style = this.settings.viewStyle;
    const icons: Record<string, string> = {
      feed: "newspaper",
      card: "layout-grid",
      list: "list",
    };
    setIcon(
      selector.createDiv({ cls: "rss-dashboard-selector-icon" }),
      icons[style] || "list",
    );
    selector.createSpan({
      cls: "rss-dashboard-selector-text",
      text: style.charAt(0).toUpperCase() + style.slice(1) + " View",
    });
    selector.setAttribute(
      "aria-valuetext",
      style.charAt(0).toUpperCase() + style.slice(1) + " View",
    );
    setIcon(
      selector.createDiv({ cls: "rss-dashboard-selector-arrow" }),
      "chevron-down",
    );

    selector.onclick = (e) => {
      e.stopPropagation();
      selector.focus();
      if (selector.hasClass("active")) {
        this.closeActivePortal();
        return;
      }
      this.showThemedMenu(
        selector,
        { "List View": "list", "Card View": "card", "Feed View": "feed" },
        this.settings.viewStyle,
        (val) =>
          this.callbacks.onToggleViewStyle(val as "list" | "card" | "feed"),
        icons,
      );
    };
    this.addSelectorKeyboard(
      selector,
      { "List View": "list", "Card View": "card", "Feed View": "feed" },
      () => this.settings.viewStyle,
      (val) => this.callbacks.onToggleViewStyle(val as "list" | "card" | "feed"),
    );
  }

  private positionPortal(trigger: HTMLElement, portal: HTMLElement): void {
    const rect = trigger.getBoundingClientRect();
    portal.style.top = `${rect.bottom + 5}px`;
    portal.style.left = `${rect.left}px`;
    const targetWindow = trigger.ownerDocument.defaultView || activeWindow;
    targetWindow.requestAnimationFrame(() => {
      const pRect = portal.getBoundingClientRect();
      const margin = 8;
      const maxLeft = targetWindow.innerWidth - pRect.width - margin;
      portal.style.left = `${Math.max(margin, Math.min(rect.left, maxLeft))}px`;
    });
  }

  private createRefreshButton(parent: HTMLElement, cls: string): void {
    const btn = parent.createEl("button", {
      cls: "rss-dashboard-refresh-button " + cls,
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
