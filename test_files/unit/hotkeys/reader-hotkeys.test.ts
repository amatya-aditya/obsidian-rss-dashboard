import { afterEach, describe, expect, it, vi } from "vitest";
import { Scope } from "obsidian";
import { setupReaderHotkeys } from "../../../src/hotkeys/reader-hotkeys";
import type { ReaderView } from "../../../src/views/reader-view";

type Modifier = NonNullable<Parameters<Scope["register"]>[0]>[number];
type KeymapEventListener = Parameters<Scope["register"]>[2];

const shortcuts = [
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
] satisfies [Modifier[], string, keyof ReaderView][];

type ReaderAction = (typeof shortcuts)[number][2];

function setup() {
  const scope = new Scope();
  const register = vi.spyOn(scope, "register");
  const actions = Object.fromEntries(
    shortcuts.map(([, , action]) => [action, vi.fn()]),
  ) as Record<ReaderAction, ReturnType<typeof vi.fn>>;
  actions.actionSaveCurrentArticle.mockResolvedValue(undefined);
  actions.actionMarkReadAndNext.mockResolvedValue(undefined);
  setupReaderHotkeys(scope, actions as unknown as ReaderView);
  return { actions, bindings: register.mock.calls };
}

function invokeShortcut(
  handler: KeymapEventListener,
  target: HTMLElement,
  modifiers: Modifier[] | null,
  key: string | null,
  repeat = false,
) {
  const event = new KeyboardEvent("keydown", {
    key: key ?? "",
    repeat,
    shiftKey: modifiers?.includes("Shift"),
    bubbles: true,
    cancelable: true,
  });
  // Dispatch only to give the callback a real DOM target. The Scope stub does
  // not implement Obsidian's keymap or native text insertion, so assert the
  // callback's return contract directly; live typing still needs a host check.
  target.dispatchEvent(event);
  const preventDefault = vi.spyOn(event, "preventDefault");
  const stopPropagation = vi.spyOn(event, "stopPropagation");
  const result: unknown = handler(event, {
    modifiers: modifiers?.join(",") ?? null,
    key,
    vkey: key ?? "",
  });
  return { result, event, preventDefault, stopPropagation };
}

afterEach(() => {
  document.body.empty();
  vi.restoreAllMocks();
});

describe("Reader hotkey callback contract", () => {
  const editableTargets = [
    ["text input", (parent) => parent.createEl("input")],
    ["search input", (parent) => parent.createEl("input", { type: "search" })],
    ["textarea", (parent) => parent.createEl("textarea")],
    ["select", (parent) => parent.createEl("select")],
    ...["true", "", "plaintext-only"].map(
      (value): [string, (parent: HTMLElement) => HTMLElement] => [
        `contenteditable=${JSON.stringify(value)}`,
        (parent) => parent.createDiv({ attr: { contenteditable: value } }),
      ],
    ),
    [
      "nested contenteditable child",
      (parent) =>
        parent
          .createDiv({ attr: { contenteditable: "true" } })
          .createDiv()
          .createSpan(),
    ],
  ] satisfies [string, (parent: HTMLElement) => HTMLElement][];

  it.each(editableTargets)(
    "returns undefined for every shortcut from a %s inside or outside the toolbar without canceling input or running actions",
    (_name, createTarget) => {
      const { actions, bindings } = setup();
      expect(bindings).toHaveLength(shortcuts.length);

      for (const cls of ["rss-reader-content", "rss-reader-actions"]) {
        const target = createTarget(document.body.createDiv({ cls }));
        for (const repeat of [false, true]) {
          for (const [modifiers, key, handler] of bindings) {
            const { result, event, preventDefault, stopPropagation } =
              invokeShortcut(handler, target, modifiers, key, repeat);
            expect(
              result,
              `Return value in ${cls} for ${modifiers?.join("+")}:${key}, repeat=${repeat}`,
            ).toBeUndefined();
            expect(event.defaultPrevented).toBe(false);
            expect(preventDefault).not.toHaveBeenCalled();
            expect(stopPropagation).not.toHaveBeenCalled();
          }
        }
      }
      for (const action of Object.values(actions)) {
        expect(action).not.toHaveBeenCalled();
      }
    },
  );

  it.each(shortcuts)(
    "still handles %j + %s through %s outside editable controls",
    (modifiers, key, actionName) => {
      const { actions, bindings } = setup();
      const binding = bindings.find(
        ([registeredModifiers, registeredKey]) =>
          registeredKey === key &&
          registeredModifiers?.join(",") === modifiers.join(","),
      );
      expect(binding).toBeDefined();
      if (!binding) throw new Error(`Missing Reader shortcut for ${key}`);
      const target = document.body.createDiv();
      const { result, event, preventDefault } = invokeShortcut(
        binding[2],
        target,
        modifiers,
        key,
      );
      expect(result).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      expect(preventDefault).toHaveBeenCalledOnce();
      for (const [name, action] of Object.entries(actions)) {
        expect(action).toHaveBeenCalledTimes(name === actionName ? 1 : 0);
      }
    },
  );

  it.each(shortcuts)(
    "preserves toolbar navigation and Reader actions for %j + %s",
    (modifiers, key, actionName) => {
      const { actions, bindings } = setup();
      const binding = bindings.find(
        ([registeredModifiers, registeredKey]) =>
          registeredKey === key &&
          registeredModifiers?.join(",") === modifiers.join(","),
      );
      if (!binding) throw new Error(`Missing Reader shortcut for ${key}`);
      const button = document.body
        .createDiv({ cls: "rss-reader-actions" })
        .createEl("button", { attr: { type: "button" } });
      const toolbarOwnsKey = [
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(key);
      const { result, event, preventDefault, stopPropagation } = invokeShortcut(
        binding[2],
        button,
        modifiers,
        key,
      );

      expect(result).toBe(toolbarOwnsKey ? undefined : true);
      expect(event.defaultPrevented).toBe(!toolbarOwnsKey);
      expect(preventDefault).toHaveBeenCalledTimes(toolbarOwnsKey ? 0 : 1);
      expect(stopPropagation).not.toHaveBeenCalled();
      for (const [name, action] of Object.entries(actions)) {
        expect(action).toHaveBeenCalledTimes(
          !toolbarOwnsKey && name === actionName ? 1 : 0,
        );
      }
    },
  );

  it("resumes shortcuts outside editing and leaves subsequent input alone", () => {
    const { actions, bindings } = setup();
    const binding = bindings.find(([, key]) => key === "f");
    if (!binding) throw new Error("Missing Reader star shortcut");
    const [modifiers, key, handler] = binding;
    const input = document.body.createEl("input");
    const nonEditable = document.body.createDiv({
      attr: { contenteditable: "false" },
    });

    expect(
      invokeShortcut(handler, input, modifiers, key).result,
    ).toBeUndefined();
    expect(invokeShortcut(handler, nonEditable, modifiers, key).result).toBe(
      true,
    );
    expect(
      invokeShortcut(handler, input, modifiers, key).result,
    ).toBeUndefined();
    expect(actions.actionToggleStarStatus).toHaveBeenCalledOnce();
  });
});
