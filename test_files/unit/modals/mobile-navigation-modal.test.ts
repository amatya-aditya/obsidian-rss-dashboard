import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

let lastSidebarInstance: any | null = null;

vi.mock("../../../src/components/sidebar", () => {
  class Sidebar {
    callbacks: any;
    rendered = false;
    destroyed = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_app: any, _container: any, _plugin: any, _settings: any, _options: any, callbacks: any) {
      this.callbacks = callbacks;
      lastSidebarInstance = this;
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
    document.body.empty();
    Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
    lastSidebarInstance = null;
    vi.restoreAllMocks();
  });

  it("wraps sidebar callbacks and closes on feed/folder clicks", async () => {
    const { MobileNavigationModal } = await import("../../../src/modals/mobile-navigation-modal");

    const app = obsidian.App.createMock();
    const plugin = { saveSettings: vi.fn(async () => {}) };
    const settings = { sidebarWidth: 280 } as any;
    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onCloseMobileSidebar: vi.fn(),
    };

    const modal = new MobileNavigationModal(app as any, plugin as any, settings, {} as any, callbacks as any);

    const closeBtn = document.createElement("button");
    closeBtn.className = "modal-close-button";
    modal.modalEl.appendChild(closeBtn);

    modal.open();

    expect(modal.modalEl.classList.contains("rss-mobile-navigation-modal")).toBe(true);
    expect(modal.modalEl.querySelector(".modal-close-button")).toBeFalsy();
    expect(lastSidebarInstance?.rendered).toBe(true);
    expect(modal.modalEl.style.width).toBe("280px");

    lastSidebarInstance.callbacks.onTagToggle("AI");
    expect(callbacks.onTagToggle).toHaveBeenCalledWith("AI");
    expect(modal.containerEl.isConnected).toBe(true);

    lastSidebarInstance.callbacks.onFeedClick({ url: "x" });
    expect(callbacks.onFeedClick).toHaveBeenCalledTimes(1);
    expect(modal.containerEl.isConnected).toBe(false);

    // Re-open to validate folder click behavior too
    modal.open();
    lastSidebarInstance.callbacks.onFolderClick("Tech");
    expect(callbacks.onFolderClick).toHaveBeenCalledWith("Tech");
    expect(modal.containerEl.isConnected).toBe(false);
  });

  it("updates width during drag and persists on mouseup", async () => {
    const { MobileNavigationModal } = await import("../../../src/modals/mobile-navigation-modal");

    const app = obsidian.App.createMock();
    const plugin = { saveSettings: vi.fn(async () => {}) };
    const settings = { sidebarWidth: 280 } as any;
    const callbacks = {
      onFolderClick: vi.fn(),
      onFeedClick: vi.fn(),
      onTagToggle: vi.fn(),
      onClearTags: vi.fn(),
      onTagFilterModeChange: vi.fn(),
      onCloseMobileSidebar: vi.fn(),
    };

    const modal = new MobileNavigationModal(app as any, plugin as any, settings, {} as any, callbacks as any);
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
});

