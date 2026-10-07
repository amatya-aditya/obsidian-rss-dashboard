import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setupDashboardHotkeys } from "../../../src/hotkeys/dashboard-hotkeys";
import type { RssDashboardView } from "../../../src/views/dashboard-view";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type KeyCase = { label: string; key: string; shift: boolean; action: string };

// Keys that act once per press: holding one must not repeat the action.
const SINGLE_PRESS_KEYS: KeyCase[] = [
  { label: "r", key: "r", shift: false, action: "actionRefreshFeeds" },
  { label: "o", key: "o", shift: false, action: "actionToggleArticleOpen" },
  {
    label: "Enter",
    key: "Enter",
    shift: false,
    action: "actionToggleArticleOpen",
  },
  { label: "k", key: "k", shift: false, action: "actionCloseReader" },
  { label: "m", key: "m", shift: false, action: "actionToggleReadStatus" },
  { label: "f", key: "f", shift: false, action: "actionToggleStarStatus" },
  { label: "t", key: "t", shift: false, action: "actionToggleTagsMenu" },
  { label: "s", key: "s", shift: false, action: "actionSaveSelectedArticle" },
  { label: "1", key: "1", shift: false, action: "actionSetViewStyle" },
  { label: "2", key: "2", shift: false, action: "actionSetViewStyle" },
  { label: "3", key: "3", shift: false, action: "actionSetViewStyle" },
  { label: ",", key: ",", shift: false, action: "actionMarkReadAndNext" },
  { label: "Shift+S", key: "S", shift: true, action: "actionFocusSidebar" },
  { label: "Shift+R", key: "R", shift: true, action: "actionFocusReader" },
  {
    label: "Shift+O",
    key: "O",
    shift: true,
    action: "actionSidebarOpenFocused",
  },
  {
    label: "Shift+Enter",
    key: "Enter",
    shift: true,
    action: "actionSidebarOpenFocused",
  },
  {
    label: "Shift+X",
    key: "X",
    shift: true,
    action: "actionSidebarToggleFocusedFolder",
  },
  {
    label: "Shift+D",
    key: "D",
    shift: true,
    action: "actionSidebarDeleteFocused",
  },
  { label: "Shift+A", key: "A", shift: true, action: "actionMarkAllAsRead" },
  { label: "Shift+1", key: "!", shift: true, action: "actionSetStatusFilter" },
  { label: "Shift+2", key: "@", shift: true, action: "actionSetStatusFilter" },
  { label: "Shift+3", key: "#", shift: true, action: "actionSetStatusFilter" },
  { label: "Shift+?", key: "?", shift: true, action: "actionOpenShortcutHelp" },
];

// Navigation and scroll keys: holding one keeps moving.
const REPEATING_KEYS: KeyCase[] = [
  { label: "j", key: "j", shift: false, action: "actionNavigatePrevious" },
  { label: "l", key: "l", shift: false, action: "actionNavigateNext" },
  { label: "Space", key: " ", shift: false, action: "actionNavigateNext" },
  {
    label: "Shift+Space",
    key: " ",
    shift: true,
    action: "actionNavigatePrevious",
  },
  {
    label: "ArrowLeft",
    key: "ArrowLeft",
    shift: false,
    action: "actionNavigateCard",
  },
  {
    label: "ArrowRight",
    key: "ArrowRight",
    shift: false,
    action: "actionNavigateCard",
  },
  {
    label: "ArrowUp",
    key: "ArrowUp",
    shift: false,
    action: "actionNavigateCard",
  },
  {
    label: "ArrowDown",
    key: "ArrowDown",
    shift: false,
    action: "actionNavigateCard",
  },
  {
    label: "Shift+J",
    key: "J",
    shift: true,
    action: "actionSidebarMovePrevious",
  },
  { label: "Shift+L", key: "L", shift: true, action: "actionSidebarMoveNext" },
];

function setup() {
  installObsidianDomPolyfills();
  const actions = new Map<string, ReturnType<typeof vi.fn>>();
  let handler: ((e: KeyboardEvent) => void) | null = null;
  const base: Record<string, unknown> = {
    containerEl: {
      ownerDocument: activeDocument,
      onWindowMigrated: vi.fn(() => () => {}),
    },
    register: vi.fn(),
    registerDomEvent: vi.fn(
      (_doc: Document, _type: string, cb: (e: KeyboardEvent) => void) => {
        handler = cb;
      },
    ),
  };
  // Every `action*` and `is*` method is a spy created on first use.
  const view = new Proxy(base, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      if (!prop.startsWith("action") && !prop.startsWith("is"))
        return undefined;
      let spy = actions.get(prop);
      if (!spy) {
        spy = vi.fn();
        actions.set(prop, spy);
      }
      return spy;
    },
  }) as unknown as RssDashboardView;
  base.app = { workspace: { getMostRecentLeaf: () => ({ view }) } };
  setupDashboardHotkeys(view);

  const calls = (action: string): number =>
    (view as unknown as Record<string, ReturnType<typeof vi.fn>>)[action].mock
      .calls.length;

  const press = (
    key: string,
    shift: boolean,
    repeat: boolean,
  ): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", {
      key,
      shiftKey: shift,
      repeat,
      bubbles: true,
      cancelable: true,
    });
    handler?.(event);
    return event;
  };
  return { calls, press };
}

describe("Dashboard hotkeys while a key is held", () => {
  beforeEach(() => {
    activeDocument.body.empty();
  });

  afterEach(() => {
    activeDocument.body.empty();
  });

  it.each(SINGLE_PRESS_KEYS)(
    "acts once per press of $label, not on auto-repeat",
    ({ key, shift, action }) => {
      const { calls, press } = setup();

      press(key, shift, false);
      expect(calls(action)).toBe(1);

      press(key, shift, true);
      press(key, shift, true);
      expect(calls(action)).toBe(1);

      press(key, shift, false);
      expect(calls(action)).toBe(2);
    },
  );

  it.each(SINGLE_PRESS_KEYS)(
    "still swallows the held $label so no other handler sees it",
    ({ key, shift }) => {
      const { press } = setup();

      const held = press(key, shift, true);

      expect(held.defaultPrevented).toBe(true);
    },
  );

  it.each(REPEATING_KEYS)(
    "keeps acting on every auto-repeat of $label",
    ({ key, shift, action }) => {
      const { calls, press } = setup();

      press(key, shift, false);
      press(key, shift, true);
      press(key, shift, true);

      expect(calls(action)).toBe(3);
    },
  );

  it("does not consume a held key the dashboard does not bind", () => {
    const { press } = setup();

    const held = press("q", false, true);

    expect(held.defaultPrevented).toBe(false);
  });
});
