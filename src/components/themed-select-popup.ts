import { setIcon } from "obsidian";

export type SelectOptionEntries = Array<[label: string, value: string]>;
export type SelectOptions = Record<string, string> | SelectOptionEntries;

/** What a themed-select trigger offers and how its choice is applied. */
export interface ThemedSelectSpec {
  options: SelectOptions;
  getValue: () => string;
  onChange: (value: string) => void;
  /** Icon name per option value, drawn between the check and the label. */
  icons?: Record<string, string>;
  /** Text the trigger shows for a committed value; defaults to the option label. */
  triggerText?: (value: string, label: string) => string;
}

/** The owning component's disposable-listener registry and persistence hook. */
export interface ThemedSelectPopupHost {
  addDocumentListener(
    target: Document | Window,
    type: string,
    listener: EventListenerOrEventListenerObject,
  ): () => void;
  persistSettings(): Promise<void> | void;
}

interface FocusContext {
  targetDocument: Document;
  triggerLabel: string;
  rootSelector: string;
  rootIndex: number;
}

const VIEW_STYLE_ICONS: Record<string, string> = {
  feed: "newspaper",
  card: "layout-grid",
  list: "list",
};

const VIEW_STYLE_OPTIONS: Record<string, string> = {
  "List view": "list",
  "Card view": "card",
  "Feed view": "feed",
};

// A trigger lives in the hamburger menu or in the desktop controls; both
// re-render with the dashboard, so focus is found again inside the same root.
const FOCUS_ROOT_SELECTORS = [
  ".rss-dashboard-hamburger-menu",
  ".rss-dashboard-desktop-controls",
];

let popupInstanceId = 0;

function toEntries(options: SelectOptions): SelectOptionEntries {
  if (Array.isArray(options)) return options;
  return Object.keys(options).map((label): [string, string] => [
    label,
    options[label] ?? label,
  ]);
}

function viewStyleText(style: string): string {
  return style.charAt(0).toUpperCase() + style.slice(1) + " View";
}

/**
 * The themed-select popup shared by the article header and its hamburger menu.
 *
 * A trigger is a combobox that keeps DOM focus while a listbox portal is open
 * (active option tracked with aria-activedescendant). The portal renders into
 * the trigger's own document so popout windows work, and every document
 * listener goes through the host's disposable registry.
 */
export class ThemedSelectPopup {
  private host: ThemedSelectPopupHost;
  private portal: HTMLElement | null = null;
  private trigger: HTMLElement | null = null;
  private spec: ThemedSelectSpec | null = null;
  private cleanup: (() => void) | null = null;
  private options: HTMLElement[] = [];
  private activeIndex = -1;

  constructor(host: ThemedSelectPopupHost) {
    this.host = host;
  }

  public get isOpen(): boolean {
    return this.portal !== null;
  }

  /** Builds a labelled icon + combobox trigger and wires it to this popup. */
  public createSelector(
    parent: HTMLElement,
    icon: string,
    label: string,
    options: SelectOptions,
    getValue: () => string,
    onChange: (value: string) => void,
    triggerClass: string,
  ): HTMLElement {
    const spec: ThemedSelectSpec = { options, getValue, onChange };
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
    const currentVal = spec.getValue();
    const currentLabel =
      toEntries(spec.options).find(([, value]) => value === currentVal)?.[0] ??
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
    this.bind(trigger, spec);
    return trigger;
  }

  /** Builds the List / Card / Feed view selector and wires it to this popup. */
  public createViewStyleSelector(
    parent: HTMLElement,
    getStyle: () => string,
    onChange: (style: "list" | "card" | "feed") => void,
  ): HTMLElement {
    const style = getStyle();
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
    setIcon(
      selector.createDiv({ cls: "rss-dashboard-selector-icon" }),
      VIEW_STYLE_ICONS[style] || "list",
    );
    selector.createSpan({
      cls: "rss-dashboard-selector-text",
      text: viewStyleText(style),
    });
    selector.setAttribute("aria-valuetext", viewStyleText(style));
    setIcon(
      selector.createDiv({ cls: "rss-dashboard-selector-arrow" }),
      "chevron-down",
    );
    this.bind(selector, {
      options: VIEW_STYLE_OPTIONS,
      getValue: getStyle,
      onChange: (value) => onChange(value as "list" | "card" | "feed"),
      icons: VIEW_STYLE_ICONS,
      triggerText: (value) => viewStyleText(value),
    });
    return selector;
  }

  /** Wires click and keyboard handling onto an existing combobox trigger. */
  public bind(trigger: HTMLElement, spec: ThemedSelectSpec): void {
    trigger.onclick = (e) => {
      e.stopPropagation();
      trigger.focus();
      if (this.trigger === trigger) {
        this.close();
        return;
      }
      this.open(trigger, spec);
    };
    trigger.addEventListener("keydown", (e: KeyboardEvent) =>
      this.handleKeydown(trigger, spec, e),
    );
  }

  public contains(node: Node): boolean {
    return this.portal?.contains(node) ?? false;
  }

  public close(): void {
    if (this.cleanup) {
      this.cleanup();
      this.cleanup = null;
    }
    this.portal?.remove();
    this.portal = null;
    if (this.trigger) {
      this.trigger.setAttribute("aria-expanded", "false");
      this.trigger.removeAttribute("aria-controls");
      this.trigger.removeAttribute("aria-activedescendant");
      this.trigger.removeClass("active");
      this.trigger = null;
    }
    this.spec = null;
    this.options = [];
    this.activeIndex = -1;
  }

  private open(trigger: HTMLElement, spec: ThemedSelectSpec): void {
    this.close();
    const targetDocument = trigger.ownerDocument;
    const currentVal = spec.getValue();
    const portalId = `rss-dashboard-options-${++popupInstanceId}`;
    const portal = targetDocument.body.createDiv({
      cls: "rss-dashboard-filter-menu rss-dashboard-themed-menu-portal",
      attr: {
        id: portalId,
        role: "listbox",
        "aria-label": trigger.getAttribute("aria-label") ?? "Options",
      },
    });
    this.portal = portal;
    this.trigger = trigger;
    this.spec = spec;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", portalId);
    trigger.addClass("active");

    toEntries(spec.options).forEach(([label, value], index) => {
      const item = this.createOption(portal, portalId, index, label, value, {
        selected: value === currentVal,
        icon: spec.icons?.[value],
      });
      if (value === currentVal) this.activeIndex = index;
      item.onclick = () => {
        this.activeIndex = index;
        this.commit();
      };
      this.options.push(item);
    });
    if (this.activeIndex < 0 && this.options.length > 0) this.activeIndex = 0;
    this.setActive(this.activeIndex);

    this.position(trigger, portal);
    const targetWindow = targetDocument.defaultView || activeWindow;
    targetWindow.setTimeout(() => {
      // The popup may have closed (or been replaced) before this tick.
      if (this.portal !== portal) return;
      this.cleanup = this.host.addDocumentListener(
        targetDocument,
        "mousedown",
        (e: Event) => {
          if (
            !portal.contains(e.target as Node) &&
            !trigger.contains(e.target as Node)
          ) {
            this.close();
          }
        },
      );
    }, 0);
  }

  private createOption(
    portal: HTMLElement,
    portalId: string,
    index: number,
    label: string,
    value: string,
    state: { selected: boolean; icon?: string },
  ): HTMLElement {
    const item = portal.createDiv({
      cls: "rss-dashboard-filter-menu-item",
      attr: {
        id: `${portalId}-option-${index}`,
        role: "option",
        "aria-selected": String(state.selected),
        "data-value": value,
      },
    });
    const check = item.createDiv({ cls: "rss-dashboard-filter-menu-check" });
    if (state.selected) {
      setIcon(check, "check");
      item.addClass("is-active");
    }
    if (state.icon) {
      setIcon(
        item.createDiv({ cls: "rss-dashboard-filter-menu-icon" }),
        state.icon,
      );
    }
    item.createDiv({ text: label, cls: "rss-dashboard-filter-menu-text" });
    return item;
  }

  private handleKeydown(
    trigger: HTMLElement,
    spec: ThemedSelectSpec,
    e: KeyboardEvent,
  ): void {
    const isOpen = this.trigger === trigger;
    if (e.key === "Tab") {
      if (isOpen) this.close();
      return;
    }
    if (!isOpen) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        this.swallow(e);
        this.open(trigger, spec);
        if (e.key === "ArrowDown") this.moveActive(1);
        if (e.key === "ArrowUp") this.moveActive(-1);
      }
      return;
    }
    switch (e.key) {
      case "Escape":
        this.swallow(e);
        this.close();
        break;
      case "ArrowDown":
      case "ArrowUp":
        this.swallow(e);
        this.moveActive(e.key === "ArrowDown" ? 1 : -1);
        break;
      case "Home":
      case "End":
        this.swallow(e);
        this.setActive(e.key === "Home" ? 0 : this.options.length - 1);
        break;
      case "Enter":
      case " ":
        this.swallow(e);
        this.commit();
        break;
    }
  }

  /** Keeps a handled key from Obsidian's document-level handlers. */
  private swallow(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
  }

  private moveActive(delta: number): void {
    this.setActive(
      Math.max(0, Math.min(this.options.length - 1, this.activeIndex + delta)),
    );
  }

  private setActive(index: number): void {
    if (index < 0 || index >= this.options.length) return;
    this.options.forEach((option, optionIndex) => {
      option.classList.toggle("is-keyboard-active", optionIndex === index);
    });
    this.activeIndex = index;
    const activeOption = this.options[index];
    if (activeOption?.id) {
      this.trigger?.setAttribute("aria-activedescendant", activeOption.id);
    }
  }

  private commit(): void {
    const option = this.options[this.activeIndex];
    const spec = this.spec;
    const value = option?.getAttribute("data-value");
    if (!option || !spec || value === null || value === undefined) return;
    const label =
      option.querySelector(".rss-dashboard-filter-menu-text")?.textContent ??
      value;
    const text = spec.triggerText?.(value, label) ?? label;
    const trigger = this.trigger;
    const focusContext = this.captureFocus(trigger);
    const valueElement = trigger?.querySelector(
      ".rss-dashboard-themed-select-value, .rss-dashboard-selector-text",
    );

    spec.onChange(value);
    trigger?.setAttribute("aria-valuetext", text);
    valueElement?.setText(text);
    this.close();
    if (focusContext) this.restoreFocus(focusContext);
    void this.host.persistSettings();
  }

  /** Notes where the focused trigger sits so a re-render can hand focus back. */
  private captureFocus(trigger: HTMLElement | null): FocusContext | null {
    if (!trigger || trigger.ownerDocument.activeElement !== trigger)
      return null;
    const triggerLabel = trigger.getAttribute("aria-label");
    if (!triggerLabel) return null;
    for (const rootSelector of FOCUS_ROOT_SELECTORS) {
      const root = trigger.closest<HTMLElement>(rootSelector);
      if (!root) continue;
      const rootIndex = Array.from(
        trigger.ownerDocument.querySelectorAll<HTMLElement>(rootSelector),
      ).indexOf(root);
      if (rootIndex < 0) return null;
      return {
        targetDocument: trigger.ownerDocument,
        triggerLabel,
        rootSelector,
        rootIndex,
      };
    }
    return null;
  }

  private restoreFocus(context: FocusContext): void {
    const replacementRoot =
      context.targetDocument.querySelectorAll<HTMLElement>(
        context.rootSelector,
      )[context.rootIndex];
    if (!replacementRoot) return;
    const replacementTrigger = Array.from(
      replacementRoot.querySelectorAll<HTMLElement>('[role="combobox"]'),
    ).find(
      (candidate) =>
        candidate.getAttribute("aria-label") === context.triggerLabel,
    );
    replacementTrigger?.focus();
    if (context.targetDocument.activeElement !== replacementTrigger) {
      replacementRoot
        .querySelector<HTMLElement>(".rss-dashboard-hamburger-button")
        ?.focus();
    }
  }

  private position(trigger: HTMLElement, portal: HTMLElement): void {
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
}
