import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ItemView } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { setupDashboardHotkeys } from "../../../src/hotkeys/dashboard-hotkeys";
import type { RssDashboardView } from "../../../src/views/dashboard-view";

/**
 * Regression for #879: shortcuts act on the focused dashboard wherever it is
 * docked. The workspace reports only its active view, which is what Obsidian
 * returns for a sidebar leaf; getMostRecentLeaf() never matched one.
 */
type Handler = (e: KeyboardEvent) => void;

interface Dashboard {
  view: RssDashboardView;
  press: (key: string) => KeyboardEvent;
  next: ReturnType<typeof vi.fn>;
}

function makeDashboard(active: { current: unknown }): Dashboard {
  const next = vi.fn();
  let handler: Handler | null = null;
  const view = {
    containerEl: {
      ownerDocument: activeDocument,
      onWindowMigrated: vi.fn(() => () => {}),
    },
    register: vi.fn(),
    registerDomEvent: vi.fn((_doc: Document, _type: string, cb: Handler) => {
      handler = cb;
    }),
    app: {
      workspace: {
        getActiveViewOfType: vi.fn((type: unknown) =>
          type === ItemView ? active.current : null,
        ),
      },
    },
    actionNavigateNext: next,
  } as unknown as RssDashboardView;
  setupDashboardHotkeys(view);

  const press = (key: string): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    handler?.(event);
    return event;
  };
  return { view, press, next };
}

describe("Dashboard hotkeys follow the focused view", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    activeDocument.body.empty();
  });

  afterEach(() => {
    activeDocument.body.empty();
  });

  it("acts when this dashboard is the active view, wherever it is docked", () => {
    const active: { current: unknown } = { current: null };
    const dashboard = makeDashboard(active);
    active.current = dashboard.view;

    const event = dashboard.press("l");

    expect(dashboard.next).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("acts on the focused dashboard only when two are open", () => {
    const active: { current: unknown } = { current: null };
    const main = makeDashboard(active);
    const docked = makeDashboard(active);

    active.current = docked.view;
    main.press("l");
    docked.press("l");
    expect(main.next).not.toHaveBeenCalled();
    expect(docked.next).toHaveBeenCalledTimes(1);

    active.current = main.view;
    main.press("l");
    docked.press("l");
    expect(main.next).toHaveBeenCalledTimes(1);
    expect(docked.next).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["the Reader", {}],
    ["no view", null],
  ])("stands down when %s is active", (_label, other) => {
    const active: { current: unknown } = { current: other };
    const dashboard = makeDashboard(active);

    const event = dashboard.press("l");

    expect(dashboard.next).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
