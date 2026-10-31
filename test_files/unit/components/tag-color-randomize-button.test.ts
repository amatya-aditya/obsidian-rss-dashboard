import { beforeEach, describe, expect, it, vi } from "vitest";
import { addRandomizeColorButton } from "../../../src/components/tag-color-randomize-button";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { lucideIconId } from "../test-icon-helpers";

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

function setup() {
  const host = document.body.createDiv();
  const input = host.createEl("input", {
    attr: { type: "color", value: "#8a5cf5" },
  });
  const button = addRandomizeColorButton({ input });
  return { host, input, button };
}

describe("addRandomizeColorButton", () => {
  it("is a native dice button named Randomize, placed right after the picker", () => {
    const { input, button } = setup();

    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Randomize");
    expect(lucideIconId(button)).toBe("dices");
    expect(button.hasAttribute("role")).toBe(false);
    expect(input.nextElementSibling).toBe(button);
  });

  it("appends to a given parent instead when one is passed", () => {
    const host = document.body.createDiv();
    const input = host.createEl("input", { attr: { type: "color" } });
    const parent = document.body.createDiv();

    const button = addRandomizeColorButton({ input, parent });

    expect(button.parentElement).toBe(parent);
    expect(input.nextElementSibling).toBeNull();
  });

  it("sets the picker to the rolled color, as an input then a change", () => {
    const { input, button } = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));

    button.click();

    expect(input.value).toBe("#808080");
    expect(events).toEqual(["input", "change"]);
  });

  it("takes whatever the roll gives, with no readability check", () => {
    const { input, button } = setup();
    const random = vi.spyOn(Math, "random");

    random.mockReturnValue(0.999999);
    button.click();
    expect(input.value).toBe("#ffffff");

    random.mockReturnValue(0);
    button.click();
    expect(input.value).toBe("#000000");
  });

  it("does not submit a surrounding form", () => {
    const { button } = setup();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    button.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
