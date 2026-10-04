/**
 * After the sidebar moves a multi-selection (#615), the dashboard view's own
 * selection must be cleared too, and its article area must follow; when a
 * batch moves the open folder (#611), the view must follow it to its new path.
 * Clearing the moved selection leaves the sidebar tag filter alone (#659).
 * The view owns `selectedFolders`, `selectedFeeds`, `currentFolder` and
 * `selectedTags` and hands them to the inline sidebar and to the navigation
 * drawer, so these tests open the real view and drive the real sidebars rather
 * than a sidebar on its own.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import type { MobileNavigationModal } from "../../../src/modals/mobile-navigation-modal";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import type {
  Feed,
  FeedItem,
  RssDashboardSettings,
} from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const BBC = "https://bbc.example/feed";
const KAGI = "https://kagi.example/feed";
const ROOT = "https://root.example/feed";

const NOTHING_SELECTED = "All articles";
const IMPORTANT = "Important";
const TAG_ONLY = `Tags (OR): ${IMPORTANT}`;

function feed(url: string, folder: string, tags: string[] = []): Feed {
  const item = {
    title: `${url} item`,
    link: `${url}/1`,
    guid: `${url}/1`,
    description: "",
    pubDate: new Date().toUTCString(),
    feedTitle: url,
    feedUrl: url,
    coverImage: "",
    tags: tags.map((name) => ({ name, color: "#e74c3c" })),
  } as FeedItem;
  return { url, title: url, folder, items: [item], lastUpdated: 0 };
}

// onOpen() renders the real sidebar, which needs a workspace stub and the
// display settings it reads for row layout.
function createView(): { view: RssDashboardView; settings: RssDashboardSettings } {
  const app = ObsidianStubs.App.createMock() as unknown as App;
  app.workspace = {
    on: vi.fn(),
    getLeavesOfType: vi.fn().mockReturnValue([]),
    onLayoutReady: vi.fn(),
  } as unknown as App["workspace"];
  const leaf = {
    view: null,
    setViewState: vi.fn(),
    app,
  } as unknown as WorkspaceLeaf;
  const settings = {
    // BBC's one article carries the tag the #659 tests filter by.
    feeds: [feed(BBC, "Bulk", [IMPORTANT]), feed(KAGI, "Smallweb"), feed(ROOT, "")],
    folders: [
      { name: "Bulk", subfolders: [] },
      { name: "Empty", subfolders: [] },
      { name: "Smallweb", subfolders: [] },
    ],
    collapsedFolders: [],
    display: {
      sidebarRowSpacing: 10,
      sidebarRowIndentation: 20,
      sidebarItemPaddingLeft: 2,
      sidebarItemPaddingRight: 2,
    },
    availableTags: [{ name: IMPORTANT, color: "#e74c3c" }],
    dashboardMultiFilters: {},
    articleFilter: { type: "age", value: 0 },
    viewStyle: "list",
  } as unknown as RssDashboardSettings;
  const plugin = {
    app,
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    removeCachedImagesForDeletedFeed: vi.fn().mockResolvedValue(undefined),
  } as unknown as RssDashboardPlugin;
  return { view: new RssDashboardView(leaf, plugin), settings };
}

/** A drag payload that records what the real dragstart handler writes. */
class FakeDataTransfer {
  private data = new Map<string, string>();
  effectAllowed = "";
  dropEffect = "";
  get types(): string[] {
    return [...this.data.keys()];
  }
  setData(key: string, value: string): void {
    this.data.set(key, value);
  }
  getData(key: string): string {
    return this.data.get(key) ?? "";
  }
}

function dragEvent(type: string, dataTransfer: FakeDataTransfer): DragEvent {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: 0 });
  return event;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

const folderRow = (path: string) => `[data-folder-path="${path}"]`;
const feedRow = (url: string) => `[data-feed-url="${url}"]`;
// A folder's feed list: a drop there sends even one folder to the batch move.
function folderFeedList(root: HTMLElement, path: string): HTMLElement {
  const list = find(root, folderRow(path)).parentElement?.querySelector<HTMLElement>(
    ":scope > .rss-dashboard-folder-feeds",
  );
  expect(list).toBeTruthy();
  return list!;
}

function find(root: HTMLElement, selector: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(selector);
  expect(el).not.toBeNull();
  return el!;
}

function ctrlClick(root: HTMLElement, selector: string): void {
  find(root, selector).dispatchEvent(
    new MouseEvent("click", { bubbles: true, ctrlKey: true }),
  );
}

/** Drags `from` with the sidebar's own payload and drops it on `onto`. */
async function dragAndDrop(
  root: HTMLElement,
  from: string,
  onto: string | HTMLElement,
): Promise<void> {
  const dataTransfer = new FakeDataTransfer();
  find(root, from).dispatchEvent(dragEvent("dragstart", dataTransfer));
  const target = typeof onto === "string" ? find(root, onto) : onto;
  target.dispatchEvent(dragEvent("drop", dataTransfer));
  await flushPromises();
}

/** Opens the sidebar's tag list from the toolbar and toggles `tag` there. */
function toggleSidebarTag(root: HTMLElement, tag: string): void {
  find(root, '[aria-label="Tags"]').click();
  const row = [
    ...root.querySelectorAll<HTMLElement>(".rss-dashboard-sidebar-tag-row"),
  ].find(
    (r) =>
      r.querySelector(".rss-dashboard-sidebar-tag-label")?.textContent === tag,
  );
  expect(row).toBeDefined();
  row?.click();
}

function selectedSidebarTags(root: HTMLElement): string[] {
  return [
    ...root.querySelectorAll(
      ".rss-dashboard-sidebar-tag-row.is-selected .rss-dashboard-sidebar-tag-label",
    ),
  ].map((label) => label.textContent ?? "");
}

function chooseMenuItem(title: string): void {
  const item = ObsidianStubs.Menu.lastItems.find((i) => i.title === title);
  expect(item).toBeDefined();
  item?.trigger();
}

describe("Dashboard selection after the sidebar moves or deletes it (#615)", () => {
  let view: RssDashboardView;
  let settings: RssDashboardSettings;

  const containerEl = (): HTMLElement =>
    (view as unknown as { containerEl: HTMLElement }).containerEl;
  const heading = (): string =>
    find(containerEl(), ".rss-dashboard-articles-title").textContent ?? "";
  const feedFolder = (url: string): string | undefined =>
    settings.feeds.find((f) => f.url === url)?.folder;
  const viewTags = (): string[] =>
    (view as unknown as { selectedTags: string[] }).selectedTags;

  afterEach(() => {
    (
      view as unknown as { mobileSidebarModal: MobileNavigationModal | null }
    ).mobileSidebarModal?.close();
    document.body.empty();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("in the inline sidebar", () => {
    beforeEach(async () => {
      ({ view, settings } = createView());
      await view.onOpen();
    });

    function selectBulkAndEmpty(): void {
      ctrlClick(containerEl(), folderRow("Bulk"));
      ctrlClick(containerEl(), folderRow("Empty"));
      expect(view.selectedFolders).toEqual(["Bulk", "Empty"]);
      expect(heading()).toBe("Folders: Bulk, Empty (Feeds: 1)");
    }

    it("keeps selected feeds available to the sidebar after a refresh-only redraw (#653)", () => {
      ctrlClick(containerEl(), feedRow(BBC));
      ctrlClick(containerEl(), feedRow(ROOT));
      expect(view.selectedFeeds).toEqual([BBC, ROOT]);
      expect(
        containerEl().querySelectorAll(".rss-dashboard-feed.multi-selected"),
      ).toHaveLength(2);

      view.refreshSidebarOnly();

      expect(
        containerEl().querySelectorAll(".rss-dashboard-feed.multi-selected"),
      ).toHaveLength(2);
      const dataTransfer = new FakeDataTransfer();
      find(containerEl(), feedRow(BBC)).dispatchEvent(
        dragEvent("dragstart", dataTransfer),
      );
      expect(JSON.parse(dataTransfer.getData("feed-urls"))).toEqual([BBC, ROOT]);

      find(containerEl(), feedRow(BBC)).dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      expect(ObsidianStubs.Menu.lastItems.map((item) => item.title)).toContain(
        "Move selection to folder",
      );
      expect(ObsidianStubs.Menu.lastItems.map((item) => item.title)).not.toContain(
        "Update feed",
      );
    });

    it("clears the view's selection and shows all articles after dragging selected folders onto a folder", async () => {
      selectBulkAndEmpty();

      await dragAndDrop(containerEl(), folderRow("Bulk"), folderRow("Smallweb"));

      expect(feedFolder(BBC)).toBe("Smallweb/Bulk");
      expect(view.selectedFolders).toEqual([]);
      expect(view.selectedFeeds).toEqual([]);
      expect(heading()).toBe(NOTHING_SELECTED);
      // The next re-render of the view keeps showing all articles.
      view.render();
      expect(heading()).toBe(NOTHING_SELECTED);
    });

    it("clears the view's selection after 'Move selection to folder'", async () => {
      selectBulkAndEmpty();

      find(containerEl(), folderRow("Bulk")).dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      chooseMenuItem("Move selection to folder");
      chooseMenuItem("Smallweb");
      await flushPromises();

      expect(feedFolder(BBC)).toBe("Smallweb/Bulk");
      expect(view.selectedFolders).toEqual([]);
      expect(view.selectedFeeds).toEqual([]);
      expect(heading()).toBe(NOTHING_SELECTED);
    });

    it("clears the view's selection after dropping selected feeds on another feed", async () => {
      ctrlClick(containerEl(), feedRow(BBC));
      ctrlClick(containerEl(), feedRow(ROOT));
      expect(view.selectedFeeds).toEqual([BBC, ROOT]);

      await dragAndDrop(containerEl(), feedRow(BBC), feedRow(KAGI));

      expect(feedFolder(BBC)).toBe("Smallweb");
      expect(feedFolder(ROOT)).toBe("Smallweb");
      expect(view.selectedFolders).toEqual([]);
      expect(view.selectedFeeds).toEqual([]);
      expect(heading()).toBe(NOTHING_SELECTED);
    });

    it("leaves the open folder alone when a single unselected feed is dragged", async () => {
      find(containerEl(), folderRow("Smallweb")).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      expect(heading()).toBe("Smallweb");

      await dragAndDrop(containerEl(), feedRow(ROOT), folderRow("Bulk"));

      expect(feedFolder(ROOT)).toBe("Bulk");
      expect(view.currentFolder).toBe("Smallweb");
      expect(heading()).toBe("Smallweb");
    });

    it("clears the view's selection after 'Delete selection'", () => {
      selectBulkAndEmpty();

      find(containerEl(), folderRow("Bulk")).dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      chooseMenuItem("Delete selection");
      find(document.body, ".rss-folder-name-modal-ok").click();

      expect(settings.folders.map((f) => f.name)).toEqual(["Smallweb"]);
      expect(view.selectedFolders).toEqual([]);
      expect(view.selectedFeeds).toEqual([]);
      expect(heading()).toBe(NOTHING_SELECTED);
    });
  });

  describe("the open folder after a batch moves it (#611)", () => {
    beforeEach(async () => {
      ({ view, settings } = createView());
      await view.onOpen();
    });

    it("follows the open folder dropped on another folder's feed list", async () => {
      find(containerEl(), folderRow("Bulk")).dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      expect(view.currentFolder).toBe("Bulk");

      await dragAndDrop(
        containerEl(),
        folderRow("Bulk"),
        folderFeedList(containerEl(), "Smallweb"),
      );

      expect(feedFolder(BBC)).toBe("Smallweb/Bulk");
      expect(view.currentFolder).toBe("Smallweb/Bulk");
      expect(heading()).toBe("Smallweb/Bulk");
      view.render();
      expect(heading()).toBe("Smallweb/Bulk");
    });

    it("follows a lone selected folder moved with 'Move selection to folder'", async () => {
      ctrlClick(containerEl(), folderRow("Bulk"));
      expect(view.currentFolder).toBe("Bulk");
      expect(view.selectedFolders).toEqual(["Bulk"]);

      find(containerEl(), folderRow("Bulk")).dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      chooseMenuItem("Move selection to folder");
      chooseMenuItem("Smallweb");
      await flushPromises();

      expect(view.currentFolder).toBe("Smallweb/Bulk");
      expect(view.selectedFolders).toEqual([]);
      expect(heading()).toBe("Smallweb/Bulk");
    });
  });

  describe("in the navigation drawer", () => {
    let drawer: HTMLElement;

    beforeEach(async () => {
      // A viewport this narrow puts the dashboard in drawer mode.
      vi.stubGlobal("innerWidth", 1000);
      ({ view, settings } = createView());
      await view.onOpen();
      view.openMobileSidebar();
      const modal = (
        view as unknown as { mobileSidebarModal: MobileNavigationModal | null }
      ).mobileSidebarModal;
      expect(modal).not.toBeNull();
      drawer = modal!.contentEl;

      ctrlClick(drawer, folderRow("Bulk"));
      ctrlClick(drawer, folderRow("Empty"));
      expect(view.selectedFolders).toEqual(["Bulk", "Empty"]);
      expect(heading()).toBe("Folders: Bulk, Empty (Feeds: 1)");
    });

    it("clears the view's selection after dragging selected folders onto a folder", async () => {
      await dragAndDrop(drawer, folderRow("Bulk"), folderRow("Smallweb"));

      expect(feedFolder(BBC)).toBe("Smallweb/Bulk");
      expect(view.selectedFolders).toEqual([]);
      expect(view.selectedFeeds).toEqual([]);
      expect(heading()).toBe(NOTHING_SELECTED);
      expect(
        drawer.querySelectorAll(".rss-dashboard-feed-folder-header.multi-selected"),
      ).toHaveLength(0);
    });

    it("clears the view's selection after 'Delete selection'", () => {
      find(drawer, folderRow("Bulk")).dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
      chooseMenuItem("Delete selection");
      find(document.body, ".rss-folder-name-modal-ok").click();

      expect(settings.folders.map((f) => f.name)).toEqual(["Smallweb"]);
      expect(view.selectedFolders).toEqual([]);
      expect(view.selectedFeeds).toEqual([]);
      expect(heading()).toBe(NOTHING_SELECTED);
    });

    it("keeps the sidebar tag filter after moving the selection (#659)", async () => {
      toggleSidebarTag(drawer, IMPORTANT);
      expect(heading()).toBe(`Folders: Bulk, Empty (Feeds: 1) & ${TAG_ONLY}`);

      await dragAndDrop(drawer, feedRow(ROOT), folderRow("Smallweb"));

      expect(feedFolder(BBC)).toBe("Smallweb/Bulk");
      expect(view.selectedFolders).toEqual([]);
      expect(viewTags()).toEqual([IMPORTANT]);
      expect(heading()).toBe(TAG_ONLY);
      expect(selectedSidebarTags(drawer)).toEqual([IMPORTANT]);
    });
  });

  describe("the sidebar tag filter after a moved selection (#659)", () => {
    beforeEach(async () => {
      ({ view, settings } = createView());
      await view.onOpen();
    });

    it("keeps the tag filter when a dragged feed carries the selected folders", async () => {
      ctrlClick(containerEl(), folderRow("Bulk"));
      ctrlClick(containerEl(), folderRow("Empty"));
      toggleSidebarTag(containerEl(), IMPORTANT);
      expect(heading()).toBe(`Folders: Bulk, Empty (Feeds: 1) & ${TAG_ONLY}`);

      // The selected folders travel with a drag of any sidebar row.
      await dragAndDrop(containerEl(), feedRow(ROOT), folderRow("Smallweb"));

      expect(feedFolder(ROOT)).toBe("Smallweb");
      expect(feedFolder(BBC)).toBe("Smallweb/Bulk");
      expect(view.selectedFolders).toEqual([]);
      expect(view.selectedFeeds).toEqual([]);
      expect(viewTags()).toEqual([IMPORTANT]);
      expect(heading()).toBe(TAG_ONLY);
      expect(selectedSidebarTags(containerEl())).toEqual([IMPORTANT]);
      view.render();
      expect(heading()).toBe(TAG_ONLY);
    });

    it("keeps the tag filter when selected feeds are dropped on another feed", async () => {
      ctrlClick(containerEl(), feedRow(BBC));
      ctrlClick(containerEl(), feedRow(ROOT));
      toggleSidebarTag(containerEl(), IMPORTANT);
      expect(view.selectedFeeds).toEqual([BBC, ROOT]);
      expect(viewTags()).toEqual([IMPORTANT]);

      await dragAndDrop(containerEl(), feedRow(BBC), feedRow(KAGI));

      expect(feedFolder(BBC)).toBe("Smallweb");
      expect(view.selectedFeeds).toEqual([]);
      expect(viewTags()).toEqual([IMPORTANT]);
      expect(heading()).toBe(TAG_ONLY);
    });
  });
});
