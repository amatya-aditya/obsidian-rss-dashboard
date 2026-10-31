import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App, type WorkspaceLeaf } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { RssDashboardView } from "../../../src/views/dashboard-view";
import { DEFAULT_SETTINGS, type Feed } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

/**
 * The refresh row's error icon is dismissible without persisting anything: a
 * right-click, the context-menu key, or a 500 ms touch long-press hides it for
 * the rest of the current refresh attempt, and the next attempt brings it back
 * (#1353). Tests re-render through `refreshFilterStatusBarOnly`, the path a
 * settings or sidebar change uses, so the icon's gate is exercised the way the
 * dashboard reaches it.
 */
interface PluginStub {
  settings: typeof DEFAULT_SETTINGS;
  saveSettings: ReturnType<typeof vi.fn>;
  activeRefreshState: Map<string, { status: string; startedAt: number }>;
  isUserStateUnreadable: boolean;
  isShardFolderHiddenFromSync: boolean;
  refreshAttemptGeneration: number;
}

function failingFeed(): Feed {
  return {
    title: "Broken",
    url: "https://example.com/broken.xml",
    folder: "",
    items: [],
    lastUpdated: 0,
    lastFetchError: "HTTP 500",
  };
}

describe("Dashboard refresh error icon dismissal", () => {
  let view: RssDashboardView;
  let content: HTMLElement;
  let plugin: PluginStub;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installObsidianDomPolyfills();
    vi.stubGlobal("innerWidth", 1000);
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.feeds = [failingFeed()];
    plugin = {
      settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      activeRefreshState: new Map(),
      isUserStateUnreadable: false,
      isShardFolderHiddenFromSync: false,
      refreshAttemptGeneration: 0,
    };
    const leaf = { app: new App() } as unknown as WorkspaceLeaf;
    view = new RssDashboardView(leaf, plugin as unknown as RssDashboardPlugin);
    // `onOpen` makes the view root a Tab stop, attaches it to the workspace,
    // and builds the content area; this test does the same minimum by hand.
    view.containerEl.tabIndex = -1;
    document.body.appendChild(view.containerEl);
    content = view.containerEl.createDiv({ cls: "rss-dashboard-content" });
    content.createDiv({ cls: "rss-dashboard-articles" });
  });

  afterEach(() => {
    document.body.empty();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Re-renders the strip the way a settings or sidebar change does. */
  function renderStrip(): HTMLElement {
    view.refreshFilterStatusBarOnly();
    return content;
  }

  /** Finds the error control by role and accessible name, not by a hook. */
  function errorButton(container: HTMLElement): HTMLButtonElement | null {
    return (
      Array.from(container.querySelectorAll("button")).find((button) =>
        (button.getAttribute("aria-label") ?? "").startsWith(
          "Show details for ",
        ),
      ) ?? null
    );
  }

  function errorButtonOrThrow(container: HTMLElement): HTMLButtonElement {
    const button = errorButton(container);
    expect(button).not.toBeNull();
    return button!;
  }

  function noticeMessages(): string[] {
    const calls = (debugSpy as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    return calls
      .filter((call) => call[0] === "[Stub Notice]")
      .map((call) => String(call[1]));
  }

  function contextMenuOn(button: HTMLElement): MouseEvent {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(event);
    return event;
  }

  it("dismisses on right-click while keeping the visible status text", () => {
    const container = renderStrip();
    const button = errorButtonOrThrow(container);
    const statusText = container.querySelector(
      ".rss-dashboard-refresh-status-text",
    );

    const event = contextMenuOn(button);

    expect(event.defaultPrevented).toBe(true);
    expect(errorButton(container)).toBeNull();
    expect(container.querySelector(".rss-dashboard-refresh-status-text")).toBe(
      statusText,
    );
    expect(statusText?.hasAttribute("aria-live")).toBe(false);
    expect(noticeMessages()).toHaveLength(1);
  });

  it("keeps the icon hidden across settings and scope re-renders", () => {
    const container = renderStrip();
    contextMenuOn(errorButtonOrThrow(container));

    // A settings change rebuilds the strip at the same generation.
    plugin.settings.display.showFilterStatusBar = true;
    expect(errorButton(renderStrip())).toBeNull();
    // A scope change (selecting a feed) rebuilds it again.
    view.selectedFeeds = [plugin.settings.feeds[0].url];
    expect(errorButton(renderStrip())).toBeNull();
  });

  it("restores the icon once the next refresh attempt starts", () => {
    const container = renderStrip();
    contextMenuOn(errorButtonOrThrow(container));
    expect(errorButton(renderStrip())).toBeNull();

    plugin.refreshAttemptGeneration += 1;

    expect(errorButtonOrThrow(renderStrip())).not.toBeNull();
  });

  it("dismisses after a 500 ms touch long-press and swallows the click", () => {
    vi.useFakeTimers();
    const container = renderStrip();
    const button = errorButtonOrThrow(container);

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "touch",
      }),
    );
    vi.advanceTimersByTime(499);
    expect(errorButton(container)).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(errorButton(container)).toBeNull();
    expect(noticeMessages()).toHaveLength(1);

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("does not dismiss when the press moves, lifts early, or is cancelled", () => {
    vi.useFakeTimers();
    const container = renderStrip();
    const button = errorButtonOrThrow(container);

    for (const endType of ["pointerup", "pointercancel", "pointermove"]) {
      button.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerType: "touch",
        }),
      );
      vi.advanceTimersByTime(200);
      button.dispatchEvent(new PointerEvent(endType, { bubbles: true }));
      vi.advanceTimersByTime(1000);
    }
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerType: "mouse",
      }),
    );
    vi.advanceTimersByTime(1000);

    expect(errorButton(container)).not.toBeNull();
    expect(noticeMessages()).toHaveLength(0);
  });

  it("dismisses from the keyboard and hands focus to the dashboard", () => {
    const container = renderStrip();
    const button = errorButtonOrThrow(container);
    expect(button.getAttribute("aria-label")).toBe(
      "Show details for 1 failing feed",
    );
    button.focus();
    expect(document.activeElement).toBe(button);

    button.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "F10",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(errorButton(container)).toBeNull();
    expect(document.activeElement).toBe(view.containerEl);
    expect(noticeMessages()).toHaveLength(1);
  });

  it("still opens the Feed error dialog on left click", () => {
    const container = renderStrip();
    const button = errorButtonOrThrow(container);

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("HTTP 500");
    expect(noticeMessages()).toHaveLength(0);
  });

  it("keeps dismissal per view and writes no settings", () => {
    const settingsBefore = JSON.stringify(plugin.settings);
    const container = renderStrip();
    contextMenuOn(errorButtonOrThrow(container));
    expect(noticeMessages()).toHaveLength(1);

    // A second dashboard view shares the plugin settings but not the dismissal.
    const otherLeaf = { app: new App() } as unknown as WorkspaceLeaf;
    const otherView = new RssDashboardView(
      otherLeaf,
      plugin as unknown as RssDashboardPlugin,
    );
    otherView.containerEl.createDiv({ cls: "rss-dashboard-content" });
    otherView.refreshFilterStatusBarOnly();

    expect(errorButton(otherView.containerEl)).not.toBeNull();
    expect(plugin.saveSettings).not.toHaveBeenCalled();
    expect(JSON.stringify(plugin.settings)).toBe(settingsBefore);
  });
});
