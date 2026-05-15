import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

interface MockSidebar {
  rendered: boolean;
  callbacks: { onFilterChange: () => void; onCloseMobileSidebar: () => void; };
}

let lastDiscoverSidebarInstance: MockSidebar | null = null;

vi.mock("../../../src/components/discover-sidebar", () => {
  class DiscoverSidebar {
    callbacks: { onFilterChange: () => void; onCloseMobileSidebar: () => void; };
    rendered = false;

    constructor(_app: unknown, _container: unknown, _plugin: unknown, _filters: unknown, _feeds: unknown, _section: unknown, callbacks: { onFilterChange: () => void; onCloseMobileSidebar: () => void; }) {
      this.callbacks = callbacks;
      // eslint-disable-next-line @typescript-eslint/no-this-alias
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
      app as unknown as obsidian.App,
      plugin as unknown as import("../../../main").default,
      { query: "", types: [], categories: [], tags: [], tagMode: "any" } as unknown as import("../../../src/types/discover-types").DiscoverFilters,
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

    lastDiscoverSidebarInstance?.callbacks.onFilterChange();
    expect(onFilterChange).toHaveBeenCalledTimes(1);

    lastDiscoverSidebarInstance?.callbacks.onCloseMobileSidebar();
    expect(modal.containerEl.isConnected).toBe(false);
  });
});
