/**
 * The dashboard view's readiness flag and refresh live region (#842, AC-012,
 * AC-013, TEST-009). Drives the real view lifecycle: open, render, close, and
 * open again, and reads what a harness or a screen reader would see.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import * as ObsidianStubs from "../../stubs/obsidian";
import type { App, WorkspaceLeaf } from "../../stubs/obsidian";
import type { RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function createDashboard(app: App = ObsidianStubs.App.createMock() as App) {
  const leaf = {
    view: null,
    setViewState: vi.fn(),
    app,
  } as unknown as WorkspaceLeaf;
  const settings = {
    feeds: [],
    folders: [],
    display: {
      sidebarRowSpacing: 10,
      sidebarRowIndentation: 20,
      sidebarItemPaddingLeft: 2,
      sidebarItemPaddingRight: 2,
    },
    availableTags: [],
    dashboardMultiFilters: {},
    articleFilter: { type: "age", value: 0 },
    viewStyle: "list",
  } as unknown as RssDashboardSettings;
  const plugin = {
    app,
    settings,
    saveSettings: vi.fn().mockResolvedValue(undefined),
    maybeShowStorageDeprecationPrompt: vi.fn(),
  } as unknown as RssDashboardPlugin;
  const view = new RssDashboardView(leaf, plugin);
  document.body.appendChild(view.containerEl);
  return view;
}

const READY = "data-rss-ready";

describe("dashboard readiness flag (data-rss-ready)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  it("is absent before the view opens", () => {
    const view = createDashboard();

    expect(view.containerEl.hasAttribute(READY)).toBe(false);
  });

  it("is absent while the first render runs and present once it has finished", async () => {
    const view = createDashboard();
    const seenDuringRender: boolean[] = [];
    const render = view.render.bind(view);
    vi.spyOn(view, "render").mockImplementation(() => {
      seenDuringRender.push(view.containerEl.hasAttribute(READY));
      render();
    });

    await view.onOpen();

    expect(seenDuringRender).toEqual([false]);
    expect(view.containerEl.hasAttribute(READY)).toBe(true);
    await view.onClose();
  });

  it("stays present across later renders", async () => {
    const view = createDashboard();
    await view.onOpen();

    view.refresh();
    view.refresh();

    expect(view.containerEl.hasAttribute(READY)).toBe(true);
    await view.onClose();
  });

  it("is absent after the view closes, and set again by a reopened view", async () => {
    const app = ObsidianStubs.App.createMock() as App;
    const first = createDashboard(app);
    await first.onOpen();
    await first.onClose();
    expect(first.containerEl.hasAttribute(READY)).toBe(false);

    const second = createDashboard(app);
    expect(second.containerEl.hasAttribute(READY)).toBe(false);
    await second.onOpen();

    expect(second.containerEl.hasAttribute(READY)).toBe(true);
    await second.onClose();
  });
});

describe("dashboard refresh live region", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  function regions(view: RssDashboardView): HTMLElement[] {
    return Array.from(
      view.containerEl.querySelectorAll<HTMLElement>('[aria-live="polite"]'),
    ).filter((el) => el.classList.contains("rss-dashboard-refresh-announcer"));
  }

  it("is one polite status region, present after open and across renders", async () => {
    const view = createDashboard();
    await view.onOpen();
    view.refresh();

    const found = regions(view);
    expect(found).toHaveLength(1);
    expect(found[0]?.getAttribute("role")).toBe("status");
    expect(found[0]?.textContent).toBe("");
    await view.onClose();
  });

  it("belongs to its own view: two open dashboards each get one region", async () => {
    const app = ObsidianStubs.App.createMock() as App;
    const first = createDashboard(app);
    const second = createDashboard(app);
    await first.onOpen();
    await second.onOpen();

    expect(regions(first)).toHaveLength(1);
    expect(regions(second)).toHaveLength(1);
    expect(regions(first)[0]).not.toBe(regions(second)[0]);
    await first.onClose();
    await second.onClose();
  });
});
