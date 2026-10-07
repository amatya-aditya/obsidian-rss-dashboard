import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { Menu } from "obsidian";
import { ReaderView } from "../../../src/views/reader-view";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

// The Reader toolbar is built from native icon buttons (#837, WCAG 2.2 2.1.1,
// 2.4.3, 4.1.2). These tests render the real toolbar through
// `ReaderView.onOpen` and drive real keyboard and pointer events at it.

class MockLeaf {
  app: unknown;
  view: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  detach = vi.fn();
}

type Internals = {
  contentEl: HTMLElement;
  currentItem: FeedItem | null;
  fetchFullArticleContent: Mock;
};

const TOOLBAR_NAMES = [
  "Save article",
  "Mark as read/unread",
  "Star/unstar article",
  "Manage tags",
  "Reader settings",
  "Open in browser",
] as const;

function makeItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Article Title",
    link: "https://example.com/article",
    description: "Description",
    content: "Content",
    pubDate: new Date().toISOString(),
    guid: "guid-1",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Example Feed",
    feedUrl: "https://example.com/rss.xml",
    coverImage: "",
    mediaType: "article",
    saved: false,
    ...overrides,
  };
}

function press(
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("ReaderView toolbar icon buttons", () => {
  let view: ReaderView;
  let contentEl: HTMLElement;
  let settings: RssDashboardSettings;
  let onArticleUpdate: Mock;
  let openSpy: ReturnType<typeof vi.spyOn>;

  const internals = () => view as unknown as Internals;
  const toolbar = () =>
    contentEl.querySelector<HTMLElement>(".rss-reader-actions")!;
  const buttons = () => [...toolbar().querySelectorAll<HTMLElement>("button")];
  const byName = (name: string) =>
    buttons().find((button) => button.getAttribute("aria-label") === name)!;
  // The read name changes with state ("Mark as unread"), because the
  // view writes its tooltip to aria-label, so look buttons up by action.
  const byAction = (action: string) =>
    buttons().find((b) => b.getAttribute("data-rss-action") === action)!;
  const tabStops = () => buttons().filter((button) => button.tabIndex === 0);

  async function openArticle(overrides: Partial<FeedItem> = {}) {
    internals().fetchFullArticleContent = vi
      .fn()
      .mockResolvedValue("<p>Content</p>");
    const item = makeItem(overrides);
    await view.displayItem(item);
    return item;
  }

  beforeEach(async () => {
    contentEl = createDiv();
    activeDocument.body.appendChild(contentEl);
    const app = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
        setActiveLeaf: vi.fn(),
        revealLeaf: vi.fn(),
      },
      vault: { getAbstractFileByPath: vi.fn() },
    };
    settings = { ...DEFAULT_SETTINGS, useWebViewer: false };
    onArticleUpdate = vi.fn();
    view = new ReaderView(
      new MockLeaf(app) as never,
      settings,
      { saveArticle: vi.fn() } as never,
      vi.fn(),
      onArticleUpdate,
    );
    internals().contentEl = contentEl;
    openSpy = vi.spyOn(activeWindow, "open").mockImplementation(() => null);
    await view.onOpen();
  });

  afterEach(() => {
    activeDocument.body.empty();
    vi.restoreAllMocks();
  });

  describe("semantics", () => {
    it("exposes every action as a named native button, in toolbar order", () => {
      expect(buttons().map((b) => b.getAttribute("aria-label"))).toEqual([
        ...TOOLBAR_NAMES,
      ]);
      for (const button of buttons()) {
        expect(button.tagName).toBe("BUTTON");
        expect(button.getAttribute("type")).toBe("button");
        // A native button supplies its own role and keyboard activation.
        expect(button.hasAttribute("role")).toBe(false);
      }
    });

    it("leaves no non-native clickable control inside the toolbar", () => {
      expect(
        toolbar().querySelectorAll('[role="button"], div[tabindex]'),
      ).toHaveLength(0);
      for (const cls of [
        ".rss-reader-action-button",
        ".rss-reader-star-toggle",
        ".rss-reader-read-toggle",
        ".rss-reader-format-button",
        ".rss-dashboard-tags-toggle",
      ]) {
        for (const el of toolbar().querySelectorAll(cls)) {
          expect(el.tagName, cls).toBe("BUTTON");
        }
      }
    });

    it("keeps the existing classes so styling is unchanged", () => {
      expect(byName("Star/unstar article").className).toContain(
        "rss-reader-star-toggle",
      );
      expect(byName("Mark as read/unread").className).toContain(
        "rss-reader-read-toggle",
      );
      expect(byName("Manage tags").className).toContain(
        "rss-dashboard-tags-toggle",
      );
      expect(byName("Reader settings").className).toContain(
        "rss-reader-format-button",
      );
      for (const button of buttons()) {
        expect(button.classList.contains("rss-reader-action-button")).toBe(
          true,
        );
      }
    });

    it("marks the toolbar as a labelled toolbar region", () => {
      expect(toolbar().getAttribute("role")).toBe("toolbar");
      expect(toolbar().getAttribute("aria-label")).toBeTruthy();
    });

    it("tags each button with a data-rss hook from the shared helper", () => {
      expect(buttons().map((b) => b.getAttribute("data-rss-action"))).toEqual([
        "save",
        "read",
        "star",
        "tags",
        "format",
        "open",
      ]);
      for (const button of buttons()) {
        expect(button.getAttribute("data-rss-region")).toBe("reader-toolbar");
      }
    });

    it("reports the star as a toggle through aria-pressed", async () => {
      const star = byName("Star/unstar article");
      expect(star.getAttribute("aria-pressed")).toBe("false");

      await openArticle({ starred: true });
      expect(star.getAttribute("aria-pressed")).toBe("true");

      await openArticle({ starred: false });
      expect(star.getAttribute("aria-pressed")).toBe("false");
    });

    it("keeps the star's accessible name stable while aria-pressed carries the state", async () => {
      // A toggle exposes its state through aria-pressed. Renaming it as well
      // ("Remove from starred" + pressed) reads as a contradiction.
      const star = byAction("star");
      expect(star.getAttribute("aria-label")).toBe("Star/unstar article");

      await openArticle({ starred: true });
      expect(star.getAttribute("aria-label")).toBe("Star/unstar article");
      expect(star.getAttribute("aria-pressed")).toBe("true");

      await openArticle({ starred: false });
      expect(star.getAttribute("aria-label")).toBe("Star/unstar article");
      expect(star.getAttribute("aria-pressed")).toBe("false");
    });
  });

  describe("roving tabindex", () => {
    it("is a single Tab stop on the first button", () => {
      expect(tabStops()).toEqual([buttons()[0]]);
      for (const button of buttons().slice(1)) {
        expect(button.getAttribute("tabindex")).toBe("-1");
      }
    });

    it("moves focus with arrows, Home and End and keeps one Tab stop", () => {
      const all = buttons();
      all[0].focus();

      press(all[0], "ArrowRight");
      press(all[1], "ArrowRight");
      expect(activeDocument.activeElement).toBe(byName("Star/unstar article"));
      expect(tabStops()).toEqual([byName("Star/unstar article")]);

      press(activeDocument.activeElement as HTMLElement, "End");
      expect(activeDocument.activeElement).toBe(byName("Open in browser"));

      press(activeDocument.activeElement as HTMLElement, "ArrowRight");
      expect(activeDocument.activeElement).toBe(byName("Save article"));

      press(activeDocument.activeElement as HTMLElement, "ArrowLeft");
      expect(activeDocument.activeElement).toBe(byName("Open in browser"));

      press(activeDocument.activeElement as HTMLElement, "Home");
      expect(activeDocument.activeElement).toBe(byName("Save article"));
      expect(tabStops()).toHaveLength(1);
    });

    it("does not capture Tab, so focus can leave the toolbar", () => {
      byName("Save article").focus();

      expect(press(byName("Save article"), "Tab").defaultPrevented).toBe(false);
      expect(
        press(byName("Save article"), "Tab", { shiftKey: true })
          .defaultPrevented,
      ).toBe(false);
    });

    it("keeps the chosen Tab stop and focus when another article is shown", async () => {
      await openArticle();
      byName("Manage tags").focus();

      await openArticle({ guid: "guid-2", title: "Second" });

      expect(activeDocument.activeElement).toBe(byName("Manage tags"));
      expect(tabStops()).toEqual([byName("Manage tags")]);
    });

    it("lands focus on a valid button when the focused button is removed", async () => {
      const star = byName("Star/unstar article");
      star.focus();

      star.remove();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

      expect(tabStops()).toHaveLength(1);
      expect(activeDocument.activeElement).toBe(tabStops()[0]);
      expect(toolbar().contains(activeDocument.activeElement)).toBe(true);
    });

    it("does not break pointer activation of a button that is not the Tab stop", async () => {
      await openArticle();
      const star = byAction("star");
      expect(star.tabIndex).toBe(-1);

      star.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
        }),
      );
      star.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      star.focus();
      star.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }),
      );
      star.click();

      expect(onArticleUpdate).toHaveBeenCalledTimes(1);
      expect(onArticleUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ guid: "guid-1" }),
        { starred: true },
      );
      expect(tabStops()).toEqual([star]);
    });
  });

  describe("activation", () => {
    it("leaves Enter and Space to the native button", () => {
      // jsdom does not synthesize a click from a key press, but a browser
      // does. The toolbar must not also act on keydown or it would double-fire.
      expect(buttons()).toHaveLength(TOOLBAR_NAMES.length);
      for (const button of buttons()) {
        for (const key of ["Enter", " "]) {
          expect(
            press(button, key).defaultPrevented,
            button.ariaLabel ?? "",
          ).toBe(false);
        }
      }
      expect(onArticleUpdate).not.toHaveBeenCalled();
      expect(openSpy).not.toHaveBeenCalled();
    });

    it("toggles the star and read state on click", async () => {
      await openArticle();

      byAction("star").click();
      expect(onArticleUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ guid: "guid-1" }),
        { starred: true },
      );

      onArticleUpdate.mockClear();
      byAction("read").click();
      expect(onArticleUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({ guid: "guid-1" }),
        { read: true },
        false,
      );
    });

    it("opens the save options menu from the save button", async () => {
      await openArticle();
      const showAtMouseEvent = vi.spyOn(
        (Menu as unknown as { prototype: { showAtMouseEvent: () => void } })
          .prototype,
        "showAtMouseEvent",
      );

      byName("Save article").click();

      expect(showAtMouseEvent).toHaveBeenCalledTimes(1);
      expect(
        (Menu as unknown as { lastItems: { title: string }[] }).lastItems.map(
          (item) => item.title,
        ),
      ).toEqual(["Save with default settings", "Save to custom folder..."]);
    });

    it("opens and closes the tags dropdown and reports it through aria-expanded", async () => {
      await openArticle();
      const tags = byName("Manage tags");
      expect(tags.getAttribute("aria-haspopup")).toBe("true");
      expect(tags.getAttribute("aria-expanded")).toBe("false");

      tags.click();
      expect(
        activeDocument.querySelector(".rss-dashboard-tags-dropdown-content"),
      ).not.toBeNull();
      expect(tags.getAttribute("aria-expanded")).toBe("true");

      tags.click();
      expect(
        activeDocument.querySelector(".rss-dashboard-tags-dropdown-content"),
      ).toBeNull();
      expect(tags.getAttribute("aria-expanded")).toBe("false");
    });

    it("does nothing from the tags button before an article is open", () => {
      byName("Manage tags").click();

      expect(
        activeDocument.querySelector(".rss-dashboard-tags-dropdown-content"),
      ).toBeNull();
      expect(byName("Manage tags").getAttribute("aria-expanded")).toBe("false");
    });

    it("opens and closes the reader format dropdown and reports it through aria-expanded", async () => {
      await openArticle();
      const format = byName("Reader settings");
      expect(format.getAttribute("aria-haspopup")).toBe("true");
      expect(format.getAttribute("aria-expanded")).toBe("false");

      format.click();
      expect(
        activeDocument.querySelector(".rss-reader-format-dropdown-portal"),
      ).not.toBeNull();
      expect(format.getAttribute("aria-expanded")).toBe("true");

      format.click();
      expect(
        activeDocument.querySelector(".rss-reader-format-dropdown-portal"),
      ).toBeNull();
      expect(format.getAttribute("aria-expanded")).toBe("false");
    });

    it("opens the article in the browser", async () => {
      await openArticle();

      byName("Open in browser").click();

      expect(openSpy).toHaveBeenCalledWith(
        "https://example.com/article",
        "_blank",
      );
    });

    it("opens the podcast destination menu instead of a page for a podcast", async () => {
      await openArticle();
      internals().currentItem = makeItem({
        mediaType: "podcast",
        link: "https://example.com/ep1",
        audioUrl: "https://cdn.example.com/ep1.mp3",
      });
      const showAtMouseEvent = vi.spyOn(
        (Menu as unknown as { prototype: { showAtMouseEvent: () => void } })
          .prototype,
        "showAtMouseEvent",
      );

      byName("Open in browser").click();

      expect(openSpy).not.toHaveBeenCalled();
      expect(showAtMouseEvent).toHaveBeenCalledTimes(1);
      const titles = (
        Menu as unknown as { lastItems: { title: string }[] }
      ).lastItems.map((item) => item.title);
      expect(titles).toEqual(["Episode page", "Audio file", "RSS feed"]);
    });

    it("anchors the podcast menu below the button for a keyboard-style open without an event", async () => {
      await openArticle();
      internals().currentItem = makeItem({
        mediaType: "podcast",
        link: "https://example.com/ep1",
      });
      const showAtPosition = vi.spyOn(
        (Menu as unknown as { prototype: { showAtPosition: () => void } })
          .prototype,
        "showAtPosition",
      );

      view.actionOpenOriginal();

      expect(showAtPosition).toHaveBeenCalledTimes(1);
    });

    it("tells assistive technology only the podcast open button opens a menu", async () => {
      const open = byName("Open in browser");
      expect(open.hasAttribute("aria-haspopup")).toBe(false);

      await openArticle();
      expect(open.hasAttribute("aria-haspopup")).toBe(false);

      internals().currentItem = makeItem({ mediaType: "podcast" });
      (
        view as unknown as { updateToggleButtons: () => void }
      ).updateToggleButtons();
      expect(open.getAttribute("aria-haspopup")).toBe("menu");

      internals().currentItem = makeItem();
      (
        view as unknown as { updateToggleButtons: () => void }
      ).updateToggleButtons();
      expect(open.hasAttribute("aria-haspopup")).toBe(false);
    });
  });
});
