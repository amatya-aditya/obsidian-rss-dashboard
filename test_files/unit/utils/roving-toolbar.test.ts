import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIconButton } from "../../../src/utils/icon-button";
import { attachRovingToolbar } from "../../../src/utils/roving-toolbar";
import { setCssProps } from "../../../src/utils/platform-utils";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const ACTIONS = ["save", "read", "star", "tags", "format", "open"] as const;

/** Lets the toolbar's MutationObserver run after a DOM change. */
async function flush(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function buildButtons(
  toolbar: HTMLElement,
  onClick: (action: string) => void = () => {},
): HTMLButtonElement[] {
  return ACTIONS.map((action) =>
    createIconButton({
      parent: toolbar,
      label: `Action ${action}`,
      icon: "circle",
      action,
      region: "test-toolbar",
      onClick: () => onClick(action),
    }),
  );
}

function press(
  target: HTMLElement,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function tabStops(toolbar: HTMLElement): HTMLElement[] {
  return [...toolbar.querySelectorAll<HTMLElement>("button")].filter(
    (button) => button.tabIndex === 0,
  );
}

describe("attachRovingToolbar", () => {
  let toolbar: HTMLElement;

  beforeEach(() => {
    toolbar = createDiv({ attr: { role: "toolbar" } });
    activeDocument.body.appendChild(toolbar);
  });

  afterEach(() => {
    activeDocument.body.empty();
    vi.clearAllMocks();
  });

  it("makes the toolbar a single Tab stop on its first item", () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);

    expect(tabStops(toolbar)).toEqual([buttons[0]]);
    for (const button of buttons.slice(1)) {
      expect(button.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("moves focus and the Tab stop with ArrowRight and ArrowLeft, wrapping at the ends", () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    buttons[0].focus();

    const right = press(buttons[0], "ArrowRight");
    expect(right.defaultPrevented).toBe(true);
    expect(activeDocument.activeElement).toBe(buttons[1]);
    expect(tabStops(toolbar)).toEqual([buttons[1]]);

    press(buttons[1], "ArrowLeft");
    expect(activeDocument.activeElement).toBe(buttons[0]);

    press(buttons[0], "ArrowLeft");
    expect(activeDocument.activeElement).toBe(buttons[5]);
    expect(tabStops(toolbar)).toEqual([buttons[5]]);

    press(buttons[5], "ArrowRight");
    expect(activeDocument.activeElement).toBe(buttons[0]);
  });

  it("jumps to the first and last item with Home and End", () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    buttons[2].focus();

    expect(press(buttons[2], "End").defaultPrevented).toBe(true);
    expect(activeDocument.activeElement).toBe(buttons[5]);
    expect(tabStops(toolbar)).toEqual([buttons[5]]);

    expect(press(buttons[5], "Home").defaultPrevented).toBe(true);
    expect(activeDocument.activeElement).toBe(buttons[0]);
    expect(tabStops(toolbar)).toEqual([buttons[0]]);
  });

  it("leaves Tab to the browser so focus can leave the toolbar", () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    buttons[1].focus();

    const tab = press(buttons[1], "Tab");
    const shiftTab = press(buttons[1], "Tab", { shiftKey: true });

    expect(tab.defaultPrevented).toBe(false);
    expect(shiftTab.defaultPrevented).toBe(false);
    expect(activeDocument.activeElement).toBe(buttons[1]);
  });

  it("ignores arrow keys that carry a modifier or come from outside an item", () => {
    const buttons = buildButtons(toolbar);
    const field = toolbar.createEl("input", { attr: { type: "text" } });
    attachRovingToolbar(toolbar);
    buttons[0].focus();

    expect(
      press(buttons[0], "ArrowRight", { ctrlKey: true }).defaultPrevented,
    ).toBe(false);
    expect(
      press(buttons[0], "ArrowRight", { altKey: true }).defaultPrevented,
    ).toBe(false);
    expect(
      press(buttons[0], "ArrowRight", { metaKey: true }).defaultPrevented,
    ).toBe(false);
    field.focus();
    expect(press(field, "ArrowRight").defaultPrevented).toBe(false);
    expect(activeDocument.activeElement).toBe(field);
  });

  it("does not turn Enter or Space into anything but a native click", () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);

    expect(press(buttons[0], "Enter").defaultPrevented).toBe(false);
    expect(press(buttons[0], " ").defaultPrevented).toBe(false);
  });

  it("makes the item the Tab stop when focus reaches it by pointer", () => {
    const clicked: string[] = [];
    const buttons = buildButtons(toolbar, (action) => clicked.push(action));
    attachRovingToolbar(toolbar);

    // A pointer press focuses the button, then the click activates it.
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      pointerType: "touch",
    });
    buttons[3].dispatchEvent(pointerDown);
    buttons[3].dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
    buttons[3].focus();
    buttons[3].dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }),
    );
    buttons[3].click();

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(clicked).toEqual(["tags"]);
    expect(tabStops(toolbar)).toEqual([buttons[3]]);
  });

  it("activates an item that is not the Tab stop on a plain click", () => {
    const clicked: string[] = [];
    const buttons = buildButtons(toolbar, (action) => clicked.push(action));
    attachRovingToolbar(toolbar);

    buttons[5].click();
    buttons[1].click();

    expect(clicked).toEqual(["open", "read"]);
  });

  it("skips disabled and hidden items when moving", () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    buttons[1].disabled = true;
    buttons[2].hidden = true;
    buttons[0].focus();

    press(buttons[0], "ArrowRight");
    expect(activeDocument.activeElement).toBe(buttons[3]);

    press(buttons[3], "Home");
    expect(activeDocument.activeElement).toBe(buttons[0]);
  });

  it("keeps a valid Tab stop when the active item is removed while unfocused", async () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    expect(tabStops(toolbar)).toEqual([buttons[0]]);

    buttons[0].remove();
    await flush();

    expect(tabStops(toolbar)).toEqual([buttons[1]]);
  });

  it("moves focus to a neighbouring item when the focused active item is removed", async () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    buttons[2].focus();
    expect(tabStops(toolbar)).toEqual([buttons[2]]);

    buttons[2].remove();
    await flush();

    const stops = tabStops(toolbar);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(buttons[3]);
    expect(activeDocument.activeElement).toBe(buttons[3]);
  });

  it("falls back to the previous item when the focused last item is removed", async () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    buttons[5].focus();

    buttons[5].remove();
    await flush();

    expect(tabStops(toolbar)).toEqual([buttons[4]]);
    expect(activeDocument.activeElement).toBe(buttons[4]);
  });

  it("moves focus off a disabled active item onto a valid one", async () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    buttons[0].focus();

    buttons[0].disabled = true;
    await flush();

    expect(tabStops(toolbar)).toEqual([buttons[1]]);
    expect(activeDocument.activeElement).toBe(buttons[1]);
  });

  it("restores the Tab stop and focus on the same action after the toolbar is re-rendered", async () => {
    buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    const star = toolbar.querySelector<HTMLElement>('[data-rss-action="star"]');
    star!.focus();
    press(star!, "ArrowRight");
    press(activeDocument.activeElement as HTMLElement, "ArrowLeft");
    expect(activeDocument.activeElement).toBe(star);

    toolbar.empty();
    const rebuilt = buildButtons(toolbar);
    await flush();

    expect(tabStops(toolbar)).toEqual([rebuilt[2]]);
    expect(activeDocument.activeElement).toBe(rebuilt[2]);
  });

  it("does not steal focus after a re-render when focus was elsewhere", async () => {
    buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    const outside = activeDocument.body.createEl("button", { text: "Outside" });
    outside.focus();

    toolbar.empty();
    const rebuilt = buildButtons(toolbar);
    await flush();

    expect(activeDocument.activeElement).toBe(outside);
    expect(tabStops(toolbar)).toEqual([rebuilt[0]]);
  });

  it("gives a newly added item tabindex -1 and the first item to an empty toolbar", async () => {
    attachRovingToolbar(toolbar);
    const first = createIconButton({
      parent: toolbar,
      label: "First",
      icon: "circle",
    });
    await flush();
    expect(tabStops(toolbar)).toEqual([first]);

    const second = createIconButton({
      parent: toolbar,
      label: "Second",
      icon: "circle",
    });
    await flush();
    expect(first.getAttribute("tabindex")).toBe("0");
    expect(second.getAttribute("tabindex")).toBe("-1");
  });

  it("survives every item being removed", async () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    buttons[0].focus();

    toolbar.empty();
    await flush();

    expect(tabStops(toolbar)).toEqual([]);
  });

  it("handles keys once when attached twice to the same toolbar", () => {
    const buttons = buildButtons(toolbar);
    attachRovingToolbar(toolbar);
    attachRovingToolbar(toolbar);
    buttons[0].focus();

    press(buttons[0], "ArrowRight");

    expect(activeDocument.activeElement).toBe(buttons[1]);
  });

  it("stops handling keys after destroy", () => {
    const buttons = buildButtons(toolbar);
    const roving = attachRovingToolbar(toolbar);
    buttons[0].focus();
    roving.destroy();

    const event = press(buttons[0], "ArrowRight");

    expect(event.defaultPrevented).toBe(false);
    expect(activeDocument.activeElement).toBe(buttons[0]);
  });

  it("flips the arrow direction in a right-to-left toolbar", () => {
    const buttons = buildButtons(toolbar);
    setCssProps(toolbar, { direction: "rtl" });
    attachRovingToolbar(toolbar);
    buttons[0].focus();

    press(buttons[0], "ArrowLeft");

    expect(activeDocument.activeElement).toBe(buttons[1]);
  });
});
