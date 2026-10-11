import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { isDomNode } from "../../../src/utils/dom-node";
import { installWindowNodePolyfills } from "../test-dom-polyfills";

// A popout is a separate window with its own document and DOM classes, like
// the Electron window Obsidian opens for "Move to new window".
function openPopoutWindow(): Window {
  const popout = new JSDOM("<!doctype html><html><body></body></html>")
    .window as unknown as Window;
  installWindowNodePolyfills(popout);
  return popout;
}

describe("isDomNode", () => {
  it("rejects null and values with no cross-window instanceOf helper", () => {
    expect(isDomNode(null)).toBe(false);
    expect(isDomNode("text")).toBe(false);
    expect(isDomNode({})).toBe(false);
  });

  it("accepts a node so the caller can use .instanceOf(...)", () => {
    const el = document.body.createDiv();
    expect(isDomNode(el)).toBe(true);
    expect(isDomNode(el) && el.instanceOf(HTMLElement)).toBe(true);
  });

  // Native `instanceof HTMLElement` is false for an element a popout window
  // created; the guard must still report it as a DOM node, and Obsidian's
  // cross-window instanceOf must still match the element's own window class.
  it("accepts an element a popout window created", () => {
    const popout = openPopoutWindow() as unknown as {
      createDiv(): HTMLElement;
    };
    const el = popout.createDiv();
    expect(isDomNode(el)).toBe(true);
    expect(el.instanceOf(HTMLElement)).toBe(true);
  });
});
