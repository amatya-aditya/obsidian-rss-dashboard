import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SIDEBAR_ICONS,
  SIDEBAR_ICON_IDS,
  createToolbarButton,
  getIconById,
} from "../../../src/utils/sidebar-icon-registry";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
});

describe("sidebar-icon-registry.getIconById", () => {
  it("returns icon config for known ids", () => {
    for (const icon of SIDEBAR_ICONS) {
      expect(getIconById(icon.id)).toEqual(icon);
    }
  });

  it("returns undefined for unknown ids", () => {
    expect(getIconById("nope")).toBeUndefined();
  });
});

describe("sidebar-icon-registry constants", () => {
  it("SIDEBAR_ICON_IDS matches SIDEBAR_ICONS ids", () => {
    expect(SIDEBAR_ICON_IDS).toEqual(SIDEBAR_ICONS.map((i) => i.id));
  });
});

describe("sidebar-icon-registry.createToolbarButton", () => {
  it("creates a clickable-icon button and wires click/keyboard handlers", () => {
    const icon = SIDEBAR_ICONS[0];
    const onClick = vi.fn();

    const btn = createToolbarButton(icon, onClick);
    expect(btn.className).toBe("clickable-icon");
    expect(btn.getAttribute("role")).toBe("button");
    expect(btn.getAttribute("tabindex")).toBe("0");
    expect(btn.getAttribute("aria-label")).toBe(icon.label);
    expect(btn.dataset.icon).toBe(icon.lucideIcon);

    btn.dispatchEvent(new MouseEvent("click"));
    expect(onClick).toHaveBeenCalledTimes(1);

    const otherKey = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    btn.dispatchEvent(otherKey);
    expect(otherKey.defaultPrevented).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);

    const enterKey = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    btn.dispatchEvent(enterKey);
    expect(enterKey.defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(2);

    const spaceKey = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    btn.dispatchEvent(spaceKey);
    expect(spaceKey.defaultPrevented).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(3);
  });
});

