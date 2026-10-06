import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Sidebar,
  type SidebarCallbacks,
  type SidebarOptions,
} from "../../../src/components/sidebar";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
  type Tag,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { App } from "../../stubs/obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const SEARCH_DEBOUNCE_MS = 150;
const tag = (name: string): Tag => ({ name, color: "#6699cc" });
const article = (name: string, tags: string[] = []): FeedItem => ({
  title: name,
  link: `https://example.com/articles/${encodeURIComponent(name)}`,
  description: name,
  content: name,
  pubDate: "2026-01-01",
  guid: name,
  feedTitle: "",
  feedUrl: "",
  coverImage: "",
  tags: tags.map(tag),
});
const feed = (title: string, folder: string, items: FeedItem[]): Feed => ({
  title,
  url: `https://example.com/feeds/${encodeURIComponent(title)}`,
  folder,
  items,
  lastUpdated: 0,
});

describe("Sidebar tag search", () => {
  let container: HTMLElement;
  let sidebar: Sidebar;
  let settings: RssDashboardSettings;

  beforeEach(() => {
    // Drive the debounce and focus frames without waiting for real time.
    vi.useFakeTimers();
    container = createDiv();
    document.body.appendChild(container);
    settings = {
      ...DEFAULT_SETTINGS,
      display: { ...DEFAULT_SETTINGS.display, useDomainIconsRss: false },
      media: { ...DEFAULT_SETTINGS.media },
      feeds: [
        feed("Nested feed", "Reading/Deep", [
          article("Untagged first article"),
          article("Tagged later article", ["News", "Saved"]),
        ]),
        feed("Root feed", "", [article("Read later", ["saved/later"])]),
        feed("Sibling feed", "Reading/Sibling", [article("News", ["News"])]),
        feed("Saved title only", "", [article("Unrelated", ["News"])]),
        feed("Content only", "", [article("Saved", ["News"])]),
        feed("Substring feed", "", [article("Other", ["Unsaved"])]),
        feed("Literal feed", "", [article("Other", ["Sa*ved"])]),
        feed("A feed", "", [article("Other", ["A"])]),
        feed("About feed", "", [article("Other", ["About"])]),
      ],
      folders: [
        {
          name: "Reading",
          subfolders: [
            { name: "Deep", subfolders: [] },
            { name: "Sibling", subfolders: [] },
          ],
        },
        { name: "Saved archive", subfolders: [] },
      ],
      collapsedFolders: ["Reading", "Reading/Deep"],
      availableTags: [
        "Saved",
        "saved/later",
        "Unsaved",
        "News",
        "Sa*ved",
        "A",
        "About",
        "Orphan",
      ].map(tag),
    };
    const options: SidebarOptions = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [...settings.collapsedFolders],
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
      App.createMock() as unknown as import("obsidian").App,
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
    document.body.empty();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const button = (label: string): HTMLElement => {
    const element = container.querySelector<HTMLElement>(
      `[aria-label="${label}"]`,
    );
    if (!element) throw new Error(`${label} button did not render`);
    return element;
  };
  const input = (): HTMLInputElement => {
    const element = container.querySelector<HTMLInputElement>(
      ".rss-dashboard-search-input",
    );
    if (!element) throw new Error("Search input did not render");
    return element;
  };
  const openSearch = (): void => {
    button("Search").click();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  };
  const typeQuery = (query: string): void => {
    input().value = query;
    input().dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  };
  const clearSearch = (): void => {
    const clear = container.querySelector<HTMLElement>(
      ".rss-dashboard-search-clear",
    );
    if (!clear) throw new Error("Search clear button did not render");
    clear.click();
  };
  const visibleFeeds = (): string[] =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-feed:not(.rss-dashboard-search-hidden)",
      ),
      (element) => element.dataset.feedTitle ?? "",
    ).sort();
  const visibleTags = (): string[] =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-sidebar-tag-row:not(.rss-dashboard-search-hidden)",
      ),
      (element) =>
        element.querySelector(".rss-dashboard-sidebar-tag-label")
          ?.textContent ?? "",
    ).sort();
  const visibleFolders = (): string[] =>
    Array.from(
      container.querySelectorAll<HTMLElement>(
        ".rss-dashboard-feed-folder-header:not(.rss-dashboard-search-hidden)",
      ),
      (element) => element.dataset.folderPath ?? "",
    ).sort();
  const tagsSection = (): HTMLElement | null =>
    container.querySelector(".rss-dashboard-sidebar-tags-section");
  const emptyState = (): HTMLElement | null =>
    container.querySelector(".rss-dashboard-search-empty-state");
  const searchStatus = (): HTMLElement | null =>
    container.querySelector('[role="status"][aria-live="polite"]');
  const folderHeader = (path: string): HTMLElement | null =>
    container.querySelector(
      `.rss-dashboard-feed-folder-header[data-folder-path="${path}"]`,
    );

  it.each(["tag:Saved", "tag:#Saved", "TAG:#sAvEd"])(
    "%s reveals matching tag rows and feeds with any matching article tag",
    (query) => {
      expect(tagsSection()).toBeNull();
      openSearch();
      typeQuery(query);

      expect(visibleTags()).toEqual(["Saved", "saved/later"]);
      expect(visibleFeeds()).toEqual(["Nested feed", "Root feed"]);
      expect(emptyState()).toBeNull();
      expect(button("Tags").getAttribute("aria-pressed")).toBe("true");
    },
  );

  it("honors the preference to hide feeds with no unread articles during tag search", () => {
    settings.display.hideEmptyFeeds = true;
    for (const matchingFeed of settings.feeds.filter((item) =>
      ["Nested feed", "Root feed"].includes(item.title),
    )) {
      for (const item of matchingFeed.items) item.read = true;
    }
    sidebar.render();
    openSearch();
    typeQuery("tag:Saved");

    expect(visibleTags()).toEqual(["Saved", "saved/later"]);
    expect(visibleFeeds()).toEqual([]);
    expect(settings.display.hideEmptyFeeds).toBe(true);
    expect(emptyState()).toBeNull();
    expect(searchStatus()?.textContent).toMatch(
      /2\s+tags?\s+and\s+2\s+feeds?/i,
    );
    expect(searchStatus()?.textContent).toMatch(/0\s+shown/i);
    expect(searchStatus()?.textContent).toMatch(/2\s+hidden/i);
  });

  it.each([
    {
      description: "all matching feeds are hidden",
      hiddenTitles: ["Nested feed", "Root feed"],
      shownTitles: [],
    },
    {
      description: "only some matching feeds are hidden",
      hiddenTitles: ["Nested feed"],
      shownTitles: ["Root feed"],
    },
  ])(
    "counts article-tag matches without matching catalog rows when $description",
    ({ hiddenTitles, shownTitles }) => {
      settings.display.hideEmptyFeeds = true;
      settings.availableTags = settings.availableTags.filter(
        (item) => !item.name.toLowerCase().startsWith("saved"),
      );
      for (const hiddenFeed of settings.feeds.filter((item) =>
        hiddenTitles.includes(item.title),
      )) {
        for (const item of hiddenFeed.items) item.read = true;
      }
      sidebar.render();
      openSearch();
      typeQuery("tag:Saved");

      expect(visibleTags()).toEqual([]);
      expect(visibleFeeds()).toEqual(shownTitles);
      for (const title of hiddenTitles) {
        expect(
          container.querySelector(
            `.rss-dashboard-feed[data-feed-title="${title}"]`,
          ),
        ).toBeNull();
      }
      expect(settings.display.hideEmptyFeeds).toBe(true);
      expect(emptyState()).toBeNull();
      expect(searchStatus()?.textContent).toMatch(
        /0\s+tags?\s+and\s+2\s+feeds?/i,
      );
      expect(searchStatus()?.textContent).toMatch(
        new RegExp(`${shownTitles.length}\\s+shown`, "i"),
      );
      expect(searchStatus()?.textContent).toMatch(
        new RegExp(`${hiddenTitles.length}\\s+hidden`, "i"),
      );
      expect(searchStatus()?.textContent).not.toMatch(/no matches|0 results/i);
    },
  );

  it("clears hidden-match feedback without restoring feeds hidden by the preference", () => {
    settings.display.hideEmptyFeeds = true;
    settings.availableTags = [];
    for (const matchingFeed of settings.feeds.filter((item) =>
      ["Nested feed", "Root feed"].includes(item.title),
    )) {
      for (const item of matchingFeed.items) item.read = true;
    }
    sidebar.render();
    openSearch();
    typeQuery("tag:Saved");
    expect(searchStatus()?.textContent).toMatch(/2\s+hidden/i);

    clearSearch();

    expect(searchStatus()?.textContent).toBe("");
    expect(emptyState()).toBeNull();
    expect(input().value).toBe("");
    expect(tagsSection()).toBeNull();
    expect(visibleFeeds()).toEqual(
      settings.feeds
        .filter((item) => !["Nested feed", "Root feed"].includes(item.title))
        .map((item) => item.title)
        .sort(),
    );
    expect(settings.display.hideEmptyFeeds).toBe(true);
    expect(folderHeader("Reading")?.classList.contains("collapsed")).toBe(true);
  });

  it.each(["feed:Sibling", "tag:missing"])(
    "replaces hidden-match feedback when the query changes to %s",
    (query) => {
      settings.display.hideEmptyFeeds = true;
      settings.availableTags = [];
      for (const matchingFeed of settings.feeds.filter((item) =>
        ["Nested feed", "Root feed"].includes(item.title),
      )) {
        for (const item of matchingFeed.items) item.read = true;
      }
      sidebar.render();
      openSearch();
      typeQuery("tag:Saved");
      expect(searchStatus()?.textContent).toMatch(/2\s+hidden/i);

      typeQuery(query);

      if (query === "tag:missing") {
        expect(visibleFeeds()).toEqual([]);
        expect(emptyState()?.textContent).toContain("No matches found.");
        expect(searchStatus()?.textContent).toMatch(/no matches|0 results/i);
      } else {
        expect(visibleFeeds()).toEqual(["Sibling feed"]);
        expect(emptyState()).toBeNull();
        expect(searchStatus()?.textContent).toBe("");
      }
      expect(searchStatus()?.textContent).not.toMatch(/hidden/i);
      expect(settings.display.hideEmptyFeeds).toBe(true);
    },
  );

  it("keeps only the ancestors of matching feeds and opens collapsed ancestors", () => {
    openSearch();
    typeQuery("tag:Saved");

    expect(visibleFolders()).toEqual(["Reading", "Reading/Deep"]);
    expect(folderHeader("Reading")?.classList.contains("collapsed")).toBe(
      false,
    );
    expect(folderHeader("Reading/Deep")?.classList.contains("collapsed")).toBe(
      false,
    );
    expect(settings.collapsedFolders).toEqual(["Reading", "Reading/Deep"]);
  });

  it.each(["tag:A", "tag:#a"])(
    "%s matches one-character tags and longer prefixes without a minimum length",
    (query) => {
      openSearch();
      typeQuery(query);
      expect(visibleTags()).toEqual(["A", "About"]);
      expect(visibleFeeds()).toEqual(["A feed", "About feed"]);
    },
  );

  it("does not treat a tag query as a substring search", () => {
    openSearch();
    typeQuery("tag:aved");
    expect(visibleTags()).toEqual([]);
    expect(visibleFeeds()).toEqual([]);
    expect(emptyState()?.textContent).toContain("No matches found.");
  });

  it("treats an asterisk as literal text rather than a wildcard", () => {
    openSearch();
    typeQuery("tag:Sa*");
    expect(visibleTags()).toEqual(["Sa*ved"]);
    expect(visibleFeeds()).toEqual(["Literal feed"]);
  });

  it("counts a matching tag with no articles as a result even when Tags was collapsed", () => {
    openSearch();
    typeQuery("tag:#Orph");
    expect(visibleTags()).toEqual(["Orphan"]);
    expect(visibleFeeds()).toEqual([]);
    expect(visibleFolders()).toEqual([]);
    expect(emptyState()).toBeNull();
    expect(
      tagsSection()?.querySelector(
        ".rss-dashboard-sidebar-tag-row:not(.rss-dashboard-search-hidden) .rss-dashboard-sidebar-tag-count",
      )?.textContent,
    ).toBe("0");
  });

  it("matches article tags even when the available-tag catalog has no matching row", () => {
    settings.availableTags = settings.availableTags.filter(
      (item) => !item.name.toLowerCase().startsWith("saved"),
    );
    sidebar.render();
    openSearch();
    typeQuery("tag:#Saved");
    expect(visibleFeeds()).toEqual(["Nested feed", "Root feed"]);
    expect(visibleTags()).toEqual([]);
    expect(emptyState()).toBeNull();
  });

  it.each(["tag:", "tag:#"])(
    "%s leaves feeds, folders, and an already open Tags section unfiltered",
    (query) => {
      button("Tags").click();
      openSearch();
      typeQuery("tag:Saved");
      typeQuery(query);
      expect(visibleFeeds()).toEqual(
        settings.feeds.map((item) => item.title).sort(),
      );
      expect(visibleFolders()).toEqual([
        "Reading",
        "Reading/Deep",
        "Reading/Sibling",
        "Saved archive",
      ]);
      expect(visibleTags()).toEqual(
        settings.availableTags.map((item) => item.name).sort(),
      );
      expect(emptyState()).toBeNull();
      expect(folderHeader("Reading")?.classList.contains("collapsed")).toBe(
        true,
      );
    },
  );

  it.each([
    "",
    "tag:",
    "tag:#",
    "feed:Root",
    "folder:Reading",
    "Root",
    "tag:missing",
  ])(
    "restores initially collapsed Tags when the query changes to %s",
    (query) => {
      openSearch();
      typeQuery("tag:Saved");
      expect(tagsSection()).not.toBeNull();
      typeQuery(query);
      expect(tagsSection()).toBeNull();
      expect(button("Tags").getAttribute("aria-pressed")).toBe("false");
    },
  );

  it("restores initially collapsed Tags and folders when the clear button is used", () => {
    openSearch();
    typeQuery("tag:Saved");
    clearSearch();
    expect(tagsSection()).toBeNull();
    expect(input().value).toBe("");
    expect(visibleFeeds()).toEqual(
      settings.feeds.map((item) => item.title).sort(),
    );
    expect(folderHeader("Reading")?.classList.contains("collapsed")).toBe(true);
    expect(folderHeader("Reading/Deep")?.classList.contains("collapsed")).toBe(
      true,
    );
    expect(document.activeElement).toBe(input());
  });

  it.each(["", "feed:Root", "tag:missing"])(
    "keeps initially expanded Tags expanded after changing the query to %s",
    (query) => {
      button("Tags").click();
      openSearch();
      typeQuery("tag:Saved");
      typeQuery(query);
      expect(tagsSection()).not.toBeNull();
      expect(button("Tags").getAttribute("aria-pressed")).toBe("true");
      if (query === "tag:missing") expect(visibleTags()).toEqual([]);
    },
  );

  it("restores collapse on closing and reveals retained matches again on reopening", () => {
    openSearch();
    typeQuery("tag:#Saved");
    button("Search").click();
    expect(tagsSection()).toBeNull();
    expect(visibleFeeds()).toEqual(
      settings.feeds.map((item) => item.title).sort(),
    );
    expect(folderHeader("Reading")?.classList.contains("collapsed")).toBe(true);

    openSearch();
    expect(input().value).toBe("tag:#Saved");
    expect(visibleTags()).toEqual(["Saved", "saved/later"]);
    expect(visibleFeeds()).toEqual(["Nested feed", "Root feed"]);
    clearSearch();
    expect(tagsSection()).toBeNull();
  });

  it("does not reapply a pending tag query after search is closed", () => {
    openSearch();
    input().value = "tag:Saved";
    input().dispatchEvent(new Event("input"));
    button("Search").click();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(container.querySelector(".rss-dashboard-search-input")).toBeNull();
    expect(tagsSection()).toBeNull();
    expect(visibleFeeds()).toEqual(
      settings.feeds.map((item) => item.title).sort(),
    );
    expect(folderHeader("Reading")?.classList.contains("collapsed")).toBe(true);
  });

  it("shows only the latest query when tag searches change before the debounce expires", () => {
    openSearch();
    for (const query of ["tag:Saved", "tag:Orphan", "tag:About"]) {
      input().value = query;
      input().dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS / 3);
    }
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(visibleTags()).toEqual(["About"]);
    expect(visibleFeeds()).toEqual(["About feed"]);
  });

  it("keeps initially expanded Tags open when search is closed", () => {
    button("Tags").click();
    openSearch();
    typeQuery("tag:Saved");
    button("Search").click();
    expect(tagsSection()).not.toBeNull();
    expect(visibleTags()).toEqual(
      settings.availableTags.map((item) => item.name).sort(),
    );
  });

  it.each(["collapsed", "expanded"])(
    "preserves initially %s Tags after disabled mouse and keyboard activation during a tag search",
    (initialState) => {
      const initiallyExpanded = initialState === "expanded";
      if (initiallyExpanded) button("Tags").click();
      openSearch();
      typeQuery("tag:Saved");

      expect(button("Tags").getAttribute("aria-disabled")).toBe("true");
      expect(button("Tags").getAttribute("aria-description")).toBeTruthy();
      button("Tags").click();
      for (const key of ["Enter", " "]) {
        button("Tags").dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          }),
        );
        expect(visibleTags()).toEqual(["Saved", "saved/later"]);
        expect(button("Tags").getAttribute("aria-disabled")).toBe("true");
      }

      clearSearch();
      expect(tagsSection() !== null).toBe(initiallyExpanded);
      expect(button("Tags").getAttribute("aria-pressed")).toBe(
        String(initiallyExpanded),
      );
      expect(button("Tags").getAttribute("aria-disabled")).not.toBe("true");
      expect(button("Tags").hasAttribute("aria-description")).toBe(false);

      button("Tags").click();
      expect(tagsSection() !== null).toBe(!initiallyExpanded);
    },
  );

  it("keeps search focused when auto-revealing Tags with an unfinished add-tag form", () => {
    button("Tags").click();
    const addToggle = container.querySelector<HTMLElement>(
      ".rss-dashboard-sidebar-add-tag-toggle",
    );
    if (!addToggle) throw new Error("Add tag toggle did not render");
    addToggle.click();
    vi.advanceTimersToNextFrame();
    expect(
      container.querySelector(".rss-dashboard-sidebar-add-tag-input"),
    ).not.toBeNull();
    button("Tags").click();
    expect(tagsSection()).toBeNull();

    openSearch();
    const searchInput = input();
    expect(document.activeElement).toBe(searchInput);
    typeQuery("tag:Saved");
    vi.advanceTimersToNextFrame();

    expect(visibleTags()).toEqual(["Saved", "saved/later"]);
    expect(input()).toBe(searchInput);
    expect(document.activeElement).toBe(searchInput);
  });

  it("keeps the search input focused while matching tags appear and disappear", () => {
    openSearch();
    const originalInput = input();
    expect(document.activeElement).toBe(originalInput);
    for (const query of [
      "tag:A",
      "tag:Saved",
      "tag:missing",
      "tag:#Orphan",
      "",
    ]) {
      typeQuery(query);
      expect(input()).toBe(originalInput);
      expect(document.activeElement).toBe(originalInput);
      expect(input().value).toBe(query);
    }
  });

  it("updates one persistent polite status with matching and no-results feedback", () => {
    openSearch();
    const status = container.querySelector<HTMLElement>(
      '[role="status"][aria-live="polite"]',
    );
    expect(status).not.toBeNull();
    typeQuery("tag:Saved");
    expect(status?.isConnected).toBe(true);
    expect(status?.textContent).toMatch(/2\s+tags?/i);
    expect(status?.textContent).toMatch(/2\s+feeds?/i);
    const matchingAnnouncement = status?.textContent;

    typeQuery("tag:missing");
    expect(status?.isConnected).toBe(true);
    expect(status?.textContent).not.toBe(matchingAnnouncement);
    expect(status?.textContent).toMatch(/no matches|0 results/i);
    expect(
      container.querySelectorAll('[role="status"][aria-live="polite"]'),
    ).toHaveLength(1);

    typeQuery("tag:Orphan");
    expect(status?.isConnected).toBe(true);
    expect(status?.textContent).toMatch(/1\s+tag/i);
    expect(emptyState()).toBeNull();
  });

  it("preserves matches through a sidebar rerender and still restores the original collapse state", () => {
    openSearch();
    typeQuery("tag:#Saved");
    sidebar.render();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(input().value).toBe("tag:#Saved");
    expect(visibleTags()).toEqual(["Saved", "saved/later"]);
    expect(visibleFeeds()).toEqual(["Nested feed", "Root feed"]);
    expect(visibleFolders()).toEqual(["Reading", "Reading/Deep"]);
    expect(document.activeElement).toBe(input());

    clearSearch();
    expect(tagsSection()).toBeNull();
    expect(folderHeader("Reading")?.classList.contains("collapsed")).toBe(true);
    expect(folderHeader("Reading/Deep")?.classList.contains("collapsed")).toBe(
      true,
    );
  });
});
