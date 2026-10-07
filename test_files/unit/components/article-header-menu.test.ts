import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ArticleHeaderMenu,
  type ArticleHeaderMenuCallbacks,
} from "../../../src/components/article-header-menu";
import type { RssDashboardSettings } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

describe("ArticleHeaderMenu Component", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let callbacks: ArticleHeaderMenuCallbacks;

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = createDiv();
    document.body.appendChild(container);

    settings = {
      viewStyle: "list",
      articleSort: "newest",
      articleGroupBy: "none",
      articleFilter: { type: "none", value: 0 },
      display: {
        cardColumnsPerRow: 0,
        cardSpacing: 15,
      },
    } as unknown as RssDashboardSettings;

    callbacks = {
      onSearch: vi.fn(),
      onSortChange: vi.fn(),
      onGroupChange: vi.fn(),
      onFilterChange: vi.fn(),
      onToggleViewStyle: vi.fn(),
      onPersistSettings: vi.fn(),
      onRefreshFeeds: vi.fn(),
      onMarkAllAsRead: vi.fn(),
      onMarkAllAsUnread: vi.fn(),
    } satisfies ArticleHeaderMenuCallbacks;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("renders the hamburger trigger and dropdown structure", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);

    menu.render(container);

    expect(
      container.querySelector(".rss-dashboard-hamburger-button"),
    ).not.toBeNull();
    expect(
      container.querySelector(".rss-dashboard-dropdown-menu"),
    ).not.toBeNull();
  });

  it("associates the visible Card spacing label with its range control", () => {
    settings.viewStyle = "card";
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);

    const spacingInput = container.querySelector<HTMLInputElement>(
      ".rss-dashboard-dropdown-card-spacing-input",
    );

    const spacingLabel = container.querySelector<HTMLElement>(
      ".rss-dashboard-dropdown-card-spacing-group .rss-dashboard-dropdown-card-layout-label",
    );

    expect(spacingLabel?.textContent).toContain("Card spacing: 15px");
    expect(spacingLabel?.id).toBe("rss-dashboard-card-spacing-label");
    expect(spacingInput?.getAttribute("aria-labelledby")).toBe(
      "rss-dashboard-card-spacing-label",
    );
    expect(spacingInput?.value).toBe("15");
    expect(spacingInput?.min).toBe("0");
    expect(spacingInput?.max).toBe("40");
  });

  it("gives the refresh button an accessible name and preserves its action", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);

    const refreshButton = container.querySelector<HTMLButtonElement>(
      ".rss-dashboard-view-refresh-button",
    );
    expect(refreshButton?.getAttribute("aria-label")).toBe("Refresh feeds");
    refreshButton?.click();
    expect(callbacks.onRefreshFeeds).toHaveBeenCalledOnce();
  });

  it("toggles is-menu-open classes on button and dropdown", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);

    menu.render(container);

    const button = container.querySelector(
      ".rss-dashboard-hamburger-button",
    ) as HTMLElement;
    const dropdown = container.querySelector(
      ".rss-dashboard-dropdown-menu",
    ) as HTMLElement;

    button.click();
    expect(button.classList.contains("is-menu-open")).toBe(true);
    expect(dropdown.classList.contains("is-menu-open")).toBe(true);

    button.click();
    expect(button.classList.contains("is-menu-open")).toBe(false);
    expect(dropdown.classList.contains("is-menu-open")).toBe(false);
  });

  it("focusSearch opens the closed menu and focuses its search input", async () => {
    const menu = new ArticleHeaderMenu(settings, "query", callbacks);
    menu.render(container);
    const dropdown = container.querySelector(
      ".rss-dashboard-dropdown-menu",
    ) as HTMLElement;
    const input = container.querySelector(
      ".rss-dashboard-article-search-input",
    ) as HTMLInputElement;
    expect(dropdown.classList.contains("is-menu-open")).toBe(false);

    await expect(menu.focusSearch()).resolves.toBe(true);

    expect(dropdown.classList.contains("is-menu-open")).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(5);
  });

  describe("focusSearch while the opening menu refuses focus", () => {
    let frames: FrameRequestCallback[];

    beforeEach(() => {
      frames = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        frames.push(cb);
        return frames.length;
      });
    });

    function renderMenu(query: string) {
      const menu = new ArticleHeaderMenu(settings, query, callbacks);
      menu.render(container);
      const input = container.querySelector(
        ".rss-dashboard-article-search-input",
      ) as HTMLInputElement;
      return { menu, input };
    }

    it("retries on animation frames and resolves true once focus lands", async () => {
      const { menu, input } = renderMenu("query");
      const realFocus = input.focus.bind(input);
      let refusals = 2;
      vi.spyOn(input, "focus").mockImplementation(() => {
        if (refusals-- > 0) return;
        realFocus();
      });

      const result = menu.focusSearch();
      expect(document.activeElement).not.toBe(input);
      frames.shift()?.(0);
      expect(document.activeElement).not.toBe(input);
      frames.shift()?.(0);

      await expect(result).resolves.toBe(true);
      expect(document.activeElement).toBe(input);
      expect(input.selectionEnd).toBe(5);
      expect(frames).toHaveLength(0);
    });

    it("resolves false after a bounded number of frames", async () => {
      const { menu, input } = renderMenu("");
      vi.spyOn(input, "focus").mockImplementation(() => {});

      const result = menu.focusSearch();
      for (let i = 0; i < 50 && frames.length > 0; i++) frames.shift()?.(0);

      await expect(result).resolves.toBe(false);
      expect(window.requestAnimationFrame).toHaveBeenCalledTimes(10);
    });

    it("resolves false and stops retrying when a re-render detaches the input", async () => {
      const { menu, input } = renderMenu("");
      vi.spyOn(input, "focus").mockImplementation(() => {});

      const result = menu.focusSearch();
      input.remove();
      frames.shift()?.(0);

      await expect(result).resolves.toBe(false);
      expect(frames).toHaveLength(0);
    });
  });

  it("focusSearch keeps an already open menu open", async () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    (
      container.querySelector(".rss-dashboard-hamburger-button") as HTMLElement
    ).click();

    await menu.focusSearch();

    expect(
      container
        .querySelector(".rss-dashboard-dropdown-menu")
        ?.classList.contains("is-menu-open"),
    ).toBe(true);
  });

  it("focusSearch resolves false before the menu is rendered", async () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);

    await expect(menu.focusSearch()).resolves.toBe(false);
  });

  it("keeps handled selector keys from reaching document-level shortcuts", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const trigger = container.querySelector<HTMLElement>(
      ".rss-dashboard-filter",
    )!;
    const documentKeydown = vi.fn();
    trigger.ownerDocument.addEventListener("keydown", documentKeydown);

    try {
      trigger.focus();
      for (const key of ["Enter", "ArrowDown", "ArrowDown", "Escape"]) {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        });
        trigger.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }

      for (const key of ["Enter", "ArrowDown", "Enter"]) {
        const event = new KeyboardEvent("keydown", {
          key,
          bubbles: true,
          cancelable: true,
        });
        trigger.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
      }

      expect(documentKeydown).not.toHaveBeenCalled();
    } finally {
      trigger.ownerDocument.removeEventListener("keydown", documentKeydown);
    }
  });

  it("restores focus to the replacement selector after a keyboard commit rerenders the menu", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    callbacks.onFilterChange = vi.fn(() => {
      container.empty();
      menu.render(container);
    });
    menu.render(container);
    const trigger = container.querySelector<HTMLElement>(
      ".rss-dashboard-filter",
    )!;

    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    const replacementTrigger = container.querySelector<HTMLElement>(
      ".rss-dashboard-filter",
    )!;
    expect(replacementTrigger).not.toBe(trigger);
    expect(trigger.ownerDocument.activeElement).toBe(replacementTrigger);
  });

  it("returns focus to the menu button when a rerender hides the committed selector", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    callbacks.onFilterChange = vi.fn(() => {
      container.empty();
      menu.render(container);
      // jsdom allows focus in visibility-hidden content, so simulate the browser refusing it.
      const replacementTrigger = container.querySelector<HTMLElement>(
        ".rss-dashboard-filter",
      )!;
      vi.spyOn(replacementTrigger, "focus").mockImplementation(() => {});
    });
    menu.render(container);
    const trigger = container.querySelector<HTMLElement>(
      ".rss-dashboard-filter",
    )!;

    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    const menuButton = container.querySelector<HTMLElement>(
      ".rss-dashboard-hamburger-button",
    )!;
    expect(trigger.ownerDocument.activeElement).toBe(menuButton);
  });

  it("opens and closes the menu with keyboard activation and exposes its state", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const button = container.querySelector(
      ".rss-dashboard-hamburger-button",
    ) as HTMLElement;

    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    // jsdom does not synthesize the native button click that a browser emits for keyboard activation.
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.ownerDocument.activeElement).toBe(button);

    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("allows Tab through the menu and closes it after focus leaves", async () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const button = container.querySelector(
      ".rss-dashboard-hamburger-button",
    ) as HTMLElement;
    button.focus();
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    button.click();

    const firstTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(firstTab);
    expect(firstTab.defaultPrevented).toBe(false);
    expect(button.getAttribute("aria-expanded")).toBe("true");

    const lastButton = container.querySelector(
      ".rss-dashboard-mark-all-buttons-row .rss-dashboard-mark-all-button:last-child",
    ) as HTMLElement;
    lastButton.focus();
    const leavingTab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    lastButton.dispatchEvent(leavingTab);
    expect(leavingTab.defaultPrevented).toBe(false);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes the open hamburger menu with Escape and restores focus", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const button = container.querySelector<HTMLElement>(
      ".rss-dashboard-hamburger-button",
    )!;
    button.click();

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(
      container
        .querySelector(".rss-dashboard-dropdown-menu")
        ?.classList.contains("is-menu-open"),
    ).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it("closes an open selector before closing the hamburger menu on a second Escape", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const button = container.querySelector<HTMLElement>(
      ".rss-dashboard-hamburger-button",
    )!;
    const trigger = container.querySelector<HTMLElement>(
      ".rss-dashboard-filter",
    )!;
    button.click();
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );

    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-expanded")).toBe("true");

    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
  });

  it("opens a themed selector, moves among choices, and commits with Enter", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const trigger = container.querySelector(
      ".rss-dashboard-filter",
    ) as HTMLElement;

    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-valuetext")).toBe("All");

    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    const activeOption = document.getElementById(
      trigger.getAttribute("aria-activedescendant") ?? "",
    );
    expect(activeOption?.getAttribute("role")).toBe("option");
    expect(trigger.ownerDocument.activeElement).toBe(trigger);

    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(callbacks.onFilterChange).toHaveBeenCalledWith({
      type: "age",
      value: 3600000,
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.ownerDocument.activeElement).toBe(trigger);
  });

  it("supports keyboard selection on every ArticleHeaderMenu selector", () => {
    settings.viewStyle = "card";
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const selectors = [
      ".rss-dashboard-filter",
      ".rss-dashboard-sort",
      ".rss-dashboard-group",
      ".rss-dashboard-view-style-selector",
      ".rss-dashboard-dropdown-cards-per-row-trigger",
    ];

    selectors.forEach((selector) => {
      const trigger = container.querySelector<HTMLElement>(selector)!;
      trigger.focus();
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(trigger.ownerDocument.activeElement).toBe(trigger);
    });

    expect(callbacks.onFilterChange).toHaveBeenCalledWith({
      type: "age",
      value: 3600000,
    });
    expect(callbacks.onSortChange).toHaveBeenCalledWith("oldest");
    expect(callbacks.onGroupChange).toHaveBeenCalledWith("feed");
    expect(callbacks.onToggleViewStyle).toHaveBeenCalledWith("feed");
    expect(callbacks.onFilterChange).toHaveBeenCalledWith({
      type: "batch",
      value: null,
      batch: { cardColumnsPerRow: 1 },
    });
    expect(callbacks.onPersistSettings).toHaveBeenCalledTimes(selectors.length);
  });

  it("keeps pointer selection available and announces the committed choice", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const trigger = container.querySelector(
      ".rss-dashboard-filter",
    ) as HTMLElement;

    trigger.click();
    const option = document.querySelector(
      '.rss-dashboard-filter-menu-item[data-value="3600000"]',
    ) as HTMLElement;
    option.click();

    expect(callbacks.onFilterChange).toHaveBeenCalledWith({
      type: "age",
      value: 3600000,
    });
    expect(callbacks.onPersistSettings).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-valuetext")).toBe("1 hour");
  });

  it("cancels a themed selector with Escape and leaves Tab untrapped", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const trigger = container.querySelector(
      ".rss-dashboard-sort",
    ) as HTMLElement;

    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(callbacks.onSortChange).not.toHaveBeenCalled();
    expect(trigger.ownerDocument.activeElement).toBe(trigger);

    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    trigger.dispatchEvent(tab);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(tab.defaultPrevented).toBe(false);
  });

  it("gives every custom selector an accessible name, choice, and open state", () => {
    settings.viewStyle = "card";
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(container);
    const triggers = container.querySelectorAll<HTMLElement>(
      ".rss-dashboard-themed-select-trigger, .rss-dashboard-view-style-selector",
    );

    expect(triggers.length).toBe(5);
    triggers.forEach((trigger) => {
      expect(trigger.getAttribute("role")).toBe("combobox");
      expect(trigger.getAttribute("aria-label")).toBeTruthy();
      expect(trigger.getAttribute("aria-valuetext")).toBeTruthy();
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });
  });

  it("renders card layout controls only for card view", () => {
    const listMenu = new ArticleHeaderMenu(settings, "", callbacks);
    listMenu.render(container);
    expect(container.textContent).not.toContain("Cards / row:");
    listMenu.destroy();
    container.empty();

    settings.viewStyle = "card";

    const cardMenu = new ArticleHeaderMenu(settings, "", callbacks);
    cardMenu.render(container);

    expect(container.textContent).toContain("Cards / row:");
    expect(container.textContent).toContain("Card spacing: 15px");
  });

  it("forwards refresh and mark-all actions unchanged", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);

    menu.render(container);
    const button = container.querySelector(
      ".rss-dashboard-hamburger-button",
    ) as HTMLElement;
    button.click();

    (
      container.querySelector(
        ".rss-dashboard-view-refresh-button",
      ) as HTMLButtonElement
    ).click();
    (
      container.querySelector(".rss-dashboard-mark-read") as HTMLButtonElement
    ).click();
    (
      container.querySelectorAll(
        ".rss-dashboard-mark-all-button",
      )[1] as HTMLButtonElement
    ).click();

    expect(callbacks.onRefreshFeeds).toHaveBeenCalledTimes(1);
    expect(callbacks.onMarkAllAsRead).toHaveBeenCalledTimes(1);
    expect(callbacks.onMarkAllAsUnread).toHaveBeenCalledTimes(1);
  });

  it("emits live and commit events for card spacing changes", () => {
    settings.viewStyle = "card";
    const menu = new ArticleHeaderMenu(settings, "", callbacks);

    menu.render(container);
    const button = container.querySelector(
      ".rss-dashboard-hamburger-button",
    ) as HTMLElement;
    button.click();

    const spacingInput = container.querySelector(
      ".rss-dashboard-dropdown-card-spacing-input",
    ) as HTMLInputElement;
    spacingInput.value = "23";
    spacingInput.dispatchEvent(new Event("input", { bubbles: true }));
    spacingInput.dispatchEvent(new Event("change", { bubbles: true }));

    expect(callbacks.onFilterChange).toHaveBeenCalledWith({
      type: "card-spacing-live",
      value: 23,
    });
    expect(callbacks.onFilterChange).toHaveBeenCalledWith({
      type: "card-spacing-commit",
      value: 23,
    });
  });

  it("closes cleanly and removes outside-click handling on destroy", () => {
    const menu = new ArticleHeaderMenu(settings, "", callbacks);

    menu.render(container);
    const button = container.querySelector(
      ".rss-dashboard-hamburger-button",
    ) as HTMLElement;
    const dropdown = container.querySelector(
      ".rss-dashboard-dropdown-menu",
    ) as HTMLElement;

    button.click();
    expect(dropdown.classList.contains("is-menu-open")).toBe(true);

    menu.destroy();

    expect(dropdown.classList.contains("is-menu-open")).toBe(false);
    expect(button.classList.contains("is-menu-open")).toBe(false);

    document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));

    expect(dropdown.classList.contains("is-menu-open")).toBe(false);
  });
});
