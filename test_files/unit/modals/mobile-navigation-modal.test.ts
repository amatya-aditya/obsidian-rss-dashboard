import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { SidebarOptions, SidebarCallbacks } from "../../../src/components/sidebar";
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

    constructor(_app: unknown, _container: unknown, _plugin: unknown, _settings: unknown, _options: unknown, callbacks: SidebarCallbacks) {
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

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("MobileNavigationModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    interface ObsidianElement extends HTMLElement {
      empty(): void;
    }
    (document.body as unknown as ObsidianElement).empty();
    Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
    lastSidebarInstance = null;
    vi.restoreAllMocks();
  });

  it("wraps sidebar callbacks and closes on feed/folder clicks", async () => {
    const { MobileNavigationModal } = await import("../../../src/modals/mobile-navigation-modal");

    const app = obsidian.App.createMock();
    const plugin = { saveSettings: vi.fn(async () => {}) };
    const settings = { sidebarWidth: 280 } as unknown as RssDashboardSettings;
    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
    } as unknown as SidebarCallbacks;

    const modal = new MobileNavigationModal(app as unknown as obsidian.App, plugin as unknown as RssDashboardPlugin, settings, { selectedTags: [] } as unknown as SidebarOptions, callbacks);

    const closeBtn = createEl("button");
    closeBtn.className = "modal-header-button mod-raised clickable-icon";
    modal.modalEl.appendChild(closeBtn);

    modal.open();

    expect(modal.modalEl.classList.contains("rss-mobile-navigation-modal")).toBe(true);
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

  it("updates width during drag and persists on mouseup", async () => {
    const { MobileNavigationModal } = await import("../../../src/modals/mobile-navigation-modal");

    const app = obsidian.App.createMock();
    const plugin = { saveSettings: vi.fn(async () => {}) };
    const settings = { sidebarWidth: 280 } as unknown as RssDashboardSettings;
    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
    } as unknown as SidebarCallbacks;

    const modal = new MobileNavigationModal(app as unknown as obsidian.App, plugin as unknown as RssDashboardPlugin, settings, { selectedTags: [] } as unknown as SidebarOptions, callbacks);
    modal.open();

    const handle = modal.contentEl.querySelector(
      ".rss-dashboard-sidebar-resize-handle",
    ) as HTMLDivElement;
    expect(handle).toBeTruthy();

    handle.dispatchEvent(new MouseEvent("mousedown", { clientX: 1100, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 1000, bubbles: true }));
    await flushPromises();

    expect(settings.sidebarWidth).toBe(400);
    expect(modal.modalEl.style.width).toBe("400px");

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await flushPromises();

    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  describe("updateAllFeedsIconRefreshState polling (stop button)", () => {
    async function openModalWithPlugin(
      pluginOverrides: Record<string, unknown>,
    ) {
      const { MobileNavigationModal } = await import(
        "../../../src/modals/mobile-navigation-modal"
      );
      const app = obsidian.App.createMock();
      const plugin = {
        saveSettings: vi.fn(async () => {}),
        isGlobalRefreshCancellable: false,
        isMultiFeedRefreshActive: false,
        activeRefreshState: new Map(),
        ...pluginOverrides,
      };
      const settings = {
        sidebarWidth: 280,
      } as unknown as RssDashboardSettings;
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
      modal.open();
      return { modal, plugin };
    }

    function injectIcon(modal: { contentEl: HTMLElement }): HTMLButtonElement {
      // Simulate the icon element that Sidebar.render() creates
      const icon = createEl("button");
      icon.className = "rss-dashboard-all-feeds-icon";
      icon.setAttribute("title", "Refresh all feeds");
      modal.contentEl
        .querySelector(".rss-dashboard-sidebar-container")!
        .appendChild(icon);
      return icon;
    }

    it("leaves the icon idle when no refresh is active", async () => {
      vi.useFakeTimers();
      let modal: Awaited<ReturnType<typeof openModalWithPlugin>>["modal"] | undefined;
      try {
        ({ modal } = await openModalWithPlugin({
          isGlobalRefreshCancellable: false,
          isMultiFeedRefreshActive: false,
        }));
        const icon = injectIcon(modal);

        vi.advanceTimersByTime(110);

        expect(icon.classList.contains("stop")).toBe(false);
        expect(icon.classList.contains("refreshing")).toBe(false);
        expect(icon.getAttribute("title")).toBe("Refresh all feeds");
        expect(icon.dataset.icon).toBe("refresh-cw");
      } finally {
        modal?.close();
        vi.useRealTimers();
      }
    });

    it("adds refreshing class but not stop when a plain multi-feed refresh is active", async () => {
      vi.useFakeTimers();
      let modal: Awaited<ReturnType<typeof openModalWithPlugin>>["modal"] | undefined;
      try {
        ({ modal } = await openModalWithPlugin({
          isGlobalRefreshCancellable: false,
          isMultiFeedRefreshActive: true,
        }));
        const icon = injectIcon(modal);

        vi.advanceTimersByTime(110);

        expect(icon.classList.contains("refreshing")).toBe(true);
        expect(icon.classList.contains("stop")).toBe(false);
        expect(icon.getAttribute("title")).toBe("Refresh all feeds");
        expect(icon.dataset.icon).toBe("refresh-cw");
      } finally {
        modal?.close();
        vi.useRealTimers();
      }
    });

    it("shows stop state (not refreshing) when global refresh is cancellable", async () => {
      vi.useFakeTimers();
      let modal: Awaited<ReturnType<typeof openModalWithPlugin>>["modal"] | undefined;
      try {
        ({ modal } = await openModalWithPlugin({
          isGlobalRefreshCancellable: true,
          isMultiFeedRefreshActive: true,
        }));
        const icon = injectIcon(modal);

        vi.advanceTimersByTime(110);

        expect(icon.classList.contains("stop")).toBe(true);
        expect(icon.classList.contains("refreshing")).toBe(false);
        expect(icon.getAttribute("title")).toBe("Stop refresh");
        expect(icon.dataset.icon).toBe("square-stop");
      } finally {
        modal?.close();
        vi.useRealTimers();
      }
    });
  });
});
