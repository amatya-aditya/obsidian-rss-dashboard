import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import {
  SidebarOptions,
  SidebarCallbacks,
} from "../../../src/components/sidebar";
import { RssDashboardSettings, Feed } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

interface MockSidebar {
  callbacks: SidebarCallbacks;
  rendered: boolean;
  destroyed: boolean;
}
let lastSidebarInstance: MockSidebar | null = null;

vi.mock("../../../src/components/sidebar", () => {
  class Sidebar {
    callbacks: SidebarCallbacks;
    rendered = false;
    destroyed = false;

    constructor(
      _app: unknown,
      _container: unknown,
      _plugin: unknown,
      _settings: unknown,
      _options: unknown,
      callbacks: SidebarCallbacks,
    ) {
      this.callbacks = callbacks;
      lastSidebarInstance = this as unknown as MockSidebar;
    }

    render(): void {
      this.rendered = true;
    }

    destroy(): void {
      this.destroyed = true;
    }
  }

  return { Sidebar };
});

describe("MobileNavigationModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    interface ObsidianElement extends HTMLElement {
      empty(): void;
    }
    (document.body as unknown as ObsidianElement).empty();
    Object.defineProperty(window, "innerWidth", {
      value: 1400,
      configurable: true,
    });
    lastSidebarInstance = null;
    vi.restoreAllMocks();
  });

  it("wraps sidebar callbacks and closes on feed/folder clicks", async () => {
    const { MobileNavigationModal } =
      await import("../../../src/modals/mobile-navigation-modal");

    const app = obsidian.App.createMock();
    const plugin = { saveSettings: vi.fn(async () => {}) };
    const settings = { sidebarWidth: 310 } as unknown as RssDashboardSettings;
    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
    } as unknown as SidebarCallbacks;

    const modal = new MobileNavigationModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
      settings,
      { selectedTags: [] } as unknown as SidebarOptions,
      callbacks,
    );

    // The native close button Obsidian 1.13.7 renders in modalEl.
    const closeBtn = modal.modalEl.querySelector(
      ".modal-header-button.mod-raised.clickable-icon",
    );
    expect(closeBtn).not.toBeNull();

    modal.open();

    expect(
      modal.modalEl.classList.contains("rss-mobile-navigation-modal"),
    ).toBe(true);
    expect(
      modal.modalEl.querySelector(
        ".modal-header-button.mod-raised.clickable-icon",
      ),
    ).toBe(closeBtn);
    expect(lastSidebarInstance?.rendered).toBe(true);
    expect(modal.modalEl.style.width).toBe("1120px");

    lastSidebarInstance!.callbacks.onTagToggle("AI");
    expect(callbacks.onTagToggle).toHaveBeenCalledWith("AI");
    expect(modal.containerEl.isConnected).toBe(true);

    lastSidebarInstance!.callbacks.onFeedClick({
      title: "Test Feed",
      url: "x",
      folder: "",
      items: [],
      lastUpdated: Date.now(),
    } as Feed);
    expect(callbacks.onFeedClick).toHaveBeenCalledTimes(1);
    expect(modal.containerEl.isConnected).toBe(false);

    // Re-open to validate folder click behavior too
    modal.open();
    lastSidebarInstance!.callbacks.onFolderClick("Tech");
    expect(callbacks.onFolderClick).toHaveBeenCalledWith("Tech");
    expect(modal.containerEl.isConnected).toBe(false);
  });

  it("opens at 80% of the window width, and never narrower than 240px", async () => {
    const { MobileNavigationModal } =
      await import("../../../src/modals/mobile-navigation-modal");

    const app = obsidian.App.createMock();
    const plugin = { saveSettings: vi.fn(async () => {}) };
    const settings = { sidebarWidth: 310 } as unknown as RssDashboardSettings;

    const modal = new MobileNavigationModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
      settings,
      { selectedTags: [] } as unknown as SidebarOptions,
      {} as unknown as SidebarCallbacks,
    );
    modal.open();
    expect(modal.modalEl.style.width).toBe("1120px");
    expect(modal.modalEl.style.maxWidth).toBe("1120px");
    modal.close();

    Object.defineProperty(window, "innerWidth", {
      value: 250,
      configurable: true,
    });
    modal.open();
    expect(modal.modalEl.style.width).toBe("240px");
    modal.close();

    expect(settings.sidebarWidth).toBe(310);
  });

  // #664: document-level listeners kept every closed drawer (and its sidebar
  // rows) reachable from the document. The drawer needs none (#670).
  it("adds no listeners to the document", async () => {
    const { MobileNavigationModal } =
      await import("../../../src/modals/mobile-navigation-modal");

    const app = obsidian.App.createMock();
    const plugin = { saveSettings: vi.fn(async () => {}) };
    const settings = { sidebarWidth: 310 } as unknown as RssDashboardSettings;
    const addListener = vi.spyOn(activeDocument, "addEventListener");

    const modal = new MobileNavigationModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
      settings,
      { selectedTags: [] } as unknown as SidebarOptions,
      {} as unknown as SidebarCallbacks,
    );
    modal.open();
    modal.close();

    expect(addListener).not.toHaveBeenCalled();
  });
});
