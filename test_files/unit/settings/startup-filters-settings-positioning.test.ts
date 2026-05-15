import { beforeEach, describe, expect, it, vi } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

type ObsidianHTMLElement = HTMLElement & {
  empty: () => void;
  createDiv: (args?: unknown) => HTMLDivElement;
};

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function stubRect(rect: {
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
}): DOMRect {
  return rect as unknown as DOMRect;
}

describe("Startup filters settings popover positioning (integration)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    (document.body as ObsidianHTMLElement).empty();
  });

  it("opens above when anchor is near bottom and follows scroll reposition", async () => {
    vi.useFakeTimers();
    // Drive rAF through timers for deterministic tests.
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0) as unknown as number,
    );

    const { renderDisplaySettingsTab } = await import(
      "../../../src/settings/tabs/display-settings-tab"
    );

    const container = (document.body as ObsidianHTMLElement).createDiv();
    const settings = cloneSettings();

    // Minimal plugin mock
    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      notifyFiltersUpdated: vi.fn(() => {}),
      getActiveDashboardView: vi.fn(async () => null),
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
    };

    renderDisplaySettingsTab(container, plugin as unknown as RssDashboardPlugin, () => {});

    const buttons = Array.from(container.querySelectorAll("button"));
    const startupBtn = buttons.find((b) => (b.textContent ?? "") === "All");
    expect(startupBtn).toBeTruthy();

    // Stub viewport size
    Object.defineProperty(window, "innerHeight", { value: 740, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });

    let anchorRect = {
      top: 700,
      bottom: 730,
      left: 20,
      right: 120,
      width: 100,
      height: 30,
    };
    (startupBtn as HTMLButtonElement).getBoundingClientRect = () =>
      stubRect(anchorRect);

    // Stub menu/submenu rects in jsdom (layout is 0 otherwise)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains("rss-dashboard-startup-filters-menu-portal")) {
        return stubRect({
          top: 0,
          left: 0,
          bottom: 200,
          right: 190,
          width: 190,
          height: 200,
        });
      }
      if (this.classList.contains("rss-dashboard-tag-submenu")) {
        return stubRect({
          top: 0,
          left: 0,
          bottom: 300,
          right: 150,
          width: 150,
          height: 300,
        });
      }
      return originalGetBoundingClientRect.call(this);
    };

    startupBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.runAllTimersAsync();

    const portal = document.body.querySelector<HTMLElement>(
      ".rss-dashboard-startup-filters-menu-portal",
    );
    expect(portal).toBeTruthy();
    expect(parseFloat(portal?.style.top ?? "0")).toBeLessThan(anchorRect.top);

    const initialTop = portal?.style.top;

    // Simulate scroll moving the button upward in viewport coordinates
    anchorRect = {
      top: 500,
      bottom: 530,
      left: 20,
      right: 120,
      width: 100,
      height: 30,
    };
    document.dispatchEvent(new Event("scroll"));
    await vi.runAllTimersAsync();

    expect(portal?.style.top).not.toEqual(initialTop);

    // Restore prototype
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.useRealTimers();
  });

  it("positions tag submenu within viewport when opening Tagged submenu", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0) as unknown as number,
    );

    const { renderDisplaySettingsTab } = await import(
      "../../../src/settings/tabs/display-settings-tab"
    );

    const container = (document.body as ObsidianHTMLElement).createDiv();
    const settings = cloneSettings();
    settings.availableTags = [{ name: "A", color: "#111111" }];

    const plugin = {
      settings,
      saveSettings: vi.fn(async () => {}),
      notifyFiltersUpdated: vi.fn(() => {}),
      getActiveDashboardView: vi.fn(async () => null),
      app: { workspace: { revealLeaf: vi.fn(async () => {}) } },
    };

    renderDisplaySettingsTab(container, plugin as unknown as RssDashboardPlugin, () => {});

    const startupBtn = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "") === "All",
    );
    expect(startupBtn).toBeTruthy();

    Object.defineProperty(window, "innerHeight", { value: 260, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 260, configurable: true });

    startupBtn!.getBoundingClientRect = () =>
      stubRect({
        top: 200,
        bottom: 230,
        left: 200,
        right: 240,
        width: 40,
        height: 30,
      });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.classList.contains("rss-dashboard-startup-filters-menu-portal")) {
        return stubRect({
          top: 0,
          left: 0,
          bottom: 200,
          right: 190,
          width: 190,
          height: 200,
        });
      }
      if (this.classList.contains("rss-dashboard-tag-submenu")) {
        // Force a too-tall submenu to require clamping.
        return stubRect({
          top: 0,
          left: 0,
          bottom: 500,
          right: 150,
          width: 150,
          height: 500,
        });
      }
      return originalGetBoundingClientRect.call(this);
    };

    startupBtn!.click();
    await vi.runAllTimersAsync();

    const taggedRow = Array.from(
      document.body.querySelectorAll<HTMLElement>(".rss-dashboard-filter-menu-item"),
    ).find((el) => (el.textContent ?? "").includes("Tagged"));
    expect(taggedRow).toBeTruthy();

    taggedRow!.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    await vi.runAllTimersAsync();

    const submenu = document.body.querySelector<HTMLElement>(".rss-dashboard-tag-submenu");
    expect(submenu).toBeTruthy();

    const cssTop = submenu?.style.getPropertyValue("--submenu-top");
    const cssLeft = submenu?.style.getPropertyValue("--submenu-left");
    expect(cssTop).toBeTruthy();
    expect(cssLeft).toBeTruthy();

    const top = parseFloat(cssTop ?? "0");
    const left = parseFloat(cssLeft ?? "0");
    expect(top).toBeGreaterThanOrEqual(0);
    expect(left).toBeGreaterThanOrEqual(0);

    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.useRealTimers();
  });
});
