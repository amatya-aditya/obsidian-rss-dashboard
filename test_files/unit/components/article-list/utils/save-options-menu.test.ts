import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Menu } from "obsidian";
import {
  installObsidianDomPolyfills,
  installWindowNodePolyfills,
} from "../../../test-dom-polyfills";
import { showSaveOptionsMenu } from "../../../../../src/components/article-list/utils/save-options-menu";

describe("showSaveOptionsMenu", () => {
  const handlers = { onDefaultSave: vi.fn(), onCustomSave: vi.fn() };
  let anchor: HTMLElement;

  beforeEach(() => {
    installObsidianDomPolyfills();
    anchor = document.body.createDiv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it("opens at the mouse position for a click in the main window", () => {
    const atMouse = vi.spyOn(Menu.prototype, "showAtMouseEvent");
    const atPosition = vi.spyOn(Menu.prototype, "showAtPosition");

    showSaveOptionsMenu(new MouseEvent("click"), anchor, handlers);

    expect(atMouse).toHaveBeenCalledOnce();
    expect(atPosition).not.toHaveBeenCalled();
  });

  it("opens at the mouse position for a click in a popout window", () => {
    const frame = document.body.createEl("iframe");
    const popout = frame.contentWindow as Window & typeof window;
    installWindowNodePolyfills(popout);
    const click = new popout.MouseEvent("click", { view: popout });
    expect(click instanceof MouseEvent).toBe(false);
    const atMouse = vi.spyOn(Menu.prototype, "showAtMouseEvent");
    const atPosition = vi.spyOn(Menu.prototype, "showAtPosition");

    showSaveOptionsMenu(click, anchor, handlers);

    expect(atMouse).toHaveBeenCalledOnce();
    expect(atPosition).not.toHaveBeenCalled();
  });

  it("opens below the button, in the button's own window, for a key press", () => {
    const atMouse = vi.spyOn(Menu.prototype, "showAtMouseEvent");
    const atPosition = vi.spyOn(Menu.prototype, "showAtPosition");

    showSaveOptionsMenu(new KeyboardEvent("keydown"), anchor, handlers);

    expect(atMouse).not.toHaveBeenCalled();
    expect(atPosition).toHaveBeenCalledWith(
      expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      anchor.ownerDocument,
    );
  });
});
