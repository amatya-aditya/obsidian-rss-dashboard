import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ArticleHeader } from "../../../src/components/article-header";
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

type HeaderCallbacks = ConstructorParameters<typeof ArticleHeader>[8];

const SELECTORS = [
  ".rss-dashboard-filter",
  ".rss-dashboard-sort",
  ".rss-dashboard-group",
  ".rss-dashboard-view-style-selector",
];

function press(el: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
  return event;
}

function options(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '.rss-dashboard-themed-menu-portal [role="option"]',
    ),
  );
}

describe("Themed select keyboard interaction (#850)", () => {
  let container: HTMLElement;
  let settings: RssDashboardSettings;
  let callbacks: ArticleHeaderMenuCallbacks & HeaderCallbacks;

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = createDiv();
    document.body.appendChild(container);
    settings = {
      sidebarCollapsed: false,
      viewStyle: "list",
      articleSort: "newest",
      articleGroupBy: "none",
      articleFilter: { type: "none", value: 0 },
      feeds: [],
      display: { cardColumnsPerRow: 0, cardSpacing: 15 },
      availableTags: [],
      media: { useDomainIconsRss: true },
    } as unknown as RssDashboardSettings;
    callbacks = {
      onToggleSidebar: vi.fn(),
      onSearch: vi.fn(),
      onSortChange: vi.fn(),
      onGroupChange: vi.fn(),
      onFilterChange: vi.fn(),
      onToggleViewStyle: vi.fn(),
      onPersistSettings: vi.fn(),
      onRefreshFeeds: vi.fn(),
      onMarkAllAsRead: vi.fn(),
      onMarkAllAsUnread: vi.fn(),
    } as unknown as ArticleHeaderMenuCallbacks & HeaderCallbacks;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  const hosts: Array<[string, () => { scope: HTMLElement; destroy(): void }]> =
    [
      [
        "ArticleHeader desktop controls",
        () => {
          const header = new ArticleHeader(
            container,
            settings,
            "Title",
            null,
            null,
            new Set(),
            new Set(),
            "OR",
            callbacks,
          );
          header.render();
          return {
            scope: container.querySelector<HTMLElement>(
              ".rss-dashboard-desktop-controls",
            )!,
            destroy: () => header.destroy(),
          };
        },
      ],
      [
        "ArticleHeaderMenu",
        () => {
          const menu = new ArticleHeaderMenu(settings, "", callbacks);
          menu.render(container);
          return { scope: container, destroy: () => menu.destroy() };
        },
      ],
    ];

  describe.each(hosts)("%s", (_name, mount) => {
    let scope: HTMLElement;
    let destroy: () => void;

    beforeEach(() => {
      ({ scope, destroy } = mount());
    });

    afterEach(() => destroy());

    const trigger = (selector: string) =>
      scope.querySelector<HTMLElement>(selector)!;

    it("exposes every selector as a named combobox with its choice and state", () => {
      SELECTORS.forEach((selector) => {
        const el = trigger(selector);
        expect(el.getAttribute("role")).toBe("combobox");
        expect(el.getAttribute("aria-label")).toBeTruthy();
        expect(el.getAttribute("aria-valuetext")).toBeTruthy();
        expect(el.getAttribute("aria-haspopup")).toBe("listbox");
        expect(el.getAttribute("aria-expanded")).toBe("false");
      });
    });

    it.each(["Enter", " ", "ArrowDown"])(
      "opens a listbox of options with %j and marks the current choice selected",
      (key) => {
        SELECTORS.forEach((selector) => {
          const el = trigger(selector);
          el.focus();
          press(el, key);
          expect(el.getAttribute("aria-expanded")).toBe("true");
          const listbox = document.getElementById(
            el.getAttribute("aria-controls") ?? "",
          );
          expect(listbox?.getAttribute("role")).toBe("listbox");
          const selected = options().filter(
            (o) => o.getAttribute("aria-selected") === "true",
          );
          expect(selected).toHaveLength(1);
          expect(el.ownerDocument.activeElement).toBe(el);
          press(el, "Escape");
        });
      },
    );

    it("moves the active option with arrows, Home and End and commits with Enter", () => {
      const sort = trigger(".rss-dashboard-group");
      sort.focus();
      press(sort, "Enter");
      const activeId = () => sort.getAttribute("aria-activedescendant");
      const all = options();

      press(sort, "End");
      expect(activeId()).toBe(all[all.length - 1].id);
      press(sort, "ArrowDown");
      expect(activeId()).toBe(all[all.length - 1].id);
      press(sort, "Home");
      expect(activeId()).toBe(all[0].id);
      press(sort, "ArrowDown");
      expect(activeId()).toBe(all[1].id);

      press(sort, "Enter");
      expect(callbacks.onGroupChange).toHaveBeenCalledWith("feed");
      expect(callbacks.onPersistSettings).toHaveBeenCalledTimes(1);
      expect(sort.getAttribute("aria-expanded")).toBe("false");
      expect(sort.getAttribute("aria-valuetext")).toBe("Feed");
      expect(options()).toHaveLength(0);
    });

    it("commits the view style with the same callback a click uses", () => {
      const selector = trigger(".rss-dashboard-view-style-selector");
      selector.focus();
      // ArrowDown on the closed trigger opens it and moves to the next option.
      press(selector, "ArrowDown");
      press(selector, "Enter");
      expect(callbacks.onToggleViewStyle).toHaveBeenCalledWith("card");
      expect(callbacks.onPersistSettings).toHaveBeenCalledTimes(1);
    });

    it("dismisses with Escape without committing and keeps focus on the trigger", () => {
      const sort = trigger(".rss-dashboard-sort");
      sort.focus();
      press(sort, "Enter");
      press(sort, "ArrowDown");
      press(sort, "Escape");

      expect(sort.getAttribute("aria-expanded")).toBe("false");
      expect(callbacks.onSortChange).not.toHaveBeenCalled();
      expect(callbacks.onPersistSettings).not.toHaveBeenCalled();
      expect(sort.ownerDocument.activeElement).toBe(sort);
      expect(options()).toHaveLength(0);
    });

    it("lets Tab leave an open selector without trapping it", () => {
      const sort = trigger(".rss-dashboard-sort");
      sort.focus();
      press(sort, "Enter");
      const tab = press(sort, "Tab");

      expect(tab.defaultPrevented).toBe(false);
      expect(sort.getAttribute("aria-expanded")).toBe("false");
      expect(options()).toHaveLength(0);
    });

    it("keeps handled selector keys from reaching document-level shortcuts", () => {
      const el = trigger(".rss-dashboard-filter");
      const documentKeydown = vi.fn();
      el.ownerDocument.addEventListener("keydown", documentKeydown);
      try {
        el.focus();
        for (const key of [
          "Enter",
          "ArrowDown",
          "End",
          "Home",
          "ArrowUp",
          "Escape",
          " ",
          "Enter",
        ]) {
          expect(press(el, key).defaultPrevented).toBe(true);
        }
        expect(documentKeydown).not.toHaveBeenCalled();
      } finally {
        el.ownerDocument.removeEventListener("keydown", documentKeydown);
      }
    });

    it("keeps pointer behavior: click opens, option click commits, trigger click closes", () => {
      const sort = trigger(".rss-dashboard-sort");
      sort.click();
      expect(sort.getAttribute("aria-expanded")).toBe("true");
      sort.click();
      expect(sort.getAttribute("aria-expanded")).toBe("false");

      sort.click();
      options()
        .find((o) => o.getAttribute("data-value") === "oldest")!
        .click();
      expect(callbacks.onSortChange).toHaveBeenCalledWith("oldest");
      expect(callbacks.onPersistSettings).toHaveBeenCalledTimes(1);
      expect(options()).toHaveLength(0);
    });

    it("closes an open selector on an outside click", async () => {
      const sort = trigger(".rss-dashboard-sort");
      sort.click();
      await new Promise((resolve) => window.setTimeout(resolve, 5));
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
      expect(sort.getAttribute("aria-expanded")).toBe("false");
      expect(options()).toHaveLength(0);
    });

    it("hands focus to the replacement selector after a commit re-renders the header", () => {
      callbacks.onSortChange = vi.fn(() => {
        destroy();
        container.empty();
        ({ scope, destroy } = mount());
      });
      const sort = trigger(".rss-dashboard-sort");
      sort.focus();
      press(sort, "Enter");
      press(sort, "ArrowDown");
      press(sort, "Enter");

      const replacement = trigger(".rss-dashboard-sort");
      expect(replacement).not.toBe(sort);
      expect(replacement.ownerDocument.activeElement).toBe(replacement);
    });
  });

  it("opens the popup in the trigger's own document (popout window)", () => {
    const popout = document.implementation.createHTMLDocument("popout");
    const host = popout.body.createDiv();
    const menu = new ArticleHeaderMenu(settings, "", callbacks);
    menu.render(host);
    const sort = host.querySelector<HTMLElement>(".rss-dashboard-sort")!;

    press(sort, "Enter");

    expect(
      popout.querySelectorAll(".rss-dashboard-themed-menu-portal"),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll(".rss-dashboard-themed-menu-portal"),
    ).toHaveLength(0);
    menu.destroy();
  });

  it("renders no native select in the header", () => {
    const header = new ArticleHeader(
      container,
      settings,
      "Title",
      null,
      null,
      new Set(),
      new Set(),
      "OR",
      callbacks,
    );
    header.render();
    expect(container.querySelectorAll("select")).toHaveLength(0);
    header.destroy();
  });
});
