import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, Platform, type WorkspaceLeaf } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import type { MobileNavigationModal } from "../../../src/modals/mobile-navigation-modal";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

/** Fires a touchstart/touchend pair `dx`,`dy` apart on `target`. */
export function swipeOn(
  target: Element,
  dx: number,
  dy = 0,
): { endEvent: Event } {
  const point = (x: number, y: number) => [{ clientX: x, clientY: y }];
  const start = new Event("touchstart", { bubbles: true, cancelable: true });
  Object.defineProperty(start, "touches", { value: point(200, 300) });
  target.dispatchEvent(start);
  const end = new Event("touchend", { bubbles: true, cancelable: true });
  Object.defineProperty(end, "touches", { value: [] });
  Object.defineProperty(end, "changedTouches", {
    value: point(200 + dx, 300 + dy),
  });
  target.dispatchEvent(end);
  return { endEvent: end };
}

function article(guid: string): FeedItem {
  return {
    title: guid,
    link: `https://example.com/${guid}`,
    description: "",
    pubDate: new Date().toISOString(),
    guid,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
  };
}

interface Internals {
  mobileSidebarModal: MobileNavigationModal | null;
  inlineArticle: FeedItem | null;
  swipeNavigator: { sync(): void } | null;
  openSelectedArticle(article: FeedItem): Promise<void>;
  settings: RssDashboardSettings;
}

describe("Dashboard swipe navigation", () => {
  let view: RssDashboardView;
  let internals: Internals;
  let settings: RssDashboardSettings;
  let app: App;

  beforeEach(async () => {
    installObsidianDomPolyfills();
    Platform.isMobile = true;
    vi.stubGlobal("innerWidth", 600);
    settings = structuredClone(DEFAULT_SETTINGS);
    settings.display.swipeBetweenPanels = true;
    const plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
    } as unknown as RssDashboardPlugin;
    app = new App();
    view = new RssDashboardView({ app } as unknown as WorkspaceLeaf, plugin);
    vi.spyOn(view, "render").mockResolvedValue(undefined);
    internals = view as unknown as Internals;
    document.body.appendChild(view.containerEl);
    await view.onOpen();
  });

  afterEach(() => {
    internals.mobileSidebarModal?.close();
    Platform.isMobile = false;
    document.body.empty();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("sidebar", () => {
    it("opens the mobile sidebar once on a swipe right, however often it repeats", () => {
      const open = vi.spyOn(view, "openMobileSidebar");

      swipeOn(view.containerEl, 120);
      const modal = internals.mobileSidebarModal;
      swipeOn(view.containerEl, 120);

      expect(open).toHaveBeenCalledTimes(2);
      expect(modal).not.toBeNull();
      expect(internals.mobileSidebarModal).toBe(modal);
    });

    it("keeps the swipe from reaching Obsidian's own handlers", () => {
      const inner = view.containerEl.createDiv();
      const below = vi.fn();
      const above = vi.fn();
      inner.addEventListener("touchend", below);
      document.body.addEventListener("touchend", above);

      swipeOn(inner, 120);
      expect(below).not.toHaveBeenCalled();
      expect(above).toHaveBeenCalledTimes(0);
    });

    it("also swallows a swipe that does nothing, such as a left swipe with no article", () => {
      const above = vi.fn();
      document.body.addEventListener("touchend", above);

      swipeOn(view.containerEl, -120);

      expect(internals.mobileSidebarModal).toBeNull();
      expect(above).not.toHaveBeenCalled();
    });

    it("lets taps and vertical scrolls through untouched", () => {
      const above = vi.fn();
      document.body.addEventListener("touchend", above);

      swipeOn(view.containerEl, 5, 200);

      expect(above).toHaveBeenCalledTimes(1);
      expect(internals.mobileSidebarModal).toBeNull();
    });

    it("ignores a swipe that starts on a text field", () => {
      const input = view.containerEl.createEl("input");

      swipeOn(input, 120);

      expect(internals.mobileSidebarModal).toBeNull();
    });

    it("closes the open sidebar on a swipe left inside it", () => {
      view.openMobileSidebar();
      const modal = internals.mobileSidebarModal!;
      expect(modal).not.toBeNull();
      const close = vi.spyOn(modal, "close");

      swipeOn(modal.contentEl, -120);

      expect(close).toHaveBeenCalledTimes(1);
      expect(internals.mobileSidebarModal).toBeNull();
    });

    it("keeps the sidebar open on a swipe right inside it", () => {
      view.openMobileSidebar();
      const modal = internals.mobileSidebarModal!;

      swipeOn(modal.contentEl, 120);

      expect(internals.mobileSidebarModal).toBe(modal);
    });
  });

  describe("when swiping is not enabled", () => {
    it("adds no listeners and leaves native swipes alone with the setting off", async () => {
      document.body.empty();
      settings.display.swipeBetweenPanels = false;
      const fresh = new RssDashboardView(
        { app } as unknown as WorkspaceLeaf,
        { settings, saveSettings: vi.fn() } as unknown as RssDashboardPlugin,
      );
      vi.spyOn(fresh, "render").mockResolvedValue(undefined);
      document.body.appendChild(fresh.containerEl);
      const add = vi.spyOn(fresh.containerEl, "addEventListener");
      await fresh.onOpen();
      const above = vi.fn();
      document.body.addEventListener("touchend", above);

      swipeOn(fresh.containerEl, 120);

      expect(
        add.mock.calls.filter(([type]) => type.startsWith("touch")),
      ).toHaveLength(0);
      expect((fresh as unknown as Internals).mobileSidebarModal).toBeNull();
      expect(above).toHaveBeenCalledTimes(1);
    });

    it("adds no listeners on desktop even with the setting on", async () => {
      Platform.isMobile = false;
      document.body.empty();
      const fresh = new RssDashboardView(
        { app } as unknown as WorkspaceLeaf,
        { settings, saveSettings: vi.fn() } as unknown as RssDashboardPlugin,
      );
      vi.spyOn(fresh, "render").mockResolvedValue(undefined);
      document.body.appendChild(fresh.containerEl);
      await fresh.onOpen();
      const above = vi.fn();
      document.body.addEventListener("touchend", above);

      swipeOn(fresh.containerEl, 120);

      expect(above).toHaveBeenCalledTimes(1);
    });

    it("stops handling swipes once the setting is turned off", () => {
      settings.display.swipeBetweenPanels = false;
      internals.swipeNavigator?.sync();

      swipeOn(view.containerEl, 120);

      expect(internals.mobileSidebarModal).toBeNull();
    });

    it("stops handling swipes on a wide viewport", () => {
      vi.stubGlobal("innerWidth", 1600);
      internals.swipeNavigator?.sync();

      swipeOn(view.containerEl, 120);

      expect(internals.mobileSidebarModal).toBeNull();
    });
  });

  describe("swipe left re-opens the last article", () => {
    let readerLeaves: unknown[];
    let reveal: ReturnType<typeof vi.spyOn>;
    let activate: ReturnType<typeof vi.spyOn>;
    let tab: { setViewState: ReturnType<typeof vi.fn>; view: object };

    beforeEach(() => {
      readerLeaves = [];
      tab = { setViewState: vi.fn(async () => {}), view: {} };
      vi.spyOn(app.workspace, "getLeaf").mockReturnValue(tab as never);
      vi.spyOn(app.workspace, "getLeftLeaf").mockReturnValue(tab as never);
      vi.spyOn(app.workspace, "getRightLeaf").mockReturnValue(tab as never);
      vi.spyOn(app.workspace, "getLeavesOfType").mockImplementation(
        () => readerLeaves as never,
      );
      reveal = vi.spyOn(app.workspace, "revealLeaf");
      activate = vi.spyOn(app.workspace, "setActiveLeaf");
    });

    async function openWith(location: string): Promise<void> {
      settings.readerViewLocation = location as never;
      await internals.openSelectedArticle(article("a"));
      reveal.mockClear();
      activate.mockClear();
    }

    const flush = () => new Promise((r) => window.setTimeout(r, 0));

    it("does nothing when no article was opened this session", async () => {
      swipeOn(view.containerEl, -120);
      await flush();

      expect(activate).not.toHaveBeenCalled();
      expect(internals.inlineArticle).toBeNull();
    });

    it("focuses the reader tab after a main-view open", async () => {
      await openWith("main");
      readerLeaves = [tab];

      swipeOn(view.containerEl, -120);
      await flush();

      expect(reveal).toHaveBeenCalledWith(tab);
      expect(activate).toHaveBeenCalledWith(tab, { focus: true });
    });

    it("does nothing after the reader tab was closed", async () => {
      await openWith("main");
      readerLeaves = [];

      swipeOn(view.containerEl, -120);
      await flush();

      expect(activate).not.toHaveBeenCalled();
    });

    it("shows the article again after an inline open and swipe right closed it", async () => {
      await openWith("inline");
      expect(internals.inlineArticle?.guid).toBe("a");
      internals.inlineArticle = null;

      swipeOn(view.containerEl, -120);
      await flush();

      expect((view as unknown as Internals).inlineArticle?.guid).toBe("a");
      expect(activate).not.toHaveBeenCalled();
    });

    it.each(["left-sidebar", "right-sidebar"])(
      "does nothing after an open in the %s",
      async (location) => {
        await openWith(location);
        readerLeaves = [tab];

        swipeOn(view.containerEl, -120);
        await flush();

        expect(activate).not.toHaveBeenCalled();
        expect(internals.inlineArticle).toBeNull();
      },
    );
  });
});
