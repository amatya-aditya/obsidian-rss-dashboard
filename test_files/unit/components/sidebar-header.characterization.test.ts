/**
 * Characterization tests for `Sidebar.renderHeader`, pinned before it is
 * extracted (#625, part of #436). They describe what the icon toolbar does
 * today, quirks included, and must keep passing unchanged through the
 * extraction.
 *
 * Almost everything runs through `Sidebar.render()` or `renderHeader(parent)`
 * and real DOM events on the rendered buttons. The few spies on `Sidebar`
 * methods (`showAddFeedModal`, `fireIconAction`, `updateIconRowFades`,
 * `addHorizontalScrollBehavior`) are the methods the header calls back into;
 * they stay on `Sidebar` as delegates. Expected icons, labels and menu titles
 * are written out by hand, not read from the icon registry.
 */
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type Mock,
  type MockInstance,
} from "vitest";
import {
  Sidebar,
  type SidebarCallbacks,
  type SidebarOptions,
} from "../../../src/components/sidebar";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { Folder, RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const COACHMARK_KEY = "rss-first-launch-coachmark-shown";
const COACHMARK_TEXT = "Add your first feed here";

/** What the default toolbar shows, left to right (`divider` is the separator). */
const DEFAULT_ROW = [
  "Discover",
  "divider",
  "Add feed",
  "Manage feeds",
  "Search",
  "Tags",
  "Add folder",
  "Sort",
  "Collapse all",
  "Settings",
];

const ICON_FOR_LABEL: Record<string, string> = {
  Discover: "compass",
  "Add feed": "plus-circle",
  "Manage feeds": "pencil",
  Search: "search",
  Tags: "tags",
  "Add folder": "folder-plus",
  Sort: "sort-asc",
  "Collapse all": "chevrons-up-down",
  Settings: "settings",
};

const HIDE_KEY_FOR_ID: Record<string, string> = {
  discover: "hideIconDiscover",
  divider: "hideIconDivider",
  addFeed: "hideIconAddFeed",
  manageFeeds: "hideIconManageFeeds",
  search: "hideIconSearch",
  tags: "hideIconTags",
  addFolder: "hideIconAddFolder",
  sort: "hideIconSort",
  collapseAll: "hideIconCollapseAll",
  settings: "hideIconSettings",
};

const LABEL_FOR_ID: Record<string, string> = {
  discover: "Discover",
  addFeed: "Add feed",
  manageFeeds: "Manage feeds",
  search: "Search",
  tags: "Tags",
  addFolder: "Add folder",
  sort: "Sort",
  collapseAll: "Collapse all",
  settings: "Settings",
};

const SORT_MENU_TITLES = [
  "Custom",
  "Feed name (a to z)",
  "Feed name (z to a)",
  "Unread count (high to low)",
  "Unread count (low to high)",
  "Folder name (a to z)",
  "Folder name (z to a)",
  "Modified time (new to old)",
  "Modified time (old to new)",
  "Created time (new to old)",
  "Created time (old to new)",
];

interface SidebarInternals {
  showAddFeedModal: (folder?: string) => void;
  fireIconAction: (id: string, e?: MouseEvent) => void;
  updateIconRowFades: () => void;
  addHorizontalScrollBehavior: (iconRow: HTMLElement) => void;
  iconBtnEls: Map<string, HTMLElement>;
  iconActions: Map<string, (e?: MouseEvent) => void>;
}

type TestApp = InstanceType<typeof ObsidianStubs.App> & {
  setting?: { open?: Mock; openTabById?: Mock };
};

interface TestPlugin {
  settings: RssDashboardSettings;
  saveSettings: Mock;
  activateDiscoverView: Mock;
  manifest: { id: string };
}

function makeFolder(name: string, subfolders: Folder[] = []): Folder {
  return { name, subfolders, modifiedAt: 1 } as Folder;
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe("Sidebar header (characterization)", () => {
  let container: HTMLElement;
  let app: TestApp;
  let settings: RssDashboardSettings;
  let options: SidebarOptions;
  let callbacks: SidebarCallbacks;
  let plugin: TestPlugin;
  let sidebar: Sidebar;
  let internals: SidebarInternals;
  let frames: FrameRequestCallback[];
  let noticeSpy: MockInstance<typeof console.debug>;
  let uncaught: string[];
  // jsdom reports an error thrown inside an event listener as a window
  // "error" event instead of throwing it from dispatchEvent.
  const recordUncaught = (event: ErrorEvent): void => {
    uncaught.push(String(event.message));
    event.preventDefault();
  };

  function build(): void {
    sidebar = new Sidebar(
      app as unknown as import("obsidian").App,
      container,
      plugin as unknown as RssDashboardPlugin,
      settings,
      options,
      callbacks,
    );
    internals = sidebar as unknown as SidebarInternals;
  }

  /** Runs the animation-frame callbacks queued so far (the header queues some). */
  function flushFrames(): void {
    const run = frames;
    frames = [];
    for (const cb of run) cb(0);
  }

  const iconRow = (root: ParentNode = container): HTMLElement =>
    root.querySelector(".rss-dashboard-header-icon-row") as HTMLElement;
  const byLabel = (label: string, root: ParentNode = container): HTMLElement =>
    iconRow(root).querySelector(`[aria-label="${label}"]`) as HTMLElement;
  const button = (id: string): HTMLElement => byLabel(LABEL_FOR_ID[id] ?? id);

  /** One entry per child of the icon row: the aria-label, or "divider". */
  const rowSummary = (root: ParentNode = container): string[] =>
    Array.from(iconRow(root).children).map((el) =>
      el.classList.contains("rss-nav-divider")
        ? "divider"
        : (el.getAttribute("aria-label") ?? "?"),
    );

  const iconOf = (el: HTMLElement): string | undefined => el.dataset.icon;
  const coachmark = (root: ParentNode = container): HTMLElement | null =>
    root.querySelector<HTMLElement>(".rss-dashboard-coachmark");

  const click = (el: HTMLElement): MouseEvent => {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    el.dispatchEvent(event);
    return event;
  };

  /** The text of every Notice shown (the stub logs it through console.debug). */
  function notices(): string[] {
    return noticeSpy.mock.calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => String(call[1]));
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    uncaught = [];
    window.addEventListener("error", recordUncaught);
    frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    // The stub keeps the last menu's items in a static list; start each test empty.
    ObsidianStubs.Menu.lastItems = [];

    container = createDiv();
    document.body.appendChild(container);
    app = ObsidianStubs.App.createMock() as TestApp;

    settings = {
      feeds: [],
      folders: [],
      collapsedFolders: [],
      display: {
        iconOrder: [],
        hideToolbarEntirely: false,
        ...Object.fromEntries(
          Object.values(HIDE_KEY_FOR_ID).map((key) => [key, false]),
        ),
      },
      availableTags: [],
    } as unknown as RssDashboardSettings;

    options = {
      currentFolder: null,
      currentFeed: null,
      selectedTags: [],
      tagsCollapsed: true,
      collapsedFolders: [],
      selectedFolders: [],
      selectedFeeds: [],
    };

    callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onToggleTagsCollapse: vi.fn(),
      onToggleFolderCollapse: vi.fn(),
      onToggleSidebar: vi.fn(),
      onAddFolder: vi.fn(),
      onActivateDiscover: vi.fn(),
      onManageFeeds: vi.fn(),
      onBatchToggleFolders: vi.fn(),
    } as unknown as SidebarCallbacks;

    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      activateDiscoverView: vi.fn().mockResolvedValue(undefined),
      manifest: { id: "rss-dashboard" },
    };
  });

  afterEach(() => {
    window.removeEventListener("error", recordUncaught);
    expect(uncaught).toEqual([]);
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  describe("structure", () => {
    it("renders the toolbar inside the controls surface at the top of the sidebar", () => {
      build();
      sidebar.render();

      const surface = container.querySelector(
        ".rss-dashboard-sidebar-controls-surface",
      ) as HTMLElement;
      expect(container.firstElementChild).toBe(surface);
      expect(surface.firstElementChild?.className).toBe("rss-dashboard-header");
    });

    it("wraps the icon row in a wrapper inside the header", () => {
      build();
      sidebar.render();

      const header = container.querySelector(".rss-dashboard-header")!;
      expect(header.children).toHaveLength(1);
      const wrapper = header.firstElementChild as HTMLElement;
      expect(wrapper.className).toBe("rss-icon-row-wrapper");
      expect(wrapper.children).toHaveLength(1);
      expect(wrapper.firstElementChild?.className).toBe(
        "rss-dashboard-header-icon-row",
      );
    });

    it("appends the header to the parent it is given", () => {
      build();
      const parent = createDiv();

      sidebar.renderHeader(parent);

      expect(
        parent.querySelector(":scope > .rss-dashboard-header"),
      ).not.toBeNull();
      expect(container.querySelector(".rss-dashboard-header")).toBeNull();
    });

    it("appends the header to the sidebar container when no parent is given", () => {
      build();

      sidebar.renderHeader();

      expect(
        container.querySelector(":scope > .rss-dashboard-header"),
      ).not.toBeNull();
    });

    it("shows every icon in the default order when no order is stored", () => {
      build();
      sidebar.render();

      expect(rowSummary()).toEqual(DEFAULT_ROW);
    });

    it("falls back to the default order when the stored order is missing", () => {
      delete (settings.display as { iconOrder?: string[] }).iconOrder;
      build();
      sidebar.render();

      expect(rowSummary()).toEqual(DEFAULT_ROW);
    });

    it("renders each button as an accessible clickable icon with its glyph", () => {
      build();
      sidebar.render();

      for (const label of Object.keys(ICON_FOR_LABEL)) {
        const btn = byLabel(label);
        expect(btn, label).not.toBeNull();
        expect(btn.tagName, label).toBe("BUTTON");
        expect(btn.getAttribute("type"), label).toBe("button");
        expect(btn.classList.contains("clickable-icon"), label).toBe(true);
        expect(btn.hasAttribute("role"), label).toBe(false);
        expect(btn.hasAttribute("tabindex"), label).toBe(false);
        expect(iconOf(btn), label).toBe(ICON_FOR_LABEL[label]);
      }
    });

    it("renders the divider as a plain separator element, not a button", () => {
      build();
      sidebar.render();

      const divider = iconRow().querySelector(
        ".rss-nav-divider",
      ) as HTMLElement;
      expect(divider.tagName).toBe("DIV");
      expect(divider.getAttribute("role")).toBeNull();
      expect(divider.getAttribute("tabindex")).toBeNull();
      expect(divider.classList.contains("clickable-icon")).toBe(false);
      expect(divider.textContent).toBe("");
      expect(iconRow().children[1]).toBe(divider);
    });

    it("follows a stored order, and leaves out icons the order does not list", () => {
      settings.display.iconOrder = [
        "settings",
        "search",
        "divider",
        "discover",
      ];
      build();
      sidebar.render();

      expect(rowSummary()).toEqual([
        "Settings",
        "Search",
        "divider",
        "Discover",
      ]);
    });

    it("skips ids that are not known icons", () => {
      settings.display.iconOrder = ["bogus", "search", "dashboard", "tags"];
      build();
      sidebar.render();

      expect(rowSummary()).toEqual(["Search", "Tags"]);
    });

    it.each(Object.keys(HIDE_KEY_FOR_ID))(
      "leaves out the %s icon when its hide setting is on",
      (id) => {
        (settings.display as unknown as Record<string, boolean>)[
          HIDE_KEY_FOR_ID[id]
        ] = true;
        build();
        sidebar.render();

        const expected = DEFAULT_ROW.filter((entry) =>
          id === "divider" ? entry !== "divider" : entry !== LABEL_FOR_ID[id],
        );
        expect(rowSummary()).toEqual(expected);
      },
    );

    it("renders an icon once per entry when the order repeats it", () => {
      settings.display.iconOrder = ["search", "divider", "search", "divider"];
      build();
      sidebar.render();

      expect(rowSummary()).toEqual(["Search", "divider", "Search", "divider"]);
    });

    it("registers each button under its id, the divider too, and the last repeat wins", () => {
      settings.display.iconOrder = ["search", "divider", "search", "tags"];
      build();
      sidebar.render();

      expect(Array.from(internals.iconBtnEls.keys())).toEqual([
        "search",
        "divider",
        "tags",
      ]);
      const searches = iconRow().querySelectorAll('[aria-label="Search"]');
      expect(searches).toHaveLength(2);
      expect(internals.iconBtnEls.get("search")).toBe(searches[1]);
      expect(internals.iconBtnEls.get("divider")).toBe(
        iconRow().querySelector(".rss-nav-divider"),
      );
    });

    it("registers a keyboard action for every button except sort and the divider", () => {
      build();
      sidebar.render();

      expect(Array.from(internals.iconActions.keys())).toEqual([
        "discover",
        "addFeed",
        "manageFeeds",
        "search",
        "tags",
        "addFolder",
        "collapseAll",
        "settings",
      ]);
    });

    it("forgets the buttons of an earlier render", () => {
      build();
      sidebar.render();
      const firstSearch = internals.iconBtnEls.get("search");

      sidebar.render();

      expect(internals.iconBtnEls.size).toBe(10);
      expect(internals.iconBtnEls.get("search")).not.toBe(firstSearch);
      expect(internals.iconBtnEls.get("search")).toBe(button("search"));
    });

    it("leaves an earlier header in place when it renders another one", () => {
      build();
      const first = createDiv();
      const second = createDiv();

      sidebar.renderHeader(first);
      sidebar.renderHeader(second);

      expect(rowSummary(first)).toEqual(DEFAULT_ROW);
      expect(rowSummary(second)).toEqual(DEFAULT_ROW);
      expect(internals.iconBtnEls.get("search")).toBe(
        byLabel("Search", second),
      );
    });

    it("renders only an empty header, and clears the registries, when the toolbar is hidden", () => {
      build();
      const first = createDiv();
      sidebar.renderHeader(first);
      expect(internals.iconBtnEls.size).toBe(10);
      expect(internals.iconActions.size).toBe(8);

      settings.display.hideToolbarEntirely = true;
      const second = createDiv();
      sidebar.renderHeader(second);

      const header = second.querySelector(
        ".rss-dashboard-header",
      ) as HTMLElement;
      expect(header.children).toHaveLength(0);
      expect(internals.iconBtnEls.size).toBe(0);
      expect(internals.iconActions.size).toBe(0);
      expect(rowSummary(first)).toEqual(DEFAULT_ROW);
    });

    it("shows no coachmark and no scroll behavior when the toolbar is hidden", () => {
      settings.display.hideToolbarEntirely = true;
      build();
      const scrollBehavior = vi.spyOn(internals, "addHorizontalScrollBehavior");

      sidebar.render();

      expect(coachmark()).toBeNull();
      expect(scrollBehavior).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10_000);
      expect(app.loadLocalStorage(COACHMARK_KEY)).toBeUndefined();
    });

    it("keeps the header buttons out of the search dock that follows it", () => {
      build();
      sidebar.render();
      click(button("search"));

      const surface = container.querySelector(
        ".rss-dashboard-sidebar-controls-surface",
      ) as HTMLElement;
      expect(Array.from(surface.children).map((el) => el.className)).toEqual([
        "rss-dashboard-header",
        "rss-dashboard-search-dock",
      ]);
    });
  });

  describe("toggle state", () => {
    it("shows search and tags as not pressed until they are switched on", () => {
      build();
      sidebar.render();

      for (const id of ["search", "tags"]) {
        expect(button(id).classList.contains("is-active"), id).toBe(false);
        expect(button(id).getAttribute("aria-pressed"), id).toBe("false");
      }
    });

    it("gives only search and tags a pressed state", () => {
      build();
      sidebar.render();

      for (const label of Object.keys(ICON_FOR_LABEL)) {
        if (label === "Search" || label === "Tags") continue;
        expect(byLabel(label).hasAttribute("aria-pressed"), label).toBe(false);
        expect(byLabel(label).classList.contains("is-active"), label).toBe(
          false,
        );
      }
    });

    it("marks the search button active and pressed once search is open", () => {
      build();
      sidebar.render();

      click(button("search"));

      expect(button("search").classList.contains("is-active")).toBe(true);
      expect(button("search").getAttribute("aria-pressed")).toBe("true");
      expect(button("tags").getAttribute("aria-pressed")).toBe("false");
    });

    it("marks the tags button active and pressed once tags are open", () => {
      build();
      sidebar.render();

      click(button("tags"));

      expect(button("tags").classList.contains("is-active")).toBe(true);
      expect(button("tags").getAttribute("aria-pressed")).toBe("true");
      expect(button("search").getAttribute("aria-pressed")).toBe("false");
    });
  });

  describe("discover button", () => {
    it("calls the discover callback when the view provides one", () => {
      build();
      sidebar.render();

      click(button("discover"));

      expect(callbacks.onActivateDiscover).toHaveBeenCalledTimes(1);
      expect(plugin.activateDiscoverView).not.toHaveBeenCalled();
    });

    it("asks the plugin to open Discover when there is no callback", () => {
      delete callbacks.onActivateDiscover;
      build();
      sidebar.render();

      click(button("discover"));

      expect(plugin.activateDiscoverView).toHaveBeenCalledTimes(1);
    });

    it("looks the callback up when the button is used, not when it is drawn", () => {
      build();
      sidebar.render();
      const late = vi.fn();
      callbacks.onActivateDiscover = late;

      click(button("discover"));

      expect(late).toHaveBeenCalledTimes(1);
    });
  });

  describe("manage feeds button", () => {
    it("calls the manage feeds callback", () => {
      build();
      sidebar.render();

      click(button("manageFeeds"));

      expect(callbacks.onManageFeeds).toHaveBeenCalledTimes(1);
    });

    it("does nothing when there is no callback", () => {
      delete callbacks.onManageFeeds;
      build();
      sidebar.render();

      expect(() => click(button("manageFeeds"))).not.toThrow();
      expect(notices()).toEqual([]);
    });
  });

  describe("add feed button and the first-launch coachmark", () => {
    let showAddFeedModal: MockInstance<(folder?: string) => void>;

    beforeEach(() => {
      build();
      showAddFeedModal = vi
        .spyOn(internals, "showAddFeedModal")
        .mockImplementation(() => undefined);
    });

    it("opens the add feed dialog with no folder preselected", () => {
      sidebar.render();

      click(button("addFeed"));

      expect(showAddFeedModal).toHaveBeenCalledTimes(1);
      expect(showAddFeedModal).toHaveBeenCalledWith();
    });

    it("uses a native button for built-in keyboard activation", () => {
      sidebar.render();

      expect(button("addFeed").tagName).toBe("BUTTON");
      expect(button("addFeed").getAttribute("type")).toBe("button");
    });

    it("shows the coachmark inside the add feed button until the flag is stored", () => {
      sidebar.render();

      const mark = coachmark()!;
      expect(mark.textContent).toBe(COACHMARK_TEXT);
      expect(mark.parentElement).toBe(button("addFeed"));
      expect(mark.tagName).toBe("DIV");
    });

    it("shows no coachmark once the flag is stored", () => {
      app.saveLocalStorage(COACHMARK_KEY, "true");

      sidebar.render();

      expect(coachmark()).toBeNull();
    });

    it("counts any stored value as shown", () => {
      app.saveLocalStorage(COACHMARK_KEY, "false");

      sidebar.render();

      expect(coachmark()).toBeNull();
    });

    it("shows no coachmark when the add feed button is hidden", () => {
      (settings.display as unknown as Record<string, boolean>).hideIconAddFeed =
        true;

      sidebar.render();

      expect(coachmark()).toBeNull();
    });

    it("shows no coachmark when the order leaves the add feed button out", () => {
      settings.display.iconOrder = ["search", "tags"];

      sidebar.render();

      expect(coachmark()).toBeNull();
    });

    it("stores the flag and removes the coachmark the first time the button is used", () => {
      const save = vi.spyOn(app, "saveLocalStorage");
      sidebar.render();

      click(button("addFeed"));

      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(COACHMARK_KEY, "true");
      expect(coachmark()).toBeNull();
      expect(showAddFeedModal).toHaveBeenCalledTimes(1);
    });

    it("does not store the flag again on later uses, nor after the timer", () => {
      const save = vi.spyOn(app, "saveLocalStorage");
      sidebar.render();
      click(button("addFeed"));

      click(button("addFeed"));
      vi.advanceTimersByTime(10_000);

      expect(save).toHaveBeenCalledTimes(1);
      expect(showAddFeedModal).toHaveBeenCalledTimes(2);
    });

    it("opens the dialog before it stores the flag", () => {
      const order: string[] = [];
      showAddFeedModal.mockImplementation(() => {
        order.push("modal");
      });
      vi.spyOn(app, "saveLocalStorage").mockImplementation(() => {
        order.push("save");
      });
      sidebar.render();

      click(button("addFeed"));

      expect(order).toEqual(["modal", "save"]);
    });

    it("leaves the coachmark and the flag alone when the button is used after the flag is stored", () => {
      sidebar.render();
      app.saveLocalStorage(COACHMARK_KEY, "true");
      const save = vi.spyOn(app, "saveLocalStorage");

      click(button("addFeed"));

      expect(save).not.toHaveBeenCalled();
      expect(coachmark()).not.toBeNull();
    });

    it("stores the flag and removes the coachmark after five seconds", () => {
      const save = vi.spyOn(app, "saveLocalStorage");
      sidebar.render();

      vi.advanceTimersByTime(4999);
      expect(coachmark()).not.toBeNull();
      expect(save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(coachmark()).toBeNull();
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(COACHMARK_KEY, "true");
    });

    it("removes the coachmark without storing the flag again when it was stored elsewhere before the timer (#628)", () => {
      const save = vi.spyOn(app, "saveLocalStorage");
      sidebar.render();
      vi.advanceTimersByTime(3000);
      app.saveLocalStorage(COACHMARK_KEY, "true");
      save.mockClear();

      vi.advanceTimersByTime(5000);

      expect(save).not.toHaveBeenCalled();
      expect(coachmark()).toBeNull();
    });

    it("draws one coachmark per render, and the first timer to fire stores the flag once", () => {
      const save = vi.spyOn(app, "saveLocalStorage");
      sidebar.render();
      sidebar.render();

      expect(
        container.querySelectorAll(".rss-dashboard-coachmark"),
      ).toHaveLength(1);
      vi.advanceTimersByTime(5000);

      expect(save).toHaveBeenCalledTimes(1);
    });

    it("removes the visible coachmark after five seconds when the sidebar was redrawn meanwhile (#628)", () => {
      sidebar.render();
      vi.advanceTimersByTime(2000);
      sidebar.render();
      const visible = coachmark()!;

      vi.advanceTimersByTime(5000);

      expect(app.loadLocalStorage(COACHMARK_KEY)).toBe("true");
      expect(visible.isConnected).toBe(false);
      expect(coachmark()).toBeNull();
    });

    it("removes the coachmark five seconds after it was first shown, even after a redraw (#628)", () => {
      sidebar.render();
      vi.advanceTimersByTime(2000);
      sidebar.render();

      vi.advanceTimersByTime(2999);
      expect(coachmark()).not.toBeNull();

      vi.advanceTimersByTime(1);
      expect(coachmark()).toBeNull();
    });

    it("draws the coachmark in a header rendered into another parent too", () => {
      const parent = createDiv();

      sidebar.renderHeader(parent);

      expect(coachmark(parent)?.textContent).toBe(COACHMARK_TEXT);
    });
  });

  describe("search button", () => {
    let scrollIntoView: MockInstance<Element["scrollIntoView"]>;

    beforeEach(() => {
      build();
      scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView");
      sidebar.render();
      flushFrames();
      scrollIntoView.mockClear();
    });

    it("opens the search dock", () => {
      expect(container.querySelector(".rss-dashboard-search-dock")).toBeNull();

      click(button("search"));

      expect(
        container.querySelector(".rss-dashboard-search-dock"),
      ).not.toBeNull();
    });

    it("closes the search dock when it is used again", () => {
      click(button("search"));

      click(button("search"));

      expect(container.querySelector(".rss-dashboard-search-dock")).toBeNull();
      expect(button("search").classList.contains("is-active")).toBe(false);
      expect(button("search").getAttribute("aria-pressed")).toBe("false");
    });

    it("rebuilds the sidebar, so the button it was used on leaves the page", () => {
      const before = button("search");

      click(before);

      expect(before.isConnected).toBe(false);
      expect(button("search")).not.toBe(before);
    });

    it("focuses, selects and scrolls the search input into view on the next frame", () => {
      const focus = vi.spyOn(HTMLInputElement.prototype, "focus");
      const select = vi.spyOn(HTMLInputElement.prototype, "select");
      click(button("search"));
      const input = container.querySelector(
        ".rss-dashboard-search-input",
      ) as HTMLInputElement;
      expect(document.activeElement).not.toBe(input);

      flushFrames();

      expect(document.activeElement).toBe(input);
      // The dock focuses its own input on a frame, and so does the button; the
      // focus event from the first call selects the text, and the button selects again.
      expect(focus).toHaveBeenCalledTimes(2);
      expect(select).toHaveBeenCalledTimes(2);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    });

    it("does not move focus or scroll when search is closed", () => {
      click(button("search"));
      flushFrames();
      scrollIntoView.mockClear();

      click(button("search"));
      flushFrames();

      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it("does nothing on the next frame when the input is already gone", () => {
      click(button("search"));
      container.empty();

      expect(() => flushFrames()).not.toThrow();
      expect(scrollIntoView).not.toHaveBeenCalledWith({ block: "nearest" });
    });

    it("works from the keyboard", () => {
      click(button("search"));

      expect(
        container.querySelector(".rss-dashboard-search-dock"),
      ).not.toBeNull();
    });
  });

  describe("tags button", () => {
    beforeEach(() => {
      build();
      sidebar.render();
    });

    it("opens the tags section", () => {
      expect(
        container.querySelector(".rss-dashboard-sidebar-tags-section"),
      ).toBeNull();

      click(button("tags"));

      expect(
        container.querySelector(".rss-dashboard-sidebar-tags-section"),
      ).not.toBeNull();
    });

    it("closes the tags section when it is used again", () => {
      click(button("tags"));

      click(button("tags"));

      expect(
        container.querySelector(".rss-dashboard-sidebar-tags-section"),
      ).toBeNull();
      expect(button("tags").getAttribute("aria-pressed")).toBe("false");
    });

    it("keeps search and tags independent", () => {
      click(button("tags"));
      click(button("search"));

      expect(button("tags").getAttribute("aria-pressed")).toBe("true");
      expect(button("search").getAttribute("aria-pressed")).toBe("true");
    });

    it("works from the keyboard", () => {
      click(button("tags"));

      expect(button("tags").getAttribute("aria-pressed")).toBe("true");
    });
  });

  describe("add folder button", () => {
    const modalHeading = (): string | undefined =>
      document.querySelector(".rss-folder-name-modal .setting-item-name")
        ?.textContent ?? undefined;
    const modalInput = (): HTMLInputElement =>
      document.querySelector(
        ".rss-folder-name-modal-input",
      ) as HTMLInputElement;
    const modalOk = (): HTMLElement =>
      document.querySelector(".rss-folder-name-modal-ok") as HTMLElement;
    const modalError = (): string =>
      document.querySelector(".rss-folder-name-modal-error")?.textContent ?? "";

    beforeEach(() => {
      settings.folders = [makeFolder("News"), makeFolder("Archive")];
      build();
      sidebar.render();
    });

    it("opens the folder name dialog titled Add folder", () => {
      expect(document.querySelector(".rss-folder-name-modal")).toBeNull();

      click(button("addFolder"));

      expect(modalHeading()).toBe("Add folder");
      expect(modalInput().value).toBe("");
    });

    it("creates the folder at the top level and redraws the tree", async () => {
      vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
      click(button("addFolder"));
      modalInput().value = "Reading";

      click(modalOk());
      await flushPromises();

      expect(settings.folders.map((f) => f.name)).toEqual([
        "News",
        "Archive",
        "Reading",
      ]);
      expect(settings.folders[2]).toEqual({
        name: "Reading",
        subfolders: [],
        createdAt: 1_700_000_000_000,
        modifiedAt: 1_700_000_000_000,
      });
      expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
      expect(document.querySelector(".rss-folder-name-modal")).toBeNull();
      expect(
        container.querySelector(
          '.rss-dashboard-feed-folder-header[data-folder-path="Reading"]',
        ),
      ).not.toBeNull();
    });

    it("redraws the sidebar twice: once from the folder service and once after it resolves", async () => {
      const render = vi.spyOn(sidebar, "render");
      click(button("addFolder"));
      modalInput().value = "Reading";

      click(modalOk());
      await flushPromises();

      expect(render).toHaveBeenCalledTimes(2);
    });

    it("refuses a name that a top-level folder already uses", async () => {
      click(button("addFolder"));
      modalInput().value = "News";

      click(modalOk());
      await flushPromises();

      expect(modalError()).toBe("A folder with this name already exists.");
      expect(settings.folders).toHaveLength(2);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it("reads the existing folder names when the button is used", () => {
      settings.folders.push(makeFolder("Added later"));

      click(button("addFolder"));
      modalInput().value = "Added later";
      click(modalOk());

      expect(modalError()).toBe("A folder with this name already exists.");
    });

    it("creates nothing when the dialog is cancelled", async () => {
      click(button("addFolder"));
      modalInput().value = "Reading";

      click(
        document.querySelector(".rss-folder-name-modal-cancel") as HTMLElement,
      );
      await flushPromises();

      expect(settings.folders).toHaveLength(2);
      expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it("opens the folder dialog from the button", () => {
      click(button("addFolder"));

      expect(modalHeading()).toBe("Add folder");
    });
  });

  describe("sort button", () => {
    let fireIconAction: MockInstance<(id: string, e?: MouseEvent) => void>;

    beforeEach(() => {
      build();
      fireIconAction = vi.spyOn(internals, "fireIconAction");
      sidebar.render();
    });

    it("opens the sort menu with every ordering, in order", () => {
      click(button("sort"));

      expect(ObsidianStubs.Menu.lastItems.map((item) => item.title)).toEqual(
        SORT_MENU_TITLES,
      );
    });

    it("hands the click event to the sort action once", () => {
      const event = click(button("sort"));

      expect(fireIconAction).toHaveBeenCalledTimes(1);
      expect(fireIconAction).toHaveBeenCalledWith("sort", event);
    });

    it.each([
      ["Enter", "Enter"],
      ["Space", " "],
    ])(
      "opens the sort menu below the button for a keyboard click on %s (#627)",
      (_name, _key) => {
        const sortButton = button("sort");
        vi.spyOn(sortButton, "getBoundingClientRect").mockReturnValue(
          new DOMRect(40, 10, 24, 24),
        );
        const showAtPosition = vi.spyOn(
          ObsidianStubs.Menu.prototype,
          "showAtPosition",
        );

        const event = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          detail: 0,
        });
        sortButton.dispatchEvent(event);

        expect(fireIconAction).toHaveBeenCalledTimes(1);
        expect(fireIconAction).toHaveBeenCalledWith("sort", undefined);
        expect(ObsidianStubs.Menu.lastItems.map((item) => item.title)).toEqual(
          SORT_MENU_TITLES,
        );
        expect(showAtPosition).toHaveBeenCalledWith({ x: 40, y: 34 });
      },
    );
  });

  describe("collapse all button", () => {
    const paths = ["News", "News/Tech", "Archive"];

    beforeEach(() => {
      settings.folders = [
        makeFolder("News", [makeFolder("Tech")]),
        makeFolder("Archive"),
      ];
    });

    it("shows the expand-direction glyph when there are no folders", () => {
      settings.folders = [];
      build();
      sidebar.render();

      expect(iconOf(button("collapseAll"))).toBe("chevrons-up-down");
    });

    it("shows the expand-direction glyph while some folders are open", () => {
      settings.collapsedFolders = ["News", "News/Tech"];
      build();
      sidebar.render();

      expect(iconOf(button("collapseAll"))).toBe("chevrons-up-down");
    });

    it("shows the collapsed glyph once every folder path is collapsed", () => {
      settings.collapsedFolders = [...paths];
      build();
      sidebar.render();

      expect(iconOf(button("collapseAll"))).toBe("chevrons-down-up");
    });

    it("treats a missing collapsed list as nothing collapsed", () => {
      delete (settings as { collapsedFolders?: string[] }).collapsedFolders;
      build();
      sidebar.render();

      expect(iconOf(button("collapseAll"))).toBe("chevrons-up-down");
    });

    it("collapses every folder, says so, and redraws the sidebar", () => {
      build();
      sidebar.render();
      const before = button("collapseAll");

      click(before);

      const [toCollapse, toExpand] = (callbacks.onBatchToggleFolders as Mock)
        .mock.calls[0] as [string[], string[]];
      expect([...toCollapse].sort()).toEqual([...paths].sort());
      expect(toExpand).toEqual([]);
      expect(notices()).toEqual(["All folders collapsed"]);
      expect(before.isConnected).toBe(false);
    });

    it("expands every folder when all are already collapsed", () => {
      settings.collapsedFolders = [...paths];
      build();
      sidebar.render();

      click(button("collapseAll"));

      const [toCollapse, toExpand] = (callbacks.onBatchToggleFolders as Mock)
        .mock.calls[0] as [string[], string[]];
      expect(toCollapse).toEqual([]);
      expect([...toExpand].sort()).toEqual([...paths].sort());
      expect(notices()).toEqual(["All folders expanded"]);
    });

    it("does nothing when there are no folders", () => {
      settings.folders = [];
      build();
      sidebar.render();
      const before = button("collapseAll");

      click(before);
      vi.advanceTimersByTime(0);

      expect(callbacks.onBatchToggleFolders).not.toHaveBeenCalled();
      expect(notices()).toEqual([]);
      expect(before.isConnected).toBe(true);
      expect(iconOf(before)).toBe("chevrons-up-down");
    });

    it("draws the new glyph at once on the redrawn button and on the old one a tick later", () => {
      (callbacks.onBatchToggleFolders as Mock).mockImplementation(
        (collapse: string[]) => {
          settings.collapsedFolders = [...collapse];
        },
      );
      build();
      sidebar.render();
      const old = button("collapseAll");

      click(old);

      expect(iconOf(button("collapseAll"))).toBe("chevrons-down-up");
      expect(iconOf(old)).toBe("chevrons-up-down");
      vi.advanceTimersByTime(0);
      expect(iconOf(old)).toBe("chevrons-down-up");
    });

    it("works out the glyph again from the current folders after the button is used", () => {
      settings.folders = [makeFolder("A")];
      settings.collapsedFolders = ["A"];
      build();
      sidebar.render();
      const old = button("collapseAll");
      expect(iconOf(old)).toBe("chevrons-down-up");
      settings.folders.push(makeFolder("B"));
      sidebar.clearFolderPathCache();

      click(old);
      vi.advanceTimersByTime(0);

      // Collapsed is still ["A"] (the callback is a mock), but the paths are now A and B.
      expect(iconOf(old)).toBe("chevrons-up-down");
    });

    it("uses a native button for built-in keyboard activation", () => {
      build();
      sidebar.render();

      expect(button("collapseAll").tagName).toBe("BUTTON");
      expect(button("collapseAll").getAttribute("type")).toBe("button");
    });

    it("shares its glyph state between repeated collapse all entries", () => {
      settings.display.iconOrder = ["collapseAll", "divider", "collapseAll"];
      (callbacks.onBatchToggleFolders as Mock).mockImplementation(
        (collapse: string[]) => {
          settings.collapsedFolders = [...collapse];
        },
      );
      build();
      sidebar.render();
      const [first, second] = Array.from(
        iconRow().querySelectorAll<HTMLElement>('[aria-label="Collapse all"]'),
      ) as [HTMLElement, HTMLElement];

      click(first);
      vi.advanceTimersByTime(0);

      // The tick updates the last button drawn, not the one that was used.
      expect(iconOf(second)).toBe("chevrons-down-up");
      expect(iconOf(first)).toBe("chevrons-up-down");
    });
  });

  describe("settings button", () => {
    it("opens Obsidian settings on this plugin's tab", () => {
      const open = vi.fn();
      const openTabById = vi.fn();
      app.setting = { open, openTabById };
      build();
      sidebar.render();

      click(button("settings"));

      expect(open).toHaveBeenCalledTimes(1);
      expect(openTabById).toHaveBeenCalledTimes(1);
      expect(openTabById).toHaveBeenCalledWith("rss-dashboard");
      expect(open.mock.invocationCallOrder[0]).toBeLessThan(
        openTabById.mock.invocationCallOrder[0],
      );
    });

    it("still opens the tab when the settings window has no open method", () => {
      const openTabById = vi.fn();
      app.setting = { openTabById };
      build();
      sidebar.render();

      click(button("settings"));

      expect(openTabById).toHaveBeenCalledWith("rss-dashboard");
    });

    it("does nothing when the app has no settings window", () => {
      build();
      sidebar.render();

      expect(() => click(button("settings"))).not.toThrow();
    });

    it("uses the plugin id the manifest has when the button is used", () => {
      const openTabById = vi.fn();
      app.setting = { open: vi.fn(), openTabById };
      build();
      sidebar.render();
      plugin.manifest.id = "renamed";

      click(button("settings"));

      expect(openTabById).toHaveBeenCalledWith("renamed");
    });
  });

  describe("icon row scrolling", () => {
    function layout(
      row: HTMLElement,
      m: { scrollLeft: number; clientWidth: number; scrollWidth: number },
    ): void {
      for (const [key, value] of Object.entries(m)) {
        Object.defineProperty(row, key, { value, configurable: true });
      }
    }
    const wrapper = (): HTMLElement =>
      container.querySelector(".rss-icon-row-wrapper") as HTMLElement;

    beforeEach(() => {
      build();
      sidebar.render();
    });

    it("hands the icon row to the scroll behavior", () => {
      const parent = createDiv();
      const scrollBehavior = vi.spyOn(internals, "addHorizontalScrollBehavior");

      sidebar.renderHeader(parent);

      expect(scrollBehavior).toHaveBeenCalledTimes(1);
      expect(scrollBehavior).toHaveBeenCalledWith(iconRow(parent));
    });

    it("scrolls the row sideways on a mouse wheel", () => {
      iconRow().scrollLeft = 0;

      iconRow().dispatchEvent(
        new WheelEvent("wheel", { deltaY: 40, cancelable: true }),
      );

      expect(iconRow().scrollLeft).toBe(40);
    });

    it("updates the fade markers when the row scrolls", () => {
      const fades = vi.spyOn(internals, "updateIconRowFades");
      layout(iconRow(), { scrollLeft: 10, clientWidth: 100, scrollWidth: 300 });

      iconRow().dispatchEvent(new Event("scroll"));

      expect(fades).toHaveBeenCalledTimes(1);
      expect(wrapper().classList.contains("has-overflow-left")).toBe(true);
      expect(wrapper().classList.contains("has-overflow-right")).toBe(true);
    });

    it("marks no overflow when the row fits", () => {
      layout(iconRow(), { scrollLeft: 0, clientWidth: 100, scrollWidth: 101 });

      iconRow().dispatchEvent(new Event("scroll"));

      expect(wrapper().classList.contains("has-overflow-left")).toBe(false);
      expect(wrapper().classList.contains("has-overflow-right")).toBe(false);
    });

    it("marks overflow on the right only once it is more than a pixel wide", () => {
      layout(iconRow(), { scrollLeft: 0, clientWidth: 100, scrollWidth: 102 });

      iconRow().dispatchEvent(new Event("scroll"));

      expect(wrapper().classList.contains("has-overflow-left")).toBe(false);
      expect(wrapper().classList.contains("has-overflow-right")).toBe(true);
    });

    it("marks overflow on the left only when scrolled to the end", () => {
      layout(iconRow(), {
        scrollLeft: 200,
        clientWidth: 100,
        scrollWidth: 300,
      });

      iconRow().dispatchEvent(new Event("scroll"));

      expect(wrapper().classList.contains("has-overflow-left")).toBe(true);
      expect(wrapper().classList.contains("has-overflow-right")).toBe(false);
    });

    it("updates the fades for the sidebar's own row, not a header rendered elsewhere", () => {
      const parent = createDiv();
      sidebar.renderHeader(parent);
      const fades = vi.spyOn(internals, "updateIconRowFades");
      layout(iconRow(parent), {
        scrollLeft: 10,
        clientWidth: 100,
        scrollWidth: 300,
      });

      iconRow(parent).dispatchEvent(new Event("scroll"));

      expect(fades).toHaveBeenCalledTimes(1);
      expect(
        parent
          .querySelector(".rss-icon-row-wrapper")
          ?.classList.contains("has-overflow-left"),
      ).toBe(false);
    });
  });
});
