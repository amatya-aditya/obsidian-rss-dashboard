import { beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "obsidian";
import { setupReaderHotkeys } from "../../../src/hotkeys/reader-hotkeys";
import type { ReaderView } from "../../../src/views/reader-view";

type ScopeHandler = {
  modifiers: string[] | null;
  key: string | null;
  func: (evt: KeyboardEvent) => boolean | undefined;
};

type KeyCase = { label: string; key: string; shift: boolean; action: string };

// Keys that act once per press: holding one must not repeat the action.
const SINGLE_PRESS_KEYS: KeyCase[] = [
  { label: "k", key: "k", shift: false, action: "actionToggleArticleOpen" },
  { label: "Shift+D", key: "d", shift: true, action: "actionFocusDashboard" },
  { label: "Shift+S", key: "s", shift: true, action: "actionFocusSidebar" },
  { label: "Shift+R", key: "r", shift: true, action: "actionFocusReader" },
  { label: "m", key: "m", shift: false, action: "actionToggleReadStatus" },
  { label: "Shift+A", key: "a", shift: true, action: "actionMarkAllAsRead" },
  { label: "f", key: "f", shift: false, action: "actionToggleStarStatus" },
  { label: "t", key: "t", shift: false, action: "actionToggleTagsMenu" },
  { label: "s", key: "s", shift: false, action: "actionSaveCurrentArticle" },
  { label: ",", key: ",", shift: false, action: "actionMarkReadAndNext" },
  { label: "Shift+?", key: "?", shift: true, action: "actionOpenShortcutHelp" },
  { label: "0", key: "0", shift: false, action: "actionZoomReset" },
];

// Scroll, zoom and article navigation keys: holding one keeps going.
const REPEATING_KEYS: KeyCase[] = [
  { label: "ArrowUp", key: "ArrowUp", shift: false, action: "actionScrollUp" },
  {
    label: "ArrowDown",
    key: "ArrowDown",
    shift: false,
    action: "actionScrollDown",
  },
  {
    label: "ArrowLeft",
    key: "ArrowLeft",
    shift: false,
    action: "actionScrollLeft",
  },
  {
    label: "ArrowRight",
    key: "ArrowRight",
    shift: false,
    action: "actionScrollRight",
  },
  { label: "PageUp", key: "PageUp", shift: false, action: "actionPageUp" },
  {
    label: "PageDown",
    key: "PageDown",
    shift: false,
    action: "actionPageDown",
  },
  { label: "Home", key: "Home", shift: false, action: "actionScrollToStart" },
  { label: "End", key: "End", shift: false, action: "actionScrollToEnd" },
  { label: "=", key: "=", shift: false, action: "actionZoomIn" },
  { label: "Shift+=", key: "=", shift: true, action: "actionZoomIn" },
  { label: "-", key: "-", shift: false, action: "actionZoomOut" },
  { label: "Shift+-", key: "-", shift: true, action: "actionZoomOut" },
  { label: "j", key: "j", shift: false, action: "actionNavigatePrevious" },
  { label: "l", key: "l", shift: false, action: "actionNavigateNext" },
];

const ACTIONS = [...SINGLE_PRESS_KEYS, ...REPEATING_KEYS].map(
  (entry) => entry.action,
);

describe("Reader hotkeys while a key is held", () => {
  let scope: Scope;
  let view: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    scope = new Scope();
    view = Object.fromEntries(ACTIONS.map((name) => [name, vi.fn()]));
    setupReaderHotkeys(scope, view as unknown as ReaderView);
  });

  function press(key: string, shift: boolean, repeat: boolean) {
    const handlers = (scope as unknown as { handlers: ScopeHandler[] })
      .handlers;
    const handler = handlers.find(
      (candidate) =>
        candidate.key === key &&
        (candidate.modifiers?.includes("Shift") ?? false) === shift,
    );
    if (!handler) throw new Error(`No Reader shortcut for ${key}`);
    const event = new KeyboardEvent("keydown", {
      key,
      shiftKey: shift,
      repeat,
      bubbles: true,
      cancelable: true,
    });
    return { result: handler.func(event), event };
  }

  it.each(SINGLE_PRESS_KEYS)(
    "acts once per press of $label, not on auto-repeat",
    ({ key, shift, action }) => {
      press(key, shift, false);
      expect(view[action]).toHaveBeenCalledTimes(1);

      press(key, shift, true);
      press(key, shift, true);
      expect(view[action]).toHaveBeenCalledTimes(1);

      press(key, shift, false);
      expect(view[action]).toHaveBeenCalledTimes(2);
    },
  );

  it.each(SINGLE_PRESS_KEYS)(
    "treats the held $label as handled so it reaches no other scope",
    ({ key, shift }) => {
      const { result, event } = press(key, shift, true);

      expect(result).toBe(true);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it.each(REPEATING_KEYS)(
    "keeps acting on every auto-repeat of $label",
    ({ key, shift, action }) => {
      press(key, shift, false);
      press(key, shift, true);
      press(key, shift, true);

      expect(view[action]).toHaveBeenCalledTimes(3);
    },
  );
});
