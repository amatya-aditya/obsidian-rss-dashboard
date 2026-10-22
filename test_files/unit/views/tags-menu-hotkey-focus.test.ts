/**
 * Regression for #1480: the `t` hotkey opens the article tag menu, but the
 * dashboard and the Reader focus their own container on `active-leaf-change`.
 * When that event lands after the menu has taken focus, it pulls focus back to
 * the leaf and the menu can no longer be operated from the keyboard.
 *
 * The suite drives the real hotkey action, then fires the view's own
 * focus-restoring event, and asserts the menu keeps focus.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
  type RssDashboardSettings,
  type Tag,
} from "../../../src/types/types";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { ReaderView } from "../../../src/views/reader-view";

vi.mock("../../../src/components/sidebar", () => ({
  Sidebar: class SidebarMock {
    constructor(..._args: unknown[]) {}
    render(): void {}
    destroy(): void {}
    clearFolderPathCache(): void {}
  },
}));

// jsdom has no CSS.escape, and the dashboard resolves the selected card by id.
function installCssEscape(): void {
  const win = window as unknown as {
    CSS?: { escape?: (value: string) => string };
  };
  win.CSS ??= {};
  win.CSS.escape ??= (value: string) => value.replace(/([^\w-])/g, "\\$1");
}

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(items: Partial<FeedItem>[]): Feed {
  const url = "https://example.com/feed.xml";
  return {
    title: "Feed",
    url,
    folder: "",
    items: items.map((item, index) => ({
      title: `Item ${index}`,
      link: `${url}#${index}`,
      description: "<p>Excerpt</p>",
      pubDate: new Date(Date.now() - index * 1000).toISOString(),
      guid: `guid-${index}`,
      read: false,
      starred: false,
      tags: [],
      feedTitle: "Feed",
      feedUrl: url,
      coverImage: "",
      ...item,
    })),
    lastUpdated: Date.now(),
  };
}

function settingsWithOneArticle(tags: Tag[]): {
  settings: RssDashboardSettings;
  item: FeedItem;
} {
  const settings = cloneSettings();
  const feed = makeFeed([{ title: "Article" }]);
  settings.feeds = [feed];
  const item = feed.items[0];
  settings.availableTags = tags;
  return { settings, item };
}

const MENU_SELECTOR = ".rss-dashboard-tags-dropdown-content-portal";

function menu(): HTMLElement | null {
  return activeDocument.querySelector<HTMLElement>(MENU_SELECTOR);
}

// The tag checkbox has no accessible name of its own: its label is a sibling
// div, so the class is the only stable handle (unchanged markup, #1480).
function firstTagCheckbox(): HTMLElement | null {
  return activeDocument.querySelector<HTMLElement>(
    `${MENU_SELECTOR} .rss-dashboard-tag-checkbox`,
  );
}

function pressKey(
  target: EventTarget,
  key: string,
  options: { shiftKey?: boolean } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

const NEWS_TAG: Tag = { name: "News", color: "#ff0000" };

interface DashboardHarness {
  view: RssDashboardView;
  app: App;
  leaf: import("obsidian").WorkspaceLeaf;
  item: FeedItem;
}

async function openDashboard(tags: Tag[]): Promise<DashboardHarness> {
  const { settings, item } = settingsWithOneArticle(tags);
  const app = new App();
  const plugin = {
    app,
    settings,
    saveSettings: vi.fn(async () => {}),
    updatePlaybackProgress: vi.fn(),
  };
  const leaf = {
    app,
    view: null,
    updateHeader: vi.fn(),
  } as unknown as import("obsidian").WorkspaceLeaf;
  const view = new RssDashboardView(leaf, plugin as never);
  activeDocument.body.appendChild(view.containerEl);
  await view.onOpen();

  (view as unknown as { selectedArticle: FeedItem | null }).selectedArticle =
    item;
  view.containerEl.focus({ preventScroll: true });
  return { view, app, leaf, item };
}

/** The card's tag control, found by role and name (testing guide §10). */
function cardTagsToggle(view: RssDashboardView): HTMLElement {
  return view.containerEl.querySelector<HTMLElement>(
    '[role="button"][aria-label^="Manage tags"]',
  )!;
}

describe("Dashboard tag menu focus (#1480)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installCssEscape();
    activeDocument.body.empty();
  });

  afterEach(() => {
    activeDocument.body.empty();
    vi.restoreAllMocks();
  });

  it("keeps focus on the first tag checkbox when the leaf becomes active after `t`", async () => {
    const { view, app, leaf } = await openDashboard([NEWS_TAG]);

    view.actionToggleTagsMenu();
    const checkbox = firstTagCheckbox();
    expect(activeDocument.activeElement).toBe(checkbox);

    app.workspace.trigger("active-leaf-change", leaf);

    expect(activeDocument.activeElement).toBe(checkbox);

    // Escape still closes the menu from inside it and hands focus back to the
    // card's tag button, as the button-opened path does.
    const tagsToggle = cardTagsToggle(view);
    pressKey(checkbox!, "Escape");
    expect(menu()).toBeNull();
    expect(activeDocument.activeElement).toBe(tagsToggle);
    expect(tagsToggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the menu operative when a click left focus on the document body", async () => {
    const { view, app, leaf } = await openDashboard([NEWS_TAG]);
    view.actionToggleTagsMenu();
    // A click on the menu's non-focusable text (a tag label) leaves focus on
    // the body while the menu stays open.
    (activeDocument.activeElement as HTMLElement | null)?.blur();
    expect(activeDocument.activeElement).toBe(activeDocument.body);

    app.workspace.trigger("active-leaf-change", leaf);
    expect(activeDocument.activeElement).not.toBe(view.containerEl);
    expect(menu()).not.toBeNull();

    // The portal accepts Escape from the body, so the menu must still close.
    pressKey(activeDocument.body, "Escape");
    expect(menu()).toBeNull();
    expect(activeDocument.activeElement).toBe(cardTagsToggle(view));
  });

  it("focuses the menu with `t` when there are no tags and Tab enters it", async () => {
    const { view, app, leaf } = await openDashboard([]);

    view.actionToggleTagsMenu();
    const menuEl = menu();
    expect(activeDocument.activeElement).toBe(menuEl);

    pressKey(menuEl!, "Tab");
    expect(activeDocument.activeElement).not.toBe(menuEl);
    expect(menuEl!.contains(activeDocument.activeElement)).toBe(true);

    app.workspace.trigger("active-leaf-change", leaf);
    expect(menuEl!.contains(activeDocument.activeElement)).toBe(true);

    pressKey(activeDocument.activeElement!, "Escape");
    expect(menu()).toBeNull();
    expect(activeDocument.activeElement).toBe(cardTagsToggle(view));
  });

  it("opens from the card's tag button with Enter and Escape returns focus there", async () => {
    const { view } = await openDashboard([NEWS_TAG]);
    const tagsToggle = cardTagsToggle(view);

    pressKey(tagsToggle, "Enter");
    const checkbox = firstTagCheckbox();
    expect(activeDocument.activeElement).toBe(checkbox);
    expect(tagsToggle.getAttribute("aria-expanded")).toBe("true");

    pressKey(checkbox!, "Escape");
    expect(menu()).toBeNull();
    expect(activeDocument.activeElement).toBe(tagsToggle);
    expect(tagsToggle.getAttribute("aria-expanded")).toBe("false");
  });
});

interface ReaderInternals {
  onOpen(): Promise<void>;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  currentItem: FeedItem | null;
  actionToggleTagsMenu(): void;
}

describe("Reader tag menu focus (#1480)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    installCssEscape();
    activeDocument.body.empty();
  });

  afterEach(() => {
    activeDocument.body.empty();
    vi.restoreAllMocks();
  });

  it("keeps focus on the first tag checkbox when the leaf becomes active after `t`", async () => {
    const { settings, item } = settingsWithOneArticle([NEWS_TAG]);
    const app = new App();
    const leaf = {
      app,
      view: null,
    } as unknown as import("obsidian").WorkspaceLeaf;
    const view = new ReaderView(
      leaf,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      vi.fn(),
    ) as unknown as ReaderInternals;
    view.contentEl = view.containerEl.children[1] as HTMLElement;
    activeDocument.body.appendChild(view.containerEl);
    await view.onOpen();
    view.currentItem = item;

    view.actionToggleTagsMenu();
    const checkbox = firstTagCheckbox();
    expect(activeDocument.activeElement).toBe(checkbox);

    app.workspace.trigger("active-leaf-change", leaf);

    expect(activeDocument.activeElement).toBe(checkbox);

    const tagsButton = view.contentEl.querySelector<HTMLElement>(
      '[data-rss-action="tags"]',
    )!;
    pressKey(checkbox!, "Escape");
    expect(menu()).toBeNull();
    expect(activeDocument.activeElement).toBe(tagsButton);
  });
});
