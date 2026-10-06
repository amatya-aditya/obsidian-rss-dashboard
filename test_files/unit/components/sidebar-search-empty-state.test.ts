import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const SEARCH_DEBOUNCE_MS = 150;

describe("Sidebar search empty state", () => {
  let container: HTMLElement;
  let sidebar: Sidebar;

  beforeEach(() => {
    // Fake timers drive the search input's debounce and the focus frame.
    vi.useFakeTimers();
    container = createDiv();
    document.body.appendChild(container);

    const settings = {
      feeds: [
        {
          title: "Tech News",
          url: "https://example.com/tech",
          folder: "Reading",
          items: [],
        },
        {
          title: "Cooking Daily",
          url: "https://example.com/cooking",
          folder: "",
          items: [],
        },
      ],
      folders: [{ name: "Reading", subfolders: [] }],
      display: {
        sidebarRowSpacing: 10,
        sidebarRowIndentation: 20,
        sidebarItemPaddingLeft: 2,
        sidebarItemPaddingRight: 2,
      },
      media: { useDomainIconsRss: false },
      availableTags: [],
    } as unknown as RssDashboardSettings;

    const options: SidebarOptions = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
    };

    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onToggleSidebar: vi.fn(),
    } as unknown as SidebarCallbacks;

    const plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };

    sidebar = new Sidebar(
      ObsidianStubs.App.createMock() as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();
  });

  afterEach(() => {
    sidebar.destroy();
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const openSearch = (): HTMLInputElement => {
    container.querySelector<HTMLElement>('[aria-label="Search"]')?.click();
    const input = container.querySelector<HTMLInputElement>(
      ".rss-dashboard-search-input",
    );
    if (!input) throw new Error("search input did not render");
    return input;
  };

  const typeQuery = (input: HTMLInputElement, value: string): void => {
    input.value = value;
    input.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  };

  const emptyState = (): HTMLElement | null =>
    container.querySelector<HTMLElement>(".rss-dashboard-search-empty-state");

  const visibleFeedTitles = (): string[] =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-feed:not(.rss-dashboard-search-hidden)",
      ),
    ).map((el) => el.dataset.feedTitle ?? "");

  it("tells the user nothing matched when a search finds no feeds or folders", () => {
    typeQuery(openSearch(), "zzz-no-such-feed");

    const message = emptyState();
    expect(message).not.toBeNull();
    expect(message?.textContent).toContain("0 results");
    expect(message?.textContent).toContain("No matches found.");
    expect(visibleFeedTitles()).toEqual([]);
  });

  it("announces the zero-results message to assistive technology", () => {
    typeQuery(openSearch(), "zzz-no-such-feed");

    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain("No matches found.");
  });

  it("shows matching feeds without a zero-results message", () => {
    typeQuery(openSearch(), "tech");

    expect(emptyState()).toBeNull();
    expect(visibleFeedTitles()).toEqual(["Tech News"]);
  });

  it("does not report zero results when only a folder name matches", () => {
    sidebar.destroy();
    container.empty();
    // A folder with no feeds still counts as a search result.
    const settings = (sidebar as unknown as { settings: RssDashboardSettings })
      .settings;
    settings.folders.push({ name: "Empty Archive", subfolders: [] });
    sidebar.render();

    typeQuery(openSearch(), "archive");

    expect(emptyState()).toBeNull();
  });

  describe("with the Tags section open", () => {
    beforeEach(() => {
      sidebar.destroy();
      container.empty();
      const internals = sidebar as unknown as {
        settings: RssDashboardSettings;
        isTagsExpanded: boolean;
      };
      internals.settings.availableTags = [{ name: "news", color: "#f00" }];
      internals.isTagsExpanded = true;
      sidebar.render();
    });

    it("does not report zero results when a tag: query matches an existing tag", () => {
      typeQuery(openSearch(), "tag:news");

      expect(
        container.querySelector(".rss-dashboard-sidebar-tag-label")
          ?.textContent,
      ).toBe("news");
      expect(emptyState()).toBeNull();
    });

    it("reports zero results when a tag: query matches no tag", () => {
      typeQuery(openSearch(), "tag:zzz-no-such-tag");

      expect(emptyState()).not.toBeNull();
    });
  });

  it("removes the message when the query is edited to match again", () => {
    const input = openSearch();
    typeQuery(input, "zzz-no-such-feed");
    typeQuery(input, "cooking");

    expect(emptyState()).toBeNull();
    expect(visibleFeedTitles()).toEqual(["Cooking Daily"]);
  });

  it("restores the full sidebar when the search is cleared", () => {
    const input = openSearch();
    typeQuery(input, "zzz-no-such-feed");

    container
      .querySelector<HTMLElement>(".rss-dashboard-search-clear")
      ?.click();

    expect(emptyState()).toBeNull();
    expect(visibleFeedTitles().sort()).toEqual(["Cooking Daily", "Tech News"]);
    expect(
      container.querySelector(
        ".rss-dashboard-all-feeds-button.rss-dashboard-search-hidden",
      ),
    ).toBeNull();
  });

  it("restores the full sidebar when the search is closed", () => {
    typeQuery(openSearch(), "zzz-no-such-feed");

    container.querySelector<HTMLElement>('[aria-label="Search"]')?.click();

    expect(container.querySelector(".rss-dashboard-search-input")).toBeNull();
    expect(emptyState()).toBeNull();
    expect(visibleFeedTitles().sort()).toEqual(["Cooking Daily", "Tech News"]);
  });
});
