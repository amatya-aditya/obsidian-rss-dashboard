import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "obsidian";
import { setupReaderHotkeys } from "../../../src/hotkeys/reader-hotkeys";

type ReaderHotkeyViewStub = {
  actionZoomIn: ReturnType<typeof vi.fn>;
  actionZoomOut: ReturnType<typeof vi.fn>;
  actionZoomReset: ReturnType<typeof vi.fn>;
  actionNavigateNext: ReturnType<typeof vi.fn>;
  actionNavigatePrevious: ReturnType<typeof vi.fn>;
  actionFocusDashboard: ReturnType<typeof vi.fn>;
  actionToggleArticleOpen: ReturnType<typeof vi.fn>;
  actionToggleReadStatus: ReturnType<typeof vi.fn>;
  actionMarkAllAsRead: ReturnType<typeof vi.fn>;
  actionToggleStarStatus: ReturnType<typeof vi.fn>;
  actionToggleTagsMenu: ReturnType<typeof vi.fn>;
  actionSaveCurrentArticle: ReturnType<typeof vi.fn>;
  actionOpenShortcutHelp: ReturnType<typeof vi.fn>;
};

type ScopeHandler = {
  modifiers: string[] | null;
  key: string | null;
  func: (evt: KeyboardEvent) => boolean;
};

describe("Reader hotkeys", () => {
  let scope: Scope;
  let view: ReaderHotkeyViewStub;

  beforeEach(() => {
    scope = new Scope();
    view = {
      actionZoomIn: vi.fn(),
      actionZoomOut: vi.fn(),
      actionZoomReset: vi.fn(),
      actionNavigateNext: vi.fn(),
      actionNavigatePrevious: vi.fn(),
      actionFocusDashboard: vi.fn(),
      actionToggleArticleOpen: vi.fn(),
      actionToggleReadStatus: vi.fn(),
      actionMarkAllAsRead: vi.fn(),
      actionToggleStarStatus: vi.fn(),
      actionToggleTagsMenu: vi.fn(),
      actionSaveCurrentArticle: vi.fn(),
      actionOpenShortcutHelp: vi.fn(),
    };
  });

  it("registers normalized zoom bindings for reader font size controls", () => {
    setupReaderHotkeys(scope, view as never);

    const handlers = (scope as unknown as { handlers: ScopeHandler[] }).handlers;

    expect(
      handlers.find(
        (handler) =>
          handler.key === "=" &&
          (!handler.modifiers || handler.modifiers.length === 0),
      ),
    ).toBeDefined();
    expect(
      handlers.find(
        (handler) =>
          handler.key === "=" && handler.modifiers?.includes("Shift"),
      ),
    ).toBeDefined();
    expect(
      handlers.find(
        (handler) =>
          handler.key === "-" &&
          (!handler.modifiers || handler.modifiers.length === 0),
      ),
    ).toBeDefined();
    expect(
      handlers.find(
        (handler) =>
          handler.key === "-" && handler.modifiers?.includes("Shift"),
      ),
    ).toBeDefined();
    expect(
      handlers.find(
        (handler) =>
          handler.key === "0" &&
          (!handler.modifiers || handler.modifiers.length === 0),
      ),
    ).toBeDefined();
  });

  it("routes normalized zoom bindings to the reader zoom actions", () => {
    setupReaderHotkeys(scope, view as never);

    const handlers = (scope as unknown as { handlers: ScopeHandler[] }).handlers;
    const baseZoomIn = handlers.find(
      (handler) =>
        handler.key === "=" &&
        (!handler.modifiers || handler.modifiers.length === 0),
    );
    const shiftedZoomIn = handlers.find(
      (handler) => handler.key === "=" && handler.modifiers?.includes("Shift"),
    );
    const baseZoomOut = handlers.find(
      (handler) =>
        handler.key === "-" &&
        (!handler.modifiers || handler.modifiers.length === 0),
    );
    const shiftedZoomOut = handlers.find(
      (handler) => handler.key === "-" && handler.modifiers?.includes("Shift"),
    );
    const zoomReset = handlers.find(
      (handler) =>
        handler.key === "0" &&
        (!handler.modifiers || handler.modifiers.length === 0),
    );

    const event = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

    expect(baseZoomIn?.func(event)).toBe(true);
    expect(shiftedZoomIn?.func(event)).toBe(true);
    expect(baseZoomOut?.func(event)).toBe(true);
    expect(shiftedZoomOut?.func(event)).toBe(true);
    expect(zoomReset?.func(event)).toBe(true);

    expect(view.actionZoomIn).toHaveBeenCalledTimes(2);
    expect(view.actionZoomOut).toHaveBeenCalledTimes(2);
    expect(view.actionZoomReset).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(5);
  });

  it("registers and routes Shift+d to dashboard refocus", () => {
    setupReaderHotkeys(scope, view as never);

    const handlers = (scope as unknown as { handlers: ScopeHandler[] }).handlers;
    const focusDashboard = handlers.find(
      (handler) => handler.key === "d" && handler.modifiers?.includes("Shift"),
    );
    const event = { preventDefault: vi.fn() } as unknown as KeyboardEvent;

    expect(focusDashboard).toBeDefined();
    expect(focusDashboard?.func(event)).toBe(true);
    expect(view.actionFocusDashboard).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
});
