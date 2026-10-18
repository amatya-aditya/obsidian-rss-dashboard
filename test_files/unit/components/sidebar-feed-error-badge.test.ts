import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Sidebar,
  SidebarOptions,
  SidebarCallbacks,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import { RssDashboardSettings, Feed } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { lucideIconId } from "../test-icon-helpers";
import { parseFetchErrorMessage } from "../../../src/services/feed-parser/feed-errors";

installObsidianDomPolyfills();

/**
 * The name a browser computes for the badge: `aria-labelledby` first, then
 * `aria-label`, then the text. jsdom ships no name computation.
 */
function badgeName(el: Element | null | undefined): string {
  if (!el) return "";
  const ids = el.getAttribute("aria-labelledby");
  if (ids) {
    return ids
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent?.trim())
      .filter(Boolean)
      .join(" ");
  }
  return el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
}

describe("Feed Error Badge Rendering", () => {
  let app: App;
  let container: HTMLElement;
  interface MockPlugin {
    settings: RssDashboardSettings;
    saveSettings: ReturnType<typeof vi.fn>;
  }
  let plugin: MockPlugin;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;

  beforeEach(() => {
    app = ObsidianStubs.App.createMock();
    container = createDiv();
    document.body.appendChild(container);

    settings = {
      feeds: [],
      folders: [],
      display: {
        showFeedUnreadBadges: true,
      },
    } as unknown as RssDashboardSettings;

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: false,
      collapsedFolders: [],
      selectedFolders: [],
    };

    callbacks = {} as unknown as SidebarCallbacks;

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    container.remove();
  });

  it("should not render error badge when lastFetchError is absent", () => {
    settings.feeds = [
      {
        title: "Normal Feed",
        url: "url1",
        folder: "Folder 1",
        items: [{ read: false }], // 1 unread
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const feedNameContainer = container.querySelector(
      '[data-feed-url="url1"] .rss-dashboard-feed-name-container',
    );
    expect(feedNameContainer).not.toBeNull();

    // Has unread count
    expect(
      feedNameContainer?.querySelector(".rss-dashboard-feed-unread-count"),
    ).not.toBeNull();
    // Does NOT have error badge
    expect(
      feedNameContainer?.querySelector(".rss-dashboard-feed-error-badge"),
    ).toBeNull();
  });

  it("should render the error badge as a native button named after the failure", () => {
    settings.feeds = [
      {
        title: "Failed Feed",
        url: "url-fail",
        folder: "Folder 1",
        items: [],
        lastFetchError: "Request failed, status 429",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const errorBadge = container.querySelector(
      '[data-feed-url="url-fail"] .rss-dashboard-feed-error-badge',
    ) as HTMLElement;

    expect(errorBadge).not.toBeNull();
    // A native button is reachable and activatable by keyboard alone, unlike
    // the previous non-interactive `div` whose message only reached a tooltip.
    expect(errorBadge.tagName).toBe("BUTTON");
    expect(errorBadge.getAttribute("type")).toBe("button");
    expect(errorBadge.hasAttribute("title")).toBe(false);
    // No `aria-label` either: Obsidian draws a hover tooltip from it, and the
    // row's hover popover already reports the failure.
    expect(errorBadge.hasAttribute("aria-label")).toBe(false);
    expect(badgeName(errorBadge)).toBe(
      "Refresh failed: Request failed, status 429. Show details",
    );

    // Check it rendered the icon
    expect(lucideIconId(errorBadge)).toBe("alert-circle");
  });

  it("caps the badge's name at the display limit, not the stored message", () => {
    const longError = "A".repeat(200);
    settings.feeds = [
      {
        title: "Wordy failure",
        url: "url-long",
        folder: "Folder 1",
        items: [],
        lastFetchError: longError,
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const label = badgeName(
      container.querySelector(
        '[data-feed-url="url-long"] .rss-dashboard-feed-error-badge',
      ),
    );

    const expectedMessage = `${"A".repeat(77)}...`;
    expect(label).toBe(`Refresh failed: ${expectedMessage} Show details`);
    expect(label?.includes(longError)).toBe(false);
    // A stored message that already ends a sentence keeps one full stop.
    expect(label?.includes("....")).toBe(false);
  });

  it("does not double the full stop of a stored message that ends a sentence", () => {
    settings.feeds = [
      {
        title: "Sentence failure",
        url: "url-period",
        folder: "Folder 1",
        items: [],
        lastFetchError: "Request failed: the host could not be resolved.",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    expect(
      badgeName(
        container.querySelector(
          '[data-feed-url="url-period"] .rss-dashboard-feed-error-badge',
        ),
      ),
    ).toBe(
      "Refresh failed: Request failed: the host could not be resolved. Show details",
    );
  });

  it("opens the feed error dialog for its own feed when activated", () => {
    settings.feeds = [
      {
        title: "Failed Feed",
        url: "url-open",
        folder: "Folder 1",
        items: [],
        lastFetchError: "HTTP 500",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const errorBadge = container.querySelector(
      '[data-feed-url="url-open"] .rss-dashboard-feed-error-badge',
    ) as HTMLElement;
    errorBadge.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const dialog = document.querySelector(
      ".rss-dashboard-refresh-details-modal",
    );
    expect(dialog?.textContent).toContain("Failed Feed");
    expect(dialog?.textContent).toContain("HTTP 500");
    // Close through the host's own button so AccessibleModal releases its
    // focus-trap listener and MutationObserver.
    dialog
      ?.closest(".modal")
      ?.querySelector<HTMLElement>(".modal-header-button")
      ?.click();
  });

  it("describes the failing feed row with its error badge", () => {
    settings.feeds = [
      {
        title: "Failed Feed",
        url: "url-described",
        folder: "Folder 1",
        items: [],
        lastFetchError: "HTTP 500",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const row = container.querySelector(
      '[data-feed-url="url-described"]',
    ) as HTMLElement;
    const badge = row.querySelector(".rss-dashboard-feed-error-badge");
    const describedBy = row.getAttribute("aria-describedby") ?? "";

    expect(badge?.id).toBeTruthy();
    expect(describedBy.split(" ")).toContain(badge?.id);
  });

  it("caps the error in the row's screen-reader description", () => {
    const longError = "B".repeat(200);
    settings.feeds = [
      {
        title: "Wordy failure",
        url: "url-described-long",
        folder: "Folder 1",
        items: [],
        lastFetchError: longError,
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    // The description is announced on every row focus, so it is capped like the
    // badge name; the dialog and the clipboard carry the full message.
    const row = container.querySelector(
      '[data-feed-url="url-described-long"]',
    ) as HTMLElement;
    const badgeId = row
      .querySelector(".rss-dashboard-feed-error-badge")
      ?.getAttribute("id");
    const descriptionId = (row.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .find((id) => id.length > 0 && id !== badgeId);
    const description = document.getElementById(descriptionId ?? "");

    expect(description?.textContent).toContain(
      `Refresh failed: ${"B".repeat(77)}`,
    );
    expect(description?.textContent?.includes(longError)).toBe(false);
  });

  it("should render both unread count and error badge when both exist", () => {
    settings.feeds = [
      {
        title: "Stale Feed",
        url: "url-stale",
        folder: "Folder 1",
        items: [{ read: false }, { read: false }], // 2 unread
        lastFetchError: "Not a valid RSS/Atom feed",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const feedNameContainer = container.querySelector(
      '[data-feed-url="url-stale"] .rss-dashboard-feed-name-container',
    );

    // Should have both
    const unreadCount = feedNameContainer?.querySelector(
      ".rss-dashboard-feed-unread-count",
    );
    const errorBadge = feedNameContainer?.querySelector(
      ".rss-dashboard-feed-error-badge",
    );

    expect(unreadCount).not.toBeNull();
    expect(unreadCount?.textContent).toBe("2");
    expect(errorBadge).not.toBeNull();
  });

  it("should not render error badge when feed fetch error badges are hidden", () => {
    settings.display.hideFeedFetchErrorBadges = true;
    settings.feeds = [
      {
        title: "Failed Feed",
        url: "url-hidden-error",
        folder: "Folder 1",
        items: [],
        lastFetchError: "Request failed, status 500",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const feedNameContainer = container.querySelector(
      '[data-feed-url="url-hidden-error"] .rss-dashboard-feed-name-container',
    );

    expect(
      feedNameContainer?.querySelector(".rss-dashboard-feed-error-badge"),
    ).toBeNull();
  });

  // GH #1140: a feed whose background import failed was rendered as a bare
  // title, indistinguishable from a feed that simply has no articles yet.
  it("should render a warning badge for a feed whose background import failed", () => {
    settings.feeds = [
      {
        title: "Local fail",
        url: "url-import-fail",
        folder: "Folder 1",
        items: [],
        importStatus: "failed",
        importError: "Request failed, status 500",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    const errorBadge = container.querySelector(
      '[data-feed-url="url-import-fail"] .rss-dashboard-feed-error-badge',
    ) as HTMLElement;

    expect(errorBadge).not.toBeNull();
    expect(badgeName(errorBadge)).toContain("status 500");
    expect(lucideIconId(errorBadge)).toBe("alert-circle");
  });

  it("should render a warning badge for a feed whose background import timed out", () => {
    settings.feeds = [
      {
        title: "Slow feed",
        url: "url-import-timeout",
        folder: "Folder 1",
        items: [],
        importStatus: "timed_out",
        importError: "Timed out",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    expect(
      container.querySelector(
        '[data-feed-url="url-import-timeout"] .rss-dashboard-feed-error-badge',
      ),
    ).not.toBeNull();
  });

  it("should hide the import warning badge when feed fetch error badges are hidden", () => {
    settings.display.hideFeedFetchErrorBadges = true;
    settings.feeds = [
      {
        title: "Local fail",
        url: "url-import-hidden",
        folder: "Folder 1",
        items: [],
        importStatus: "failed",
        importError: "Request failed, status 500",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    expect(
      container.querySelector(
        '[data-feed-url="url-import-hidden"] .rss-dashboard-feed-error-badge',
      ),
    ).toBeNull();
  });

  it("should not render a warning badge for a feed that simply has no articles", () => {
    settings.feeds = [
      {
        title: "New feed",
        url: "url-empty",
        folder: "Folder 1",
        items: [],
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    expect(
      container.querySelector(
        '[data-feed-url="url-empty"] .rss-dashboard-feed-error-badge',
      ),
    ).toBeNull();
  });

  it("should not render an import warning badge for a feed whose import is still running", () => {
    settings.feeds = [
      {
        title: "Importing feed",
        url: "url-importing",
        folder: "Folder 1",
        items: [],
        importStatus: "processing",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    expect(
      container.querySelector(
        '[data-feed-url="url-importing"] .rss-dashboard-feed-error-badge',
      ),
    ).toBeNull();
  });

  it("should not render a warning badge while a failed import is being retried", () => {
    settings.feeds = [
      {
        title: "Retrying feed",
        url: "url-import-retry",
        folder: "Folder 1",
        items: [],
        importStatus: "pending",
      } as unknown as Feed,
    ];

    const sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    sidebar.render();

    expect(
      container.querySelector(
        '[data-feed-url="url-import-retry"] .rss-dashboard-feed-error-badge',
      ),
    ).toBeNull();
  });
});

describe("parseFetchErrorMessage", () => {
  it("should strip Error: prefix", () => {
    expect(parseFetchErrorMessage("Error: Not a valid RSS/Atom feed")).toBe(
      "Not a valid RSS/Atom feed",
    );

    expect(parseFetchErrorMessage("Error: Request failed, status 429")).toBe(
      "Request failed, status 429",
    );
  });

  it("should handle Error objects", () => {
    const err = new Error("Timed out");
    expect(parseFetchErrorMessage(err)).toBe("Timed out");

    const errWithPrefix = new Error("Error: Some internal issue");
    expect(parseFetchErrorMessage(errWithPrefix)).toBe("Some internal issue");
  });

  it("should return Unknown error for non-strings", () => {
    expect(parseFetchErrorMessage(null)).toBe("Unknown error");
  });

  it("keeps a very long message in full", () => {
    const longError = "A".repeat(200);
    const parsed = parseFetchErrorMessage(longError);
    expect(parsed).toBe(longError);
  });
});
