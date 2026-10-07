import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "obsidian";
import { setupReaderHotkeys } from "../../../src/hotkeys/reader-hotkeys";
import type { ReaderView } from "../../../src/views/reader-view";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

beforeEach(() => {
  installObsidianDomPolyfills();
});

afterEach(() => {
  activeDocument.body.empty();
});

type ScopeHandler = {
  key: string;
  modifiers?: string[] | null;
  func: (keyboardEvent: KeyboardEvent) => boolean | void;
};

function handlerFor(scope: Scope, key: string): ScopeHandler {
  const handlers = (scope as unknown as { handlers: ScopeHandler[] }).handlers;
  const handler = handlers.find(
    (candidate) =>
      candidate.key === key && (candidate.modifiers?.length ?? 0) === 0,
  );
  if (!handler) throw new Error(`No Reader shortcut registered for ${key}`);
  return handler;
}

function keydownOn(target: HTMLElement, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

// The Reader toolbar owns the arrow keys, Home and End while a toolbar button
// has focus (roving tabindex), so the scroll shortcuts must stand aside.
describe("Reader scroll shortcuts while the toolbar has focus", () => {
  function setup() {
    const scope = new Scope();
    const reader = {
      actionScrollLeft: vi.fn(),
      actionScrollRight: vi.fn(),
      actionScrollToStart: vi.fn(),
      actionScrollToEnd: vi.fn(),
      actionScrollUp: vi.fn(),
      actionScrollDown: vi.fn(),
    };
    setupReaderHotkeys(scope, reader as unknown as ReaderView);
    const toolbar = activeDocument.body.createDiv({
      cls: "rss-reader-actions",
    });
    const button = toolbar.createEl("button", { attr: { type: "button" } });
    const content = activeDocument.body.createDiv({
      cls: "rss-reader-content",
    });
    return { scope, reader, button, content };
  }

  it.each([
    ["ArrowLeft", "actionScrollLeft"],
    ["ArrowRight", "actionScrollRight"],
    ["Home", "actionScrollToStart"],
    ["End", "actionScrollToEnd"],
  ] as const)(
    "lets %s reach the toolbar instead of scrolling the article",
    (key, action) => {
      const { scope, reader, button } = setup();

      const handled = handlerFor(scope, key).func(keydownOn(button, key));

      // Obsidian's keymap keeps looking (and leaves the key unprevented) only
      // when a handler returns undefined; false would preventDefault it.
      expect(handled).toBeUndefined();
      expect(reader[action]).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["ArrowLeft", "actionScrollLeft"],
    ["ArrowRight", "actionScrollRight"],
    ["Home", "actionScrollToStart"],
    ["End", "actionScrollToEnd"],
  ] as const)(
    "still scrolls the article on %s from the content",
    (key, action) => {
      const { scope, reader, content } = setup();

      handlerFor(scope, key).func(keydownOn(content, key));

      expect(reader[action]).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the vertical scroll shortcuts working from a toolbar button", () => {
    const { scope, reader, button } = setup();

    handlerFor(scope, "ArrowDown").func(keydownOn(button, "ArrowDown"));

    expect(reader.actionScrollDown).toHaveBeenCalledTimes(1);
  });
});
