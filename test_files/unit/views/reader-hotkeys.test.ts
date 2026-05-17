import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "obsidian";
import { setupReaderHotkeys } from "../../../src/hotkeys/reader-hotkeys";

type ReaderHotkeyViewStub = {
  actionScrollUp: ReturnType<typeof vi.fn>;
  actionScrollDown: ReturnType<typeof vi.fn>;
  actionScrollLeft: ReturnType<typeof vi.fn>;
  actionScrollRight: ReturnType<typeof vi.fn>;
  actionPageUp: ReturnType<typeof vi.fn>;
  actionPageDown: ReturnType<typeof vi.fn>;
  actionScrollToStart: ReturnType<typeof vi.fn>;
  actionScrollToEnd: ReturnType<typeof vi.fn>;
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
  func: (this: void, evt: KeyboardEvent) => boolean;
};

describe("Reader hotkeys", () => {
  let scope: Scope;
  let view: ReaderHotkeyViewStub;

  beforeEach(() => {
    scope = new Scope();
    view = {
      actionScrollUp: vi.fn(),
      actionScrollDown: vi.fn(),
      actionScrollLeft: vi.fn(),
      actionScrollRight: vi.fn(),
      actionPageUp: vi.fn(),
      actionPageDown: vi.fn(),
      actionScrollToStart: vi.fn(),
      actionScrollToEnd: vi.fn(),
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

    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as KeyboardEvent;

    expect(baseZoomIn?.func(event)).toBe(true);
    expect(shiftedZoomIn?.func(event)).toBe(true);
    expect(baseZoomOut?.func(event)).toBe(true);
    expect(shiftedZoomOut?.func(event)).toBe(true);
    expect(zoomReset?.func(event)).toBe(true);

    expect(view.actionZoomIn.mock.calls).toHaveLength(2);
    expect(view.actionZoomOut.mock.calls).toHaveLength(2);
    expect(view.actionZoomReset.mock.calls).toHaveLength(1);
    expect(preventDefault.mock.calls).toHaveLength(5);
  });

  it("registers and routes Shift+d to dashboard refocus", () => {
    setupReaderHotkeys(scope, view as never);

    const handlers = (scope as unknown as { handlers: ScopeHandler[] }).handlers;
    const focusDashboard = handlers.find(
      (handler) => handler.key === "d" && handler.modifiers?.includes("Shift"),
    );
    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as KeyboardEvent;

    expect(focusDashboard).toBeDefined();
    expect(focusDashboard?.func(event)).toBe(true);
    expect(view.actionFocusDashboard.mock.calls).toHaveLength(1);
    expect(preventDefault.mock.calls).toHaveLength(1);
  });

  it("registers and routes reader scrolling keys", () => {
    setupReaderHotkeys(scope, view as never);

    const handlers = (scope as unknown as { handlers: ScopeHandler[] }).handlers;
    const preventDefault = vi.fn();
    const event = { preventDefault } as unknown as KeyboardEvent;

    const bindings: Array<{
      key: string;
      action: keyof Pick<
        ReaderHotkeyViewStub,
        | "actionScrollUp"
        | "actionScrollDown"
        | "actionScrollLeft"
        | "actionScrollRight"
        | "actionPageUp"
        | "actionPageDown"
        | "actionScrollToStart"
        | "actionScrollToEnd"
      >;
    }> = [
      { key: "ArrowUp", action: "actionScrollUp" },
      { key: "ArrowDown", action: "actionScrollDown" },
      { key: "ArrowLeft", action: "actionScrollLeft" },
      { key: "ArrowRight", action: "actionScrollRight" },
      { key: "PageUp", action: "actionPageUp" },
      { key: "PageDown", action: "actionPageDown" },
      { key: "Home", action: "actionScrollToStart" },
      { key: "End", action: "actionScrollToEnd" },
    ];

    bindings.forEach(({ key, action }) => {
      const handler = handlers.find(
        (registeredHandler) =>
          registeredHandler.key === key &&
          (!registeredHandler.modifiers ||
            registeredHandler.modifiers.length === 0),
      );

      expect(handler).toBeDefined();
      expect(handler?.func(event)).toBe(true);
      const actionMock = view[action];
      expect(actionMock.mock.calls).toHaveLength(1);
    });

    expect(preventDefault.mock.calls).toHaveLength(bindings.length);
  });
});
