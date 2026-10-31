import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "obsidian";
import { setCssProps } from "../../../src/utils/platform-utils";
import {
  areSwipePanelsEnabled,
  recognizeSwipe,
  shouldIgnoreSwipeStart,
  SwipeNavigator,
  type SwipePoint,
} from "../../../src/utils/swipe-gesture";
import { swipeOn } from "../test-swipe-helpers";

const at = (x: number, y: number, t: number): SwipePoint => ({ x, y, t });

describe("recognizeSwipe()", () => {
  it.each([
    ["slow long move right", at(0, 0, 0), at(80, 0, 800), "right"],
    ["slow long move left", at(200, 0, 0), at(120, 0, 800), "left"],
    ["fast short flick right", at(0, 0, 0), at(40, 0, 50), "right"],
    ["fast short flick left", at(100, 0, 0), at(60, 0, 50), "left"],
    ["just inside 30 degrees", at(0, 0, 0), at(100, 55, 600), "right"],
    ["short slow move", at(0, 0, 0), at(40, 0, 800), null],
    ["too short even when fast", at(0, 0, 0), at(15, 0, 10), null],
    ["diagonal beyond 30 degrees", at(0, 0, 0), at(100, 65, 600), null],
    ["vertical scroll", at(0, 0, 0), at(5, 200, 300), null],
    ["tap with no movement", at(10, 10, 0), at(10, 10, 100), null],
    ["zero elapsed time short move", at(0, 0, 0), at(40, 0, 0), null],
  ] as const)("%s", (_name, start, end, expected) => {
    expect(recognizeSwipe(start, end)).toBe(expected);
  });
});

describe("shouldIgnoreSwipeStart()", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  function scrollable(el: HTMLElement, overflowX: string): void {
    setCssProps(el, { "overflow-x": overflowX });
    Object.defineProperty(el, "scrollWidth", {
      value: 500,
      configurable: true,
    });
    Object.defineProperty(el, "clientWidth", {
      value: 100,
      configurable: true,
    });
  }

  it("allows a plain element", () => {
    const root = document.body.createDiv();
    const child = root.createDiv();
    expect(shouldIgnoreSwipeStart(child, root)).toBe(false);
  });

  it("ignores a start inside a horizontally scrollable element", () => {
    const root = document.body.createDiv();
    const table = root.createDiv();
    scrollable(table, "auto");
    const cell = table.createSpan();
    expect(shouldIgnoreSwipeStart(cell, root)).toBe(true);
  });

  it("allows an overflow:auto element whose content fits", () => {
    const root = document.body.createDiv();
    const box = root.createDiv();
    setCssProps(box, { "overflow-x": "auto" });
    expect(shouldIgnoreSwipeStart(box, root)).toBe(false);
  });

  it("allows wide content that cannot be scrolled (overflow hidden)", () => {
    const root = document.body.createDiv();
    const box = root.createDiv();
    scrollable(box, "hidden");
    expect(shouldIgnoreSwipeStart(box, root)).toBe(false);
  });

  it("does not look above the boundary", () => {
    const outer = document.body.createDiv();
    scrollable(outer, "auto");
    const root = outer.createDiv();
    const child = root.createDiv();
    expect(shouldIgnoreSwipeStart(child, root)).toBe(false);
  });

  it.each(["input", "textarea", "select"] as const)(
    "ignores a start on a %s",
    (tag) => {
      const root = document.body.createDiv();
      const el = root.createEl(tag);
      expect(shouldIgnoreSwipeStart(el, root)).toBe(true);
    },
  );

  it("ignores a start on a range slider", () => {
    const root = document.body.createDiv();
    const el = root.createEl("input", { attr: { type: "range" } });
    expect(shouldIgnoreSwipeStart(el, root)).toBe(true);
  });
  it.each([
    "podcast-seekbar-row",
    "rss-dashboard-header-icon-row",
    "rss-reader-lightbox-backdrop",
  ])("ignores a start inside .%s", (cls) => {
    const root = document.body.createDiv();
    const area = root.createDiv({ cls });
    expect(shouldIgnoreSwipeStart(area.createSpan(), root)).toBe(true);
  });

  it("ignores a null target", () => {
    expect(shouldIgnoreSwipeStart(null)).toBe(false);
  });
});

describe("areSwipePanelsEnabled()", () => {
  afterEach(() => {
    Platform.isMobile = false;
    vi.restoreAllMocks();
  });

  const on = { display: { swipeBetweenPanels: true } };
  const off = { display: { swipeBetweenPanels: false } };

  it("is true only when setting, mobile platform and phone/tablet viewport agree", () => {
    Platform.isMobile = true;
    vi.spyOn(activeWindow, "innerWidth", "get").mockReturnValue(600);
    expect(areSwipePanelsEnabled(on)).toBe(true);
    expect(areSwipePanelsEnabled(off)).toBe(false);
  });

  it("is false on desktop platforms", () => {
    Platform.isMobile = false;
    vi.spyOn(activeWindow, "innerWidth", "get").mockReturnValue(600);
    expect(areSwipePanelsEnabled(on)).toBe(false);
  });

  it("is false on a wide viewport", () => {
    Platform.isMobile = true;
    vi.spyOn(activeWindow, "innerWidth", "get").mockReturnValue(1600);
    expect(areSwipePanelsEnabled(on)).toBe(false);
  });
});

describe("SwipeNavigator", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("marks its element for Obsidian only while enabled", () => {
    const el = document.body.createDiv();
    let enabled = true;
    const nav = new SwipeNavigator(el, {
      isEnabled: () => enabled,
      onSwipe: vi.fn(),
    });

    expect(el.dataset.ignoreSwipe).toBeUndefined();
    nav.sync();
    expect(el.dataset.ignoreSwipe).toBe("true");

    enabled = false;
    nav.sync();
    expect(el.dataset.ignoreSwipe).toBeUndefined();

    enabled = true;
    nav.sync();
    nav.destroy();
    expect(el.dataset.ignoreSwipe).toBeUndefined();
  });

  it("reports a swipe without stopping the event, so Obsidian can clean up its own touch state", () => {
    const el = document.body.createDiv();
    const onSwipe = vi.fn();
    new SwipeNavigator(el, { isEnabled: () => true, onSwipe }).sync();
    const above = vi.fn();
    document.body.addEventListener("touchend", above);

    swipeOn(el, 120);

    expect(onSwipe).toHaveBeenCalledWith("right");
    expect(above).toHaveBeenCalledTimes(1);
  });
});
