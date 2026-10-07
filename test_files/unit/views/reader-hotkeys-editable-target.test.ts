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

function dispatchShortcutFrom(
  scope: Scope,
  key: string,
  target: HTMLElement,
): boolean | void {
  let event: KeyboardEvent | null = null;
  target.addEventListener("keydown", (dispatchedEvent) => {
    event = dispatchedEvent;
  });
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  if (!event) throw new Error("Keyboard event was not dispatched");

  const handlers = (
    scope as unknown as {
      handlers: {
        key: string;
        modifiers?: string[] | null;
        func: (keyboardEvent: KeyboardEvent) => boolean | void;
      }[];
    }
  ).handlers;
  const handler = handlers.find(
    (candidate) =>
      candidate.key === key && (candidate.modifiers?.length ?? 0) === 0,
  );
  if (!handler) throw new Error(`No Reader shortcut registered for ${key}`);
  return handler.func(event);
}

describe("Reader shortcuts while editing modal fields", () => {
  it.each(["t", "s"])(
    "does not handle %s when an editable modal field has focus",
    (key) => {
      const scope = new Scope();
      const toggleTagsMenu = vi.fn();
      const saveCurrentArticle = vi.fn();
      const reader = {
        actionToggleTagsMenu: toggleTagsMenu,
        actionSaveCurrentArticle: saveCurrentArticle,
      } as unknown as ReaderView;
      setupReaderHotkeys(scope, reader);

      const modal = activeDocument.body.createDiv({
        cls: "modal rss-dashboard-custom-save-modal",
      });
      const input = modal.createEl("input", { attr: { type: "text" } });
      const handled = dispatchShortcutFrom(scope, key, input);

      expect(handled).toBeUndefined();
      expect(toggleTagsMenu).not.toHaveBeenCalled();
      expect(saveCurrentArticle).not.toHaveBeenCalled();
      modal.remove();
    },
  );
});
