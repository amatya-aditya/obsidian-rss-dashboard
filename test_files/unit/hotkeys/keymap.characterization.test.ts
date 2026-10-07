// Characterization tests for #882 (single keymap table). They pin what the
// dashboard keydown handler and the Reader Scope registrations do today, bugs
// included, so the extraction can be shown to change nothing. Do not edit
// them during the refactor.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Scope } from "obsidian";
import { setupDashboardHotkeys } from "../../../src/hotkeys/dashboard-hotkeys";
import { setupReaderHotkeys } from "../../../src/hotkeys/reader-hotkeys";
import type { RssDashboardView } from "../../../src/views/dashboard-view";
import type { ReaderView } from "../../../src/views/reader-view";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

type Call = [method: string, args: unknown[]];

interface DashboardOptions {
  sidebar?: boolean;
  repeat?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  alt?: boolean;
  target?: HTMLElement;
  returns?: Record<string, unknown>;
  activeIsView?: boolean;
}

function setupDashboard(options: DashboardOptions = {}) {
  installObsidianDomPolyfills();
  const log: Call[] = [];
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
    isSidebarFocused: () => options.sidebar ?? false,
  };
  const spies = new Map<string, (...args: unknown[]) => unknown>();
  const view = new Proxy(base, {
    get(target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop in target) return target[prop];
      if (!prop.startsWith("action")) return undefined;
      let spy = spies.get(prop);
      if (!spy) {
        spy = (...args: unknown[]) => {
          log.push([prop, args]);
          // The real actionNavigateCard reports whether it used the key.
          if (options.returns && prop in options.returns) {
            return options.returns[prop];
          }
          return prop === "actionNavigateCard" ? true : undefined;
        };
        spies.set(prop, spy);
      }
      return spy;
    },
  }) as unknown as RssDashboardView;
  base.app = {
    workspace: {
      getActiveViewOfType: () => (options.activeIsView === false ? null : view),
    },
  };
  setupDashboardHotkeys(view);

  const press = (key: string, o: DashboardOptions = {}): KeyboardEvent => {
    const merged = { ...options, ...o };
    const event = new KeyboardEvent("keydown", {
      key,
      shiftKey: merged.shift ?? false,
      repeat: merged.repeat ?? false,
      ctrlKey: merged.ctrl ?? false,
      metaKey: merged.meta ?? false,
      altKey: merged.alt ?? false,
      bubbles: true,
      cancelable: true,
    });
    if (merged.target) {
      Object.defineProperty(event, "target", { value: merged.target });
    }
    handler?.(event);
    return event;
  };
  return { log, press };
}

interface DashboardCase {
  label: string;
  key: string;
  shift: boolean;
  sidebar?: boolean;
  call: Call;
}

// Every dashboard binding, with the sidebar focus it needs where the key
// means something different there.
const DASHBOARD_CASES: DashboardCase[] = [
  { label: "r", key: "r", shift: false, call: ["actionRefreshFeeds", []] },
  {
    label: "j",
    key: "j",
    shift: false,
    call: ["actionNavigatePrevious", [{ open: true }]],
  },
  {
    label: "l",
    key: "l",
    shift: false,
    call: ["actionNavigateNext", [{ open: true }]],
  },
  { label: "Space", key: " ", shift: false, call: ["actionNavigateNext", []] },
  {
    label: "Shift+Space",
    key: " ",
    shift: true,
    call: ["actionNavigatePrevious", []],
  },
  { label: "k", key: "k", shift: false, call: ["actionCloseReader", []] },
  {
    label: "ArrowLeft (sidebar)",
    key: "ArrowLeft",
    shift: false,
    sidebar: true,
    call: ["actionSidebarJumpPreviousFolder", []],
  },
  {
    label: "ArrowRight (sidebar)",
    key: "ArrowRight",
    shift: false,
    sidebar: true,
    call: ["actionSidebarJumpNextFolder", []],
  },
  {
    label: "ArrowUp (sidebar)",
    key: "ArrowUp",
    shift: false,
    sidebar: true,
    call: ["actionSidebarMovePrevious", []],
  },
  {
    label: "ArrowDown (sidebar)",
    key: "ArrowDown",
    shift: false,
    sidebar: true,
    call: ["actionSidebarMoveNext", []],
  },
  {
    label: "ArrowLeft",
    key: "ArrowLeft",
    shift: false,
    sidebar: false,
    call: ["actionNavigateCard", ["left"]],
  },
  {
    label: "ArrowRight",
    key: "ArrowRight",
    shift: false,
    sidebar: false,
    call: ["actionNavigateCard", ["right"]],
  },
  {
    label: "ArrowUp",
    key: "ArrowUp",
    shift: false,
    sidebar: false,
    call: ["actionNavigateCard", ["up"]],
  },
  {
    label: "ArrowDown",
    key: "ArrowDown",
    shift: false,
    sidebar: false,
    call: ["actionNavigateCard", ["down"]],
  },
  {
    label: "o",
    key: "o",
    shift: false,
    call: ["actionToggleArticleOpen", []],
  },
  {
    label: "Enter",
    key: "Enter",
    shift: false,
    sidebar: false,
    call: ["actionToggleArticleOpen", []],
  },
  {
    label: "Enter (sidebar)",
    key: "Enter",
    shift: false,
    sidebar: true,
    call: ["actionSidebarOpenFocused", []],
  },
  {
    label: "m",
    key: "m",
    shift: false,
    call: ["actionToggleReadStatus", []],
  },
  {
    label: "f",
    key: "f",
    shift: false,
    call: ["actionToggleStarStatus", []],
  },
  { label: "t", key: "t", shift: false, call: ["actionToggleTagsMenu", []] },
  {
    label: "s",
    key: "s",
    shift: false,
    call: ["actionSaveSelectedArticle", []],
  },
  {
    label: "1",
    key: "1",
    shift: false,
    call: ["actionSetViewStyle", ["list"]],
  },
  {
    label: "2",
    key: "2",
    shift: false,
    call: ["actionSetViewStyle", ["card"]],
  },
  {
    label: "3",
    key: "3",
    shift: false,
    call: ["actionSetViewStyle", ["feed"]],
  },
  {
    label: ",",
    key: ",",
    shift: false,
    call: ["actionMarkReadAndNext", []],
  },
  {
    label: "Shift+S",
    key: "S",
    shift: true,
    call: ["actionFocusSidebar", []],
  },
  {
    label: "Shift+R",
    key: "R",
    shift: true,
    sidebar: false,
    call: ["actionFocusReader", []],
  },
  {
    label: "Shift+R (sidebar)",
    key: "R",
    shift: true,
    sidebar: true,
    call: ["actionSidebarRenameFocused", []],
  },
  {
    label: "Shift+J",
    key: "J",
    shift: true,
    call: ["actionSidebarMovePrevious", []],
  },
  {
    label: "Shift+L",
    key: "L",
    shift: true,
    call: ["actionSidebarMoveNext", []],
  },
  {
    label: "Shift+O",
    key: "O",
    shift: true,
    call: ["actionSidebarOpenFocused", []],
  },
  {
    label: "Shift+Enter",
    key: "Enter",
    shift: true,
    call: ["actionSidebarOpenFocused", []],
  },
  {
    label: "Shift+X",
    key: "X",
    shift: true,
    call: ["actionSidebarToggleFocusedFolder", []],
  },
  {
    label: "Shift+D",
    key: "D",
    shift: true,
    call: ["actionSidebarDeleteFocused", []],
  },
  {
    label: "Shift+A",
    key: "A",
    shift: true,
    call: ["actionMarkAllAsRead", []],
  },
  {
    label: "Shift+1",
    key: "!",
    shift: true,
    call: ["actionSetStatusFilter", ["all"]],
  },
  {
    label: "Shift+2",
    key: "@",
    shift: true,
    call: ["actionSetStatusFilter", ["unread"]],
  },
  {
    label: "Shift+3",
    key: "#",
    shift: true,
    call: ["actionSetStatusFilter", ["read"]],
  },
  {
    label: "Shift+?",
    key: "?",
    shift: true,
    call: ["actionOpenShortcutHelp", []],
  },
];

// Held keys that keep acting. Every other binding acts once per press.
const DASHBOARD_REPEATING = new Set([
  "j",
  "l",
  "Space",
  "Shift+Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft (sidebar)",
  "ArrowRight (sidebar)",
  "ArrowUp (sidebar)",
  "ArrowDown (sidebar)",
  "Shift+J",
  "Shift+L",
]);

describe("Dashboard keymap (characterization)", () => {
  beforeEach(() => {
    activeDocument.body.empty();
  });
  afterEach(() => {
    activeDocument.body.empty();
  });

  it.each(DASHBOARD_CASES)(
    "$label calls its view action and consumes the key",
    ({ key, shift, sidebar, call }) => {
      const { log, press } = setupDashboard({ sidebar });

      const event = press(key, { shift });

      expect(log).toEqual([call]);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it.each(DASHBOARD_CASES)(
    "$label under auto-repeat matches its once-per-press class",
    ({ label, key, shift, sidebar, call }) => {
      const { log, press } = setupDashboard({ sidebar });

      const event = press(key, { shift, repeat: true });

      expect(event.defaultPrevented).toBe(true);
      expect(log).toEqual(DASHBOARD_REPEATING.has(label) ? [call] : []);
    },
  );

  describe("unbound and unmatched keys", () => {
    it.each([
      ["q", false],
      ["Q", true],
      ["Escape", false],
      ["?", false],
      ["4", false],
      ["Tab", false],
    ])("ignores %s (shift %s)", (key, shift) => {
      const { log, press } = setupDashboard();

      const event = press(key, { shift });

      expect(log).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });

    // BUG: pinned, see #881. Letters match e.key literally, so Caps Lock
    // (an upper-case key with Shift off) and Caps Lock + Shift (a lower-case
    // key with Shift on) both miss.
    it.each([
      ["J", false],
      ["L", false],
      ["K", false],
      ["M", false],
      ["j", true],
      ["l", true],
    ])("ignores %s (shift %s) under Caps Lock", (key, shift) => {
      const { log, press } = setupDashboard();

      const event = press(key, { shift });

      expect(log).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });
  });

  describe("handled flag", () => {
    it.each([
      ["ArrowLeft", "left"],
      ["ArrowRight", "right"],
    ])(
      "%s is left alone when card navigation declines it",
      (key, direction) => {
        const { log, press } = setupDashboard({
          returns: { actionNavigateCard: false },
        });

        const event = press(key);

        expect(log).toEqual([["actionNavigateCard", [direction]]]);
        expect(event.defaultPrevented).toBe(false);
      },
    );

    it.each([
      ["ArrowLeft", true],
      ["ArrowRight", true],
    ])("%s is consumed when card navigation uses it", (key, used) => {
      const { press } = setupDashboard({
        returns: { actionNavigateCard: used },
      });

      expect(press(key).defaultPrevented).toBe(true);
    });

    it.each(["ArrowUp", "ArrowDown"])(
      "%s is consumed even when card navigation declines it",
      (key) => {
        const { press } = setupDashboard({
          returns: { actionNavigateCard: false },
        });

        expect(press(key).defaultPrevented).toBe(true);
      },
    );
  });

  describe("guards", () => {
    it.each([
      ["ctrl", { ctrl: true }],
      ["meta", { meta: true }],
      ["alt", { alt: true }],
    ])("ignores a bound key pressed with %s", (_name, modifier) => {
      const { log, press } = setupDashboard();

      const event = press("j", modifier);

      expect(log).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });

    it("ignores keys while another view is the active one", () => {
      const { log, press } = setupDashboard({ activeIsView: false });

      const event = press("j");

      expect(log).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });

    it("ignores keys pressed in an input", () => {
      const input = activeDocument.body.createEl("input");
      const { log, press } = setupDashboard();

      const event = press("j", { target: input });

      expect(log).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });

    it("ignores keys while a modal is open", () => {
      activeDocument.body.createDiv({ cls: "modal-container" });
      const { log, press } = setupDashboard();

      const event = press("j");

      expect(log).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    });

    it("still acts on a key pressed on a bare tabindex element", () => {
      const card = activeDocument.body.createDiv({ attr: { tabindex: "0" } });
      const { log, press } = setupDashboard();

      press("k", { target: card });

      expect(log).toEqual([["actionCloseReader", []]]);
    });
  });
});

type Modifier = NonNullable<Parameters<Scope["register"]>[0]>[number];
type ScopeListener = Parameters<Scope["register"]>[2];

// The Reader's Scope registrations, in the order setupReaderHotkeys makes them.
const READER_BINDINGS: Array<[Modifier[], string, keyof ReaderView]> = [
  [[], "ArrowUp", "actionScrollUp"],
  [[], "ArrowDown", "actionScrollDown"],
  [[], "ArrowLeft", "actionScrollLeft"],
  [[], "ArrowRight", "actionScrollRight"],
  [[], "PageUp", "actionPageUp"],
  [[], "PageDown", "actionPageDown"],
  [[], "Home", "actionScrollToStart"],
  [[], "End", "actionScrollToEnd"],
  [[], "=", "actionZoomIn"],
  [["Shift"], "=", "actionZoomIn"],
  [[], "-", "actionZoomOut"],
  [["Shift"], "-", "actionZoomOut"],
  [[], "0", "actionZoomReset"],
  [[], "k", "actionToggleArticleOpen"],
  [["Shift"], "d", "actionFocusDashboard"],
  [["Shift"], "s", "actionFocusSidebar"],
  [["Shift"], "r", "actionFocusReader"],
  [[], "j", "actionNavigatePrevious"],
  [[], "l", "actionNavigateNext"],
  [[], "m", "actionToggleReadStatus"],
  [["Shift"], "a", "actionMarkAllAsRead"],
  [[], "f", "actionToggleStarStatus"],
  [[], "t", "actionToggleTagsMenu"],
  [[], "s", "actionSaveCurrentArticle"],
  [[], ",", "actionMarkReadAndNext"],
  [["Shift"], "?", "actionOpenShortcutHelp"],
];

// Keys that act once per press in the Reader, with or without Shift.
const READER_NO_REPEAT = new Set([
  "k",
  "d",
  "s",
  "r",
  "m",
  "a",
  "f",
  "t",
  ",",
  "?",
  "0",
]);

function setupReader() {
  const scope = new Scope();
  const register = vi.spyOn(scope, "register");
  const log: string[] = [];
  const view = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      return () => {
        log.push(prop);
      };
    },
  }) as unknown as ReaderView;
  setupReaderHotkeys(scope, view);
  return { log, bindings: register.mock.calls };
}

function fire(
  listener: ScopeListener,
  modifiers: Modifier[],
  key: string,
  options: { repeat?: boolean; target?: HTMLElement } = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    repeat: options.repeat ?? false,
    shiftKey: modifiers.includes("Shift"),
    bubbles: true,
    cancelable: true,
  });
  (options.target ?? activeDocument.body).dispatchEvent(event);
  const result: unknown = listener(event, {
    modifiers: modifiers.join(","),
    key,
    vkey: key,
  });
  return { result, event };
}

describe("Reader keymap (characterization)", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    activeDocument.body.empty();
  });
  afterEach(() => {
    activeDocument.body.empty();
    vi.restoreAllMocks();
  });

  it("registers exactly these keys, in this order", () => {
    const { bindings } = setupReader();

    expect(bindings.map(([modifiers, key]) => [modifiers, key])).toEqual(
      READER_BINDINGS.map(([modifiers, key]) => [modifiers, key]),
    );
  });

  it.each(READER_BINDINGS)(
    "%j %s calls %s and reports the key handled",
    (modifiers, key, action) => {
      const { log, bindings } = setupReader();
      const index = READER_BINDINGS.findIndex(
        ([m, k]) => k === key && m.length === modifiers.length,
      );
      const binding = bindings[index];
      if (!binding) throw new Error(`no registration for ${key}`);

      const { result, event } = fire(binding[2], modifiers, key);

      expect(log).toEqual([action]);
      expect(result).toBe(true);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it.each(READER_BINDINGS)(
    "%j %s under auto-repeat matches its once-per-press class",
    (modifiers, key, action) => {
      const { log, bindings } = setupReader();
      const index = READER_BINDINGS.findIndex(
        ([m, k]) => k === key && m.length === modifiers.length,
      );
      const binding = bindings[index];
      if (!binding) throw new Error(`no registration for ${key}`);

      const { result, event } = fire(binding[2], modifiers, key, {
        repeat: true,
      });

      expect(result).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(log).toEqual(READER_NO_REPEAT.has(key) ? [] : [action]);
    },
  );

  it("stands aside for an editable target", () => {
    const { log, bindings } = setupReader();
    const input = activeDocument.body.createEl("input");
    const binding = bindings[READER_BINDINGS.findIndex(([, k]) => k === "j")];

    const { result, event } = fire(binding[2], [], "j", { target: input });

    expect(result).toBeUndefined();
    expect(event.defaultPrevented).toBe(false);
    expect(log).toEqual([]);
  });

  it.each(["ArrowLeft", "ArrowRight"])(
    "stands aside for %s on a Reader toolbar button",
    (key) => {
      const { log, bindings } = setupReader();
      const toolbar = activeDocument.body.createDiv({
        cls: "rss-reader-actions",
      });
      const button = toolbar.createEl("button");
      const binding = bindings[READER_BINDINGS.findIndex(([, k]) => k === key)];

      const { result } = fire(binding[2], [], key, { target: button });

      expect(result).toBeUndefined();
      expect(log).toEqual([]);
    },
  );

  it("still scrolls on ArrowUp from a Reader toolbar button", () => {
    const { log, bindings } = setupReader();
    const toolbar = activeDocument.body.createDiv({
      cls: "rss-reader-actions",
    });
    const button = toolbar.createEl("button");

    fire(bindings[0][2], [], "ArrowUp", { target: button });

    expect(log).toEqual(["actionScrollUp"]);
  });
});
