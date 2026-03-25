import { describe, it, expect } from "vitest";
import {
  computePopoverPosition,
  computeSubmenuPosition,
} from "../../../src/utils/popover-position";

const margin = 8;

describe("computePopoverPosition()", () => {
  it("flips up near bottom", () => {
    const anchorRect = {
      top: 700,
      bottom: 730,
      left: 20,
      right: 120,
      width: 100,
      height: 30,
    };
    const popoverRect = { width: 190, height: 200 };
    const viewport = { width: 400, height: 740 };

    const result = computePopoverPosition({
      anchorRect,
      popoverRect,
      viewport,
      margin,
    });

    expect(result.placement).toBe("top");
    expect(result.top).toBeLessThan(anchorRect.top);
  });

  it("clamps within viewport", () => {
    const anchorRect = {
      top: 10,
      bottom: 40,
      left: 390,
      right: 410,
      width: 20,
      height: 30,
    };
    const popoverRect = { width: 190, height: 200 };
    const viewport = { width: 400, height: 300 };

    const result = computePopoverPosition({
      anchorRect,
      popoverRect,
      viewport,
      margin,
    });

    expect(result.left + popoverRect.width).toBeLessThanOrEqual(
      viewport.width - margin,
    );
    expect(result.top).toBeGreaterThanOrEqual(margin);
    expect(result.top + popoverRect.height).toBeLessThanOrEqual(
      viewport.height - margin,
    );
  });

  it("returns maxHeight when it cannot fit above or below", () => {
    const anchorRect = {
      top: 120,
      bottom: 150,
      left: 20,
      right: 120,
      width: 100,
      height: 30,
    };
    const popoverRect = { width: 190, height: 400 };
    const viewport = { width: 400, height: 260 };

    const result = computePopoverPosition({
      anchorRect,
      popoverRect,
      viewport,
      margin,
    });

    // Above space: 120 - 8 = 112
    // Below space: 260 - 150 - 8 = 102
    expect(result.maxHeight).toBe(112);
  });
});

describe("computeSubmenuPosition()", () => {
  it("flips left when it would overflow right", () => {
    const parentItemRect = {
      top: 200,
      left: 250,
      bottom: 230,
      right: 380,
      width: 130,
      height: 30,
    };
    const parentMenuRect = {
      top: 150,
      left: 200,
      bottom: 450,
      right: 380,
      width: 180,
      height: 300,
    };
    const submenuRect = { width: 150, height: 200 };
    const viewport = { width: 400, height: 600 };

    const result = computeSubmenuPosition({
      parentItemRect,
      parentMenuRect,
      submenuRect,
      viewport,
      margin,
    });

    expect(result.side).toBe("left");
    expect(result.left).toBeLessThan(parentMenuRect.left);
  });

  it("clamps top and returns maxHeight when submenu is too tall", () => {
    const parentItemRect = {
      top: 10,
      left: 50,
      bottom: 40,
      right: 200,
      width: 150,
      height: 30,
    };
    const parentMenuRect = {
      top: 0,
      left: 10,
      bottom: 100,
      right: 200,
      width: 190,
      height: 100,
    };
    const submenuRect = { width: 150, height: 500 };
    const viewport = { width: 400, height: 260 };

    const result = computeSubmenuPosition({
      parentItemRect,
      parentMenuRect,
      submenuRect,
      viewport,
      margin,
    });

    expect(result.top).toBe(margin);
    expect(result.maxHeight).toBe(viewport.height - margin * 2);
  });
});

