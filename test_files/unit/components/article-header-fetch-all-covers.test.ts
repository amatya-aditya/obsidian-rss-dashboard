// The header's "fetch all covers" button (#1702): where it sits, when it is
// offered, and the three states it shows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArticleHeader } from "../../../src/components/article-header";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type HeaderSettings = ConstructorParameters<typeof ArticleHeader>[1];
type HeaderCallbacks = ConstructorParameters<typeof ArticleHeader>[8];
type FetchAllState = "idle" | "disabled" | "running";

const BUTTON = ".rss-dashboard-fetch-all-covers-button";
const IDLE_LABEL = "Fetch cover images for all cards on this page";
const RUNNING_LABEL = "Cancel fetching cover images";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

function buildSettings(
  display: Record<string, unknown> = {},
  viewStyle: "list" | "card" | "feed" = "card",
): HeaderSettings {
  return {
    sidebarCollapsed: false,
    viewStyle,
    articleSort: "newest",
    articleGroupBy: "none",
    articleFilter: { value: 0 },
    feeds: [],
    display: {
      mobileShowListToolbar: true,
      mobileListToolbarStyle: "minimal",
      cardColumnsPerRow: 0,
      cardSpacing: 15,
      showCoverImage: true,
      showFetchAllCoversButton: true,
      ...display,
    },
    availableTags: [],
    media: { useDomainIconsRss: true },
  } as unknown as HeaderSettings;
}

describe("ArticleHeader fetch-all-covers button (#1702)", () => {
  let container: HTMLElement;
  let state: FetchAllState;
  let onFetchAllCovers: ReturnType<typeof vi.fn>;
  let callbacks: HeaderCallbacks;

  beforeEach(() => {
    installObsidianDomPolyfills();
    container = createDiv();
    document.body.appendChild(container);
    state = "idle";
    onFetchAllCovers = vi.fn();
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
      onShowShortcuts: vi.fn(),
      onFetchAllCovers,
      getFetchAllCoversState: () => state,
    } as unknown as HeaderCallbacks;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  function renderHeader(settings: HeaderSettings): ArticleHeader {
    const header = new ArticleHeader(
      container,
      settings,
      "All articles",
      null,
      null,
      new Set(),
      new Set(),
      "OR",
      callbacks,
    );
    header.render();
    return header;
  }

  function button(): HTMLButtonElement | null {
    return container.querySelector<HTMLButtonElement>(BUTTON);
  }

  it("sits at the left of the header's button row with the download icon", () => {
    renderHeader(buildSettings());

    const fetchAll = button();
    expect(fetchAll).not.toBeNull();
    expect(fetchAll?.tagName).toBe("BUTTON");
    expect(fetchAll?.getAttribute("type")).toBe("button");
    expect(fetchAll?.getAttribute("aria-label")).toBe(IDLE_LABEL);
    expect(fetchAll?.getAttribute("data-rss-action")).toBe("fetch-all-covers");
    expect(fetchAll?.querySelector("svg")).not.toBeNull();
    // Left of the filter button, which sits left of the hamburger menu.
    expect(fetchAll?.nextElementSibling?.className).toContain(
      "rss-dashboard-mobile-filter-button",
    );
    const row = container.querySelector(".rss-dashboard-header-right");
    expect(
      Array.from(row?.children ?? []).map((child) => child.className),
    ).toEqual([
      expect.stringContaining("rss-dashboard-fetch-all-covers-button"),
      expect.stringContaining("rss-dashboard-mobile-filter-button"),
      expect.stringContaining("rss-dashboard-hamburger-menu"),
    ]);
  });

  it.each(["card", "feed"] as const)("is offered in the %s view", (view) => {
    renderHeader(buildSettings({}, view));

    expect(button()).not.toBeNull();
  });

  it("is not offered in the list view, which renders no cover images", () => {
    renderHeader(buildSettings({}, "list"));

    expect(button()).toBeNull();
  });

  it("is not offered while cover images are hidden", () => {
    renderHeader(buildSettings({ showCoverImage: false }));

    expect(button()).toBeNull();
  });

  it("is not offered when the Display setting turns it off", () => {
    renderHeader(buildSettings({ showFetchAllCoversButton: false }));

    expect(button()).toBeNull();
  });

  it("is not offered when the dashboard supplies no handler", () => {
    delete (callbacks as { onFetchAllCovers?: unknown }).onFetchAllCovers;

    renderHeader(buildSettings());

    expect(button()).toBeNull();
  });

  it("runs the action when it is pressed", () => {
    renderHeader(buildSettings());

    button()?.click();

    expect(onFetchAllCovers).toHaveBeenCalledTimes(1);
  });

  it("looks unavailable when no card needs a cover, yet still hands a press to the dashboard", () => {
    state = "disabled";
    renderHeader(buildSettings());

    const fetchAll = button();
    expect(fetchAll?.getAttribute("aria-disabled")).toBe("true");
    expect(fetchAll?.getAttribute("aria-label")).toBe(
      "No cards on this page need a cover image",
    );
    // The look can be stale, so the dashboard re-checks the page on every press.
    fetchAll?.click();
    expect(onFetchAllCovers).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner and a cancel tooltip while a run is active", () => {
    state = "running";
    renderHeader(buildSettings());

    const fetchAll = button();
    expect(fetchAll?.classList.contains("is-running")).toBe(true);
    expect(fetchAll?.getAttribute("aria-label")).toBe(RUNNING_LABEL);
    expect(fetchAll?.getAttribute("aria-busy")).toBe("true");
    expect(fetchAll?.getAttribute("aria-disabled")).toBeNull();
    fetchAll?.click();
    expect(onFetchAllCovers).toHaveBeenCalledTimes(1);
  });

  it("shows a cancel as registered while the started fetches finish", () => {
    const header = renderHeader(buildSettings());

    header.setFetchAllCoversState("stopping");

    const fetchAll = button();
    expect(fetchAll?.getAttribute("aria-label")).toBe(
      "Stopping after the fetches already started",
    );
    expect(fetchAll?.classList.contains("is-running")).toBe(true);
    expect(fetchAll?.getAttribute("aria-busy")).toBe("true");
  });

  it("keeps its icon, and so its spinning, when the state has not changed", () => {
    const header = renderHeader(buildSettings());

    header.setFetchAllCoversState("running");
    const spinner = button()?.querySelector("svg");
    header.setFetchAllCoversState("running");
    header.setFetchAllCoversState("running");

    expect(button()?.querySelector("svg")).toBe(spinner);

    header.setFetchAllCoversState("stopping");
    expect(button()?.querySelector("svg")).toBe(spinner);
  });

  it("moves between its states in place, without a re-render", () => {
    const header = renderHeader(buildSettings());
    const fetchAll = button();

    header.setFetchAllCoversState("running");
    expect(button()).toBe(fetchAll);
    expect(fetchAll?.getAttribute("aria-label")).toBe(RUNNING_LABEL);
    expect(fetchAll?.classList.contains("is-running")).toBe(true);

    header.setFetchAllCoversState("disabled");
    expect(fetchAll?.classList.contains("is-running")).toBe(false);
    expect(fetchAll?.getAttribute("aria-busy")).toBeNull();
    expect(fetchAll?.getAttribute("aria-disabled")).toBe("true");

    header.setFetchAllCoversState("idle");
    expect(fetchAll?.getAttribute("aria-label")).toBe(IDLE_LABEL);
    expect(fetchAll?.getAttribute("aria-disabled")).toBeNull();
  });
});
