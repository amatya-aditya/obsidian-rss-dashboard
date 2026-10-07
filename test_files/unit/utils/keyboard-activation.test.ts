import { afterEach, describe, expect, it, vi } from "vitest";
import { onActivate } from "../../../src/utils/keyboard-activation";

describe("onActivate", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  function press(el: HTMLElement, key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
    return event;
  }

  it("runs the handler when the control is clicked", () => {
    const el = document.body.appendChild(createDiv());
    const handler = vi.fn();
    onActivate(el, handler);

    el.click();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each(["Enter", " "])("runs the handler when %j is pressed", (key) => {
    const el = document.body.appendChild(createDiv());
    const handler = vi.fn();
    onActivate(el, handler);

    const event = press(el, key);

    expect(handler).toHaveBeenCalledTimes(1);
    // Space must not scroll the page behind the control
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores other keys so Tab and typing keep working", () => {
    const el = document.body.appendChild(createDiv());
    const handler = vi.fn();
    onActivate(el, handler);

    const event = press(el, "Tab");

    expect(handler).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
