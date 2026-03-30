import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

let lastDiscoverSidebarInstance: any | null = null;

vi.mock("../../../src/components/discover-sidebar", () => {
  class DiscoverSidebar {
    callbacks: any;
    rendered = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(_app: any, _container: any, _plugin: any, _filters: any, _feeds: any, _section: any, callbacks: any) {
      this.callbacks = callbacks;
      lastDiscoverSidebarInstance = this;
    }

    render(): void {
      this.rendered = true;
    }
  }

  return { DiscoverSidebar };
});

describe("MobileDiscoverFiltersModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
    lastDiscoverSidebarInstance = null;
    vi.restoreAllMocks();
  });

  it("renders the discover sidebar and closes via callback", async () => {
    const { MobileDiscoverFiltersModal } = await import(
      "../../../src/modals/mobile-discover-filters-modal"
    );

    const app = obsidian.App.createMock();
    const plugin = {
      activateView: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
    };
    const onFilterChange = vi.fn();

    const modal = new MobileDiscoverFiltersModal(
      app as any,
      plugin as any,
      { query: "", types: [], categories: [], tags: [], tagMode: "any" } as any,
      [],
      "types",
      onFilterChange,
    );

    const closeBtn = document.createElement("button");
    closeBtn.className = "modal-close-button";
    modal.modalEl.appendChild(closeBtn);

    modal.open();

    expect(modal.modalEl.classList.contains("rss-mobile-discover-filters-modal")).toBe(true);
    expect(modal.modalEl.querySelector(".modal-close-button")).toBeFalsy();
    expect(lastDiscoverSidebarInstance?.rendered).toBe(true);

    lastDiscoverSidebarInstance.callbacks.onFilterChange();
    expect(onFilterChange).toHaveBeenCalledTimes(1);

    lastDiscoverSidebarInstance.callbacks.onCloseMobileSidebar();
    expect(modal.containerEl.isConnected).toBe(false);
  });
});

