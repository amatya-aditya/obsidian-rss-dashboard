import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { Sidebar, SidebarOptions, SidebarCallbacks } from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App } from "../../stubs/obsidian";
import { RssDashboardSettings, type Feed, type Tag } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

installObsidianDomPolyfills();

/**
 * Regression coverage for sidebar.ts's "Delete tag" action: it used to strip
 * a tag from every article's local `tags` directly, without going through
 * the FreshRSS article-facet mutation boundary at all. For a FreshRSS-linked
 * article whose tag maps to a known FreshRSS label, that meant the removal
 * never queued a pending `label:<name>` mutation, so it never propagated to
 * FreshRSS and would be silently re-added by the next pull-reconcile cycle
 * (see `commitArticleLabelMembershipChangesBatch` in main.ts and
 * freshrss-article-label-state.test.ts for the boundary's own contract
 * coverage). These tests cover the sidebar-level caller: that it now routes
 * through that boundary atomically before applying anything locally.
 */

/** Typed interface for Sidebar private member access under test. */
type TestSidebar = {
  deleteTag: (tag: Tag) => Promise<void>;
};

/** Typed interface for the plugin surface under test. */
interface TestPlugin extends Partial<RssDashboardPlugin> {
  settings: RssDashboardSettings;
  saveSettings: Mock<() => Promise<void>>;
  commitArticleLabelMembershipChangesBatch: Mock<
    RssDashboardPlugin["commitArticleLabelMembershipChangesBatch"]
  >;
}

function makeFeed(items: Feed["items"]): Feed {
  return {
    feedId: "feed-1",
    title: "Feed One",
    url: "https://example.test/feed.xml",
    folder: "Uncategorized",
    items,
    lastUpdated: 0,
  };
}

describe("Sidebar.deleteTag (FreshRSS facet boundary integration)", () => {
  let app: App;
  let container: HTMLElement;
  let plugin: TestPlugin;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;

  beforeEach(() => {
    app = ObsidianStubs.App.createMock();
    container = createDiv();

    settings = {
      feeds: [],
      folders: [],
      availableTags: [{ name: "Tech", color: "#111111" }],
      display: {
        sidebarRowSpacing: 10,
        sidebarRowIndentation: 20,
        sidebarItemPaddingLeft: 2,
        sidebarItemPaddingRight: 2,
      },
      media: { useDomainIconsRss: false },
    } as unknown as RssDashboardSettings;

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
    };

    callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onAddFolder: vi.fn(),
      onAddSubfolder: vi.fn(),
      onAddFeed: vi.fn(),
      onEditFeed: vi.fn(),
      onDeleteFeed: vi.fn(),
      onDeleteFolder: vi.fn(),
      onRefreshFeeds: vi.fn(),
      onUpdateFeed: vi.fn(),
      onImportOpml: vi.fn(),
      onExportOpml: vi.fn(),
      onToggleSidebar: vi.fn(),
    };

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      commitArticleLabelMembershipChangesBatch: vi.fn().mockResolvedValue({ committed: true }),
    };
  });

  function createSidebar(): Sidebar {
    return new Sidebar(
      app,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
  }

  it("queues one batched facet-boundary commit for every affected article before removing the tag locally", async () => {
    settings.feeds = [
      makeFeed([
        {
          title: "A1",
          link: "https://example.test/a1",
          description: "",
          pubDate: "",
          guid: "guid-1",
          feedTitle: "Feed One",
          feedUrl: "https://example.test/feed.xml",
          coverImage: "",
          tags: [{ name: "Tech", color: "#111111" }],
        },
        {
          title: "A2",
          link: "https://example.test/a2",
          description: "",
          pubDate: "",
          guid: "guid-2",
          feedTitle: "Feed One",
          feedUrl: "https://example.test/feed.xml",
          coverImage: "",
          tags: [{ name: "Tech", color: "#111111" }, { name: "Other", color: "#222222" }],
        },
        {
          title: "A3 (no Tech tag)",
          link: "https://example.test/a3",
          description: "",
          pubDate: "",
          guid: "guid-3",
          feedTitle: "Feed One",
          feedUrl: "https://example.test/feed.xml",
          coverImage: "",
          tags: [{ name: "Other", color: "#222222" }],
        },
      ]),
    ];

    const sidebar = createSidebar();
    const ts = sidebar as unknown as TestSidebar;
    await ts.deleteTag({ name: "Tech", color: "#111111" });

    // Exactly one batched call, covering only the two articles that had the tag.
    expect(plugin.commitArticleLabelMembershipChangesBatch).toHaveBeenCalledTimes(1);
    const [batchArg] = plugin.commitArticleLabelMembershipChangesBatch.mock.calls[0];
    expect(batchArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ articleGuid: "guid-1", nextTags: [] }),
        expect.objectContaining({
          articleGuid: "guid-2",
          nextTags: [{ name: "Other", color: "#222222" }],
        }),
      ]),
    );
    expect(batchArg).toHaveLength(2);

    // Local state applied after the boundary call resolves successfully.
    expect(settings.feeds[0].items[0].tags).toEqual([]);
    expect(settings.feeds[0].items[1].tags).toEqual([{ name: "Other", color: "#222222" }]);
    expect(settings.feeds[0].items[2].tags).toEqual([{ name: "Other", color: "#222222" }]);
    expect(settings.availableTags).toEqual([]);
    expect(plugin.saveSettings).toHaveBeenCalled();
  });

  it("applies nothing -- keeps the tag defined and on every article -- when the facet-boundary commit fails", async () => {
    plugin.commitArticleLabelMembershipChangesBatch.mockResolvedValue({
      committed: false,
      error: "FreshRSS sync is busy right now. Try again in a moment.",
    });
    settings.feeds = [
      makeFeed([
        {
          title: "A1",
          link: "https://example.test/a1",
          description: "",
          pubDate: "",
          guid: "guid-1",
          feedTitle: "Feed One",
          feedUrl: "https://example.test/feed.xml",
          coverImage: "",
          tags: [{ name: "Tech", color: "#111111" }],
        },
      ]),
    ];

    const sidebar = createSidebar();
    const ts = sidebar as unknown as TestSidebar;
    await ts.deleteTag({ name: "Tech", color: "#111111" });

    expect(settings.feeds[0].items[0].tags).toEqual([{ name: "Tech", color: "#111111" }]);
    expect(settings.availableTags).toEqual([{ name: "Tech", color: "#111111" }]);
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("deletes a tag definition with no articles carrying it without calling the facet boundary with an empty batch unnecessarily", async () => {
    settings.feeds = [];

    const sidebar = createSidebar();
    const ts = sidebar as unknown as TestSidebar;
    await ts.deleteTag({ name: "Tech", color: "#111111" });

    expect(plugin.commitArticleLabelMembershipChangesBatch).toHaveBeenCalledWith([]);
    expect(settings.availableTags).toEqual([]);
    expect(plugin.saveSettings).toHaveBeenCalled();
  });
});
