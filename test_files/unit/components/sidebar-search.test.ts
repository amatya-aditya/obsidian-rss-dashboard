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
  type Folder,
  type RssDashboardSettings,
  type Tag,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { App } from "../../stubs/obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const SEARCH_DEBOUNCE_MS = 150;
const tag = (name: string): Tag => ({ name, color: "#6699cc" });
const article = (
  name: string,
  tags: string[] = [],
  read = false,
): FeedItem => ({
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
  read,
});
const feed = (title: string, folder: string, items: FeedItem[]): Feed => ({
  title,
  url: `https://example.com/feeds/${encodeURIComponent(title)}`,
  folder,
  items,
  lastUpdated: 0,
});
const folder = (name: string, subfolders: Folder[] = []): Folder => ({
  name,
  subfolders,
});

describe("Sidebar search", () => {
  let container: HTMLElement;
  let sidebar: Sidebar;
  let settings: RssDashboardSettings;

  beforeEach(() => {
    // Fake timers drive the search debounce and the focus frames.
    vi.useFakeTimers();
    container = createDiv();
    document.body.appendChild(container);
    settings = {
      ...DEFAULT_SETTINGS,
      display: { ...DEFAULT_SETTINGS.display, useDomainIconsRss: false },
      media: { ...DEFAULT_SETTINGS.media },
      feeds: [
        feed("Saved feed", "", [article("First", ["Saved"])]),
        feed("Archive feed", "Saved archive", [article("Second")]),
        feed("Tagged feed", "News/Tech", [article("Third", ["Saved/later"])]),
        feed("Tech feed", "News/Tech", [article("Fourth")]),
        feed("Daily tech news", "Reading", [article("Fifth")]),
        feed("Unrelated feed", "", [article("Sixth")]),
      ],
      folders: [
        folder("Saved archive"),
        folder("News", [folder("Tech")]),
        folder("Reading"),
        folder("Empty archive"),
      ],
      collapsedFolders: ["News", "News/Tech", "Reading"],
      availableTags: ["Saved", "Saved/later", "Unsaved", "Orphan"].map(tag),
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
    vi.advanceTimersToNextFrame();
  };
  const typeQuery = (query: string): void => {
    const searchInput = input();
    searchInput.value = query;
    searchInput.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  };
  const clearSearch = (): void => {
    const clear = container.querySelector<HTMLElement>(
      ".rss-dashboard-search-container > button.search-input-clear-button",
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
  const allFeedTitles = (): string[] =>
    settings.feeds.map((item) => item.title).sort();
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
    container.querySelector(".rss-dashboard-search-status");
  const folderHeader = (path: string): HTMLElement | null =>
    container.querySelector(
      `.rss-dashboard-feed-folder-header[data-folder-path="${path}"]`,
    );

  it("combines feed, folder, and tag matches for a plain query", () => {
    openSearch();
    typeQuery("Saved");

    expect(visibleTags()).toEqual(["Saved", "Saved/later"]);
    expect(visibleFolders()).toEqual(["News", "News/Tech", "Saved archive"]);
    expect(visibleFeeds()).toEqual([
      "Archive feed",
      "Saved feed",
      "Tagged feed",
    ]);
    expect(searchStatus()?.textContent).toMatch(/2\s+tags?/i);
    expect(searchStatus()?.textContent).toMatch(/1\s+folder/i);
    expect(searchStatus()?.textContent).toMatch(/3\s+feeds?/i);
    expect(emptyState()).toBeNull();
  });

  it("counts a feed reached by both its title and its tag only once", () => {
    settings.feeds = [feed("Saved feed", "", [article("First", ["Saved"])])];
    settings.folders = [];
    settings.availableTags = [tag("Saved")];
    sidebar.render();
    openSearch();
    typeQuery("Saved feed");

    expect(visibleFeeds()).toEqual(["Saved feed"]);
    expect(searchStatus()?.textContent).toMatch(/0\s+folders?/i);
    expect(searchStatus()?.textContent).toMatch(/1\s+feed\b/i);
  });

  it.each(["tag:#Sav", "tag:#sAv", "tag:Sav"])(
    "%s matches the same literal tag prefix and associated feeds",
    (query) => {
      openSearch();
      typeQuery(query);

      expect(visibleTags()).toEqual(["Saved", "Saved/later"]);
      expect(visibleFeeds()).toEqual(["Saved feed", "Tagged feed"]);
      expect(emptyState()).toBeNull();
    },
  );

  it("uses a literal tag prefix for a plain query too", () => {
    settings.feeds = [feed("Tagged feed", "", [article("Tagged", ["Saved"])])];
    settings.folders = [];
    settings.availableTags = ["Saved", "Saved/later", "Unsaved"].map(tag);
    sidebar.render();
    openSearch();
    typeQuery("Sav");

    expect(visibleTags()).toEqual(["Saved", "Saved/later"]);
    expect(visibleFeeds()).toEqual(["Tagged feed"]);
  });

  it.each(["ave", "tag:#ave", "tag:#Save*", "Save*"])(
    "%s is a true miss for an existing Saved tag",
    (query) => {
      settings.feeds = [feed("Tagged feed", "Reading", [article("Tagged")])];
      settings.folders = [folder("Reading")];
      settings.availableTags = [tag("Saved")];
      sidebar.render();
      openSearch();
      typeQuery(query);

      expect(visibleTags()).toEqual([]);
      expect(visibleFeeds()).toEqual([]);
      expect(emptyState()?.textContent).toContain("No matches found.");
      expect(searchStatus()?.textContent).toContain("No matches found.");
    },
  );

  it.each(["Sa", "", "   ", "feed:", "tag:#", "tag:"])(
    "leaves the default sidebar and announces nothing for %s",
    (query) => {
      openSearch();
      typeQuery(query);

      expect(visibleFeeds()).toEqual(allFeedTitles());
      expect(visibleFolders()).toEqual([
        "Empty archive",
        "News",
        "News/Tech",
        "Reading",
        "Saved archive",
      ]);
      expect(tagsSection()).toBeNull();
      expect(emptyState()).toBeNull();
      expect(searchStatus()?.textContent).toBe("");
      expect(folderHeader("News")?.classList.contains("collapsed")).toBe(true);
    },
  );

  it.each(["tag:#S", "feed:U", "folder:N"])(
    "applies the one-character qualified search %s",
    (query) => {
      openSearch();
      typeQuery(query);

      expect(emptyState()).toBeNull();
      expect(searchStatus()?.textContent).not.toBe("");

      if (query === "tag:#S") {
        expect(visibleTags()).toEqual(["Saved", "Saved/later"]);
        expect(visibleFeeds()).toEqual(["Saved feed", "Tagged feed"]);
      } else if (query === "feed:U") {
        expect(visibleFeeds()).toEqual(["Unrelated feed"]);
      } else {
        expect(visibleFolders()).toEqual(["News", "News/Tech", "Reading"]);
        expect(visibleFeeds()).toEqual([
          "Daily tech news",
          "Tagged feed",
          "Tech feed",
        ]);
      }
    },
  );

  it.each(["feed:Tech", "feeds:Tech"])(
    "%s shows a feed found through its folder path and its ancestors",
    (query) => {
      openSearch();
      typeQuery(query);

      expect(visibleFeeds()).toEqual([
        "Daily tech news",
        "Tagged feed",
        "Tech feed",
      ]);
      expect(visibleFolders()).toEqual(["News", "News/Tech", "Reading"]);
      expect(folderHeader("News")?.classList.contains("collapsed")).toBe(false);
      expect(folderHeader("News/Tech")?.classList.contains("collapsed")).toBe(
        false,
      );
    },
  );

  it("shows an empty matching folder without reporting a miss", () => {
    openSearch();
    typeQuery("folder:Empty");

    expect(visibleFolders()).toEqual(["Empty archive"]);
    expect(visibleFeeds()).toEqual([]);
    expect(emptyState()).toBeNull();
    expect(searchStatus()?.textContent).toMatch(/1\s+folder/i);
  });

  it("reveals eligible feeds under a collapsed matching folder", () => {
    openSearch();
    typeQuery("folder:News");

    expect(visibleFolders()).toEqual(["News", "News/Tech"]);
    expect(visibleFeeds()).toEqual(["Tagged feed", "Tech feed"]);
    expect(folderHeader("News")?.classList.contains("collapsed")).toBe(false);
    expect(folderHeader("News/Tech")?.classList.contains("collapsed")).toBe(
      false,
    );
    expect(settings.collapsedFolders).toEqual(["News", "News/Tech", "Reading"]);
  });

  it("requires every word in a plain query", () => {
    openSearch();
    typeQuery("daily news");
    expect(visibleFeeds()).toEqual(["Daily tech news"]);

    typeQuery("daily cooking");
    expect(visibleFeeds()).toEqual([]);
    expect(emptyState()).not.toBeNull();
  });

  it.each(["title:Tech", "#Saved"])(
    "treats the unknown prefix or bare hash in %s as plain text",
    (query) => {
      openSearch();
      typeQuery(query);

      expect(visibleFeeds()).toEqual([]);
      expect(visibleTags()).toEqual([]);
      expect(emptyState()?.textContent).toContain("No matches found.");
    },
  );

  it("shows a matching tag row that has no articles", () => {
    settings.availableTags = ["Orphan"].map(tag);
    settings.feeds = [];
    settings.folders = [];
    sidebar.render();
    openSearch();
    typeQuery("Orph");

    expect(visibleTags()).toEqual(["Orphan"]);
    expect(visibleFeeds()).toEqual([]);
    expect(emptyState()).toBeNull();
    expect(searchStatus()?.textContent).toMatch(/1\s+tag/i);
  });

  it("shows a feed with a matching article tag that has no catalog row", () => {
    settings.availableTags = [];
    settings.feeds = [feed("Ghost feed", "", [article("Ghost", ["Ghost"])])];
    settings.folders = [];
    sidebar.render();
    openSearch();
    typeQuery("Ghost");

    expect(visibleTags()).toEqual([]);
    expect(visibleFeeds()).toEqual(["Ghost feed"]);
    expect(emptyState()).toBeNull();
    expect(searchStatus()?.textContent).toMatch(/1\s+feed\b/i);
  });

  it("does not match article titles or bodies", () => {
    settings.feeds = [feed("Tech feed", "Reading", [article("Saved story")])];
    settings.folders = [folder("Reading")];
    settings.availableTags = [];
    sidebar.render();
    openSearch();
    typeQuery("Saved");

    expect(visibleFeeds()).toEqual([]);
    expect(emptyState()?.textContent).toContain("No matches found.");
  });

  it("reports matching feeds hidden by the unread preference separately", () => {
    settings.display.hideEmptyFeeds = true;
    settings.feeds = [
      feed("Visible news", "", [article("Unread article")]),
      feed("Hidden news", "", [article("Read article", [], true)]),
    ];
    settings.folders = [];
    settings.availableTags = [];
    sidebar.render();
    openSearch();
    typeQuery("news");

    expect(visibleFeeds()).toEqual(["Visible news"]);
    expect(searchStatus()?.textContent).toMatch(/1\s+feed\s+shown/i);
    expect(searchStatus()?.textContent).toMatch(
      /1\s+matching\s+feed\s+is\s+hidden/i,
    );
    expect(emptyState()).toBeNull();
  });

  it("explains when every matching feed is hidden by the unread preference", () => {
    settings.display.hideEmptyFeeds = true;
    settings.feeds = [
      feed("Hidden news", "", [article("Read article", [], true)]),
      feed("Hidden stories", "", [article("Another read article", [], true)]),
    ];
    settings.folders = [];
    settings.availableTags = [];
    sidebar.render();
    openSearch();
    typeQuery("Hidden");

    expect(visibleFeeds()).toEqual([]);
    const message = emptyState()?.textContent ?? "";
    expect(message).toContain("0 shown");
    expect(message).toMatch(/2 matching feeds are hidden/i);
    expect(message).not.toContain("No matches found.");
    expect(searchStatus()?.textContent).toMatch(/2 matching feeds are hidden/i);
    expect(searchStatus()?.textContent).not.toContain("No matches found.");
  });

  it("shows and announces the true-miss message", () => {
    openSearch();
    typeQuery("nothing-matches-this");

    expect(visibleFeeds()).toEqual([]);
    expect(emptyState()?.textContent).toContain("No matches found.");
    expect(searchStatus()?.textContent).toContain("No matches found.");
  });

  it("announces the settled result once without stealing focus", async () => {
    openSearch();
    const status = searchStatus();
    if (!status) throw new Error("Status region did not render");
    const announcements: string[] = [];
    const observer = new MutationObserver(() => {
      announcements.push(status.textContent ?? "");
    });
    observer.observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const searchInput = input();
    for (const query of ["S", "Sa", "Sav"]) {
      searchInput.value = query;
      searchInput.dispatchEvent(new Event("input"));
      vi.advanceTimersByTime(50);
    }
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    await Promise.resolve();
    observer.disconnect();

    expect(announcements).toHaveLength(1);
    expect(announcements[0]).toMatch(/2\s+tags?/i);
    expect(document.activeElement).toBe(searchInput);
  });

  it("restores collapsed folders and Tags when a query drops below the minimum", () => {
    openSearch();
    typeQuery("tag:Sav");
    expect(tagsSection()).not.toBeNull();
    expect(folderHeader("News")?.classList.contains("collapsed")).toBe(false);

    typeQuery("Sa");

    expect(tagsSection()).toBeNull();
    expect(visibleFeeds()).toEqual(allFeedTitles());
    expect(folderHeader("News")?.classList.contains("collapsed")).toBe(true);
    expect(folderHeader("News/Tech")?.classList.contains("collapsed")).toBe(
      true,
    );
    expect(emptyState()).toBeNull();
    expect(searchStatus()?.textContent).toBe("");
  });

  it("hides an initially open Tags section during a query without tag matches", () => {
    button("Tags").click();
    openSearch();
    typeQuery("feed:Tech");
    expect(tagsSection()).toBeNull();

    clearSearch();
    expect(tagsSection()).not.toBeNull();
    expect(visibleTags()).toEqual(
      settings.availableTags.map((item) => item.name).sort(),
    );
  });

  it("restores an initially collapsed Tags section after clearing a plain tag match", () => {
    openSearch();
    typeQuery("Saved");
    expect(tagsSection()).not.toBeNull();

    clearSearch();

    expect(tagsSection()).toBeNull();
    expect(input().value).toBe("");
    expect(visibleFeeds()).toEqual(allFeedTitles());
  });

  it("restores fold state when search closes and reapplies retained text when it reopens", () => {
    openSearch();
    typeQuery("tag:Sav");
    expect(folderHeader("News")?.classList.contains("collapsed")).toBe(false);

    button("Search").click();
    expect(tagsSection()).toBeNull();
    expect(folderHeader("News")?.classList.contains("collapsed")).toBe(true);
    expect(visibleFeeds()).toEqual(allFeedTitles());

    openSearch();
    expect(input().value).toBe("tag:Sav");
    expect(visibleTags()).toEqual(["Saved", "Saved/later"]);
    expect(visibleFeeds()).toEqual(["Saved feed", "Tagged feed"]);
  });

  it("keeps focus and the caret in the search input as results update", () => {
    openSearch();
    const searchInput = input();
    searchInput.focus();
    searchInput.value = "Sav";
    searchInput.setSelectionRange(3, 3);
    searchInput.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(input()).toBe(searchInput);
    expect(document.activeElement).toBe(searchInput);
    expect(searchInput.selectionStart).toBe(3);
    expect(searchStatus()?.textContent).not.toBe("");
  });

  it("leaves focus on a row that survives the filter", () => {
    openSearch();
    const row = container.querySelector<HTMLElement>(
      '.rss-dashboard-feed[data-feed-title="Tech feed"]',
    );
    if (!row) throw new Error("Tech feed row did not render");
    row.focus();
    typeQuery("Tech");

    expect(document.activeElement).toBe(row);
  });

  it("returns focus to the input when clearing re-collapses the focused row", () => {
    openSearch();
    typeQuery("folder:News");
    const row = container.querySelector<HTMLElement>(
      '.rss-dashboard-feed[data-feed-title="Tech feed"]',
    );
    if (!row) throw new Error("Tech feed row did not render");
    row.focus();

    clearSearch();

    expect(visibleFeeds()).toEqual(allFeedTitles());
    expect(document.activeElement).toBe(input());
  });

  it("returns focus to the input when filtering hides the focused row", () => {
    const row = container.querySelector<HTMLElement>(
      '.rss-dashboard-feed[data-feed-title="Tech feed"]',
    );
    if (!row) throw new Error("Tech feed row did not render");
    openSearch();
    row.focus();
    typeQuery("zzzz");

    expect(document.activeElement).toBe(input());
  });

  it("returns focus to the input when filtering removes the focused tag row", () => {
    button("Tags").click();
    openSearch();
    const tagRow = container.querySelector<HTMLElement>(
      '.rss-dashboard-sidebar-tag-row[data-tag-name="Saved"]',
    );
    if (!tagRow) throw new Error("Saved tag row did not render");
    tagRow.focus();
    typeQuery("feed:Tech");

    expect(tagsSection()).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it.each(["tag", "feed", "folder"])(
    "applies a one-character %s: scope",
    (scope) => {
      settings.feeds = [
        feed("AI weekly", "AI", [article("Models", ["AI"])]),
        feed("Other feed", "", [article("Nothing")]),
      ];
      settings.folders = [folder("AI")];
      settings.availableTags = [tag("AI")];
      settings.collapsedFolders = ["AI"];
      sidebar.clearFolderPathCache();
      sidebar.render();
      openSearch();

      if (scope === "tag") {
        typeQuery("tag:#AI");
        expect(visibleTags()).toEqual(["AI"]);
        expect(visibleFeeds()).toEqual(["AI weekly"]);
      } else if (scope === "feed") {
        typeQuery("feed:A");
        expect(visibleTags()).toEqual([]);
        expect(visibleFeeds()).toEqual(["AI weekly"]);
      } else {
        typeQuery("folder:AI");
        expect(visibleFeeds()).toEqual(["AI weekly"]);
        expect(visibleFolders()).toEqual(["AI"]);
        expect(folderHeader("AI")?.classList.contains("collapsed")).toBe(false);
      }
      expect(emptyState()).toBeNull();
      expect(searchStatus()?.textContent).not.toBe("");
    },
  );

  it("keeps an initially open Tags section open when filtering stops", () => {
    button("Tags").click();
    openSearch();
    typeQuery("feed:Tech");
    expect(tagsSection()).toBeNull();

    typeQuery("Sa");

    expect(tagsSection()).not.toBeNull();
    expect(visibleTags()).toEqual(
      settings.availableTags.map((item) => item.name).sort(),
    );
    expect(button("Tags").getAttribute("aria-pressed")).toBe("true");
  });

  it("restores an initially open Tags section when search closes", () => {
    button("Tags").click();
    openSearch();
    typeQuery("feed:Tech");
    expect(tagsSection()).toBeNull();

    button("Search").click();

    expect(tagsSection()).not.toBeNull();
    expect(button("Tags").getAttribute("aria-pressed")).toBe("true");
  });

  it("describes the search input with a readable hint", () => {
    openSearch();
    const searchInput = input();
    expect(searchInput.getAttribute("aria-label")).toBe("Search sidebar");
    expect(searchInput.getAttribute("placeholder")).toBe("Search sidebar");

    const describedBy = searchInput.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const hint = document.getElementById(describedBy ?? "");
    expect(hint?.classList.contains("rss-dashboard-search-hint")).toBe(true);
    expect(hint?.textContent).toContain("Search by name");
    expect(hint?.textContent).toContain("feed:news");
    expect(hint?.textContent).toContain("folder:tech");
    expect(hint?.textContent).toContain("tag:#saved");
  });
});
