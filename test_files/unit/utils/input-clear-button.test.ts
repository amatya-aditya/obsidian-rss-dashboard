import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Setting } from "obsidian";
import { addInputClearButton } from "../../../src/utils/input-clear-button";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

describe("addInputClearButton", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = createDiv();
    activeDocument.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  function clearButtonOf(input: HTMLInputElement): HTMLButtonElement {
    const button = input.parentElement?.querySelector<HTMLButtonElement>(
      "button.search-input-clear-button",
    );
    if (!button) throw new Error("no clear button");
    return button;
  }

  it("wraps the input in place and puts Obsidian's clear button after it", () => {
    const before = host.createSpan();
    const input = host.createEl("input", { type: "text" });
    const after = host.createSpan();

    addInputClearButton(input);

    const wrapper = input.parentElement;
    expect(wrapper?.className).toBe("rss-input-clear-wrap rss-input-clear");
    expect(wrapper?.previousElementSibling).toBe(before);
    expect(wrapper?.nextElementSibling).toBe(after);
    const button = clearButtonOf(input);
    expect(button.previousElementSibling).toBe(input);
    expect(button.className).toBe(
      "search-input-clear-button rss-input-clear-button",
    );
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Clear");
    // Obsidian's app.css draws the icon; the button holds no svg of its own.
    expect(button.querySelector("svg")).toBeNull();
    expect(button.hasAttribute("role")).toBe(false);
    expect(button.hasAttribute("tabindex")).toBe(false);
  });

  it("uses a given container instead of wrapping the input", () => {
    const container = host.createDiv();
    const input = container.createEl("input", { type: "text" });

    addInputClearButton(input, { container, label: "Clear search" });

    expect(input.parentElement).toBe(container);
    expect(container.classList.contains("rss-input-clear")).toBe(true);
    expect(clearButtonOf(input).getAttribute("aria-label")).toBe(
      "Clear search",
    );
  });

  it("marks a wrapper that should fill its row", () => {
    const input = host.createEl("input", { type: "text" });

    addInputClearButton(input, { fill: true });

    expect(
      input.parentElement?.classList.contains("rss-input-clear-fill"),
    ).toBe(true);
  });

  it("gives an input without a placeholder a blank one so CSS can hide the button while empty", () => {
    const bare = host.createEl("input", { type: "text" });
    const named = host.createEl("input", {
      type: "text",
      attr: { placeholder: "Feed URL" },
    });

    addInputClearButton(bare);
    addInputClearButton(named);

    expect(bare.placeholder).toBe(" ");
    expect(named.placeholder).toBe("Feed URL");
  });

  it("empties the input, reports it through input and change events, and keeps focus", () => {
    const input = host.createEl("input", { type: "text", value: "news" });
    const events: string[] = [];
    input.addEventListener("input", () => events.push(`input:${input.value}`));
    input.addEventListener("change", () =>
      events.push(`change:${input.value}`),
    );
    addInputClearButton(input);

    clearButtonOf(input).click();

    expect(input.value).toBe("");
    expect(events).toEqual(["input:", "change:"]);
    expect(activeDocument.activeElement).toBe(input);
  });

  it("runs onClear in place of the events when one is given", () => {
    const input = host.createEl("input", { type: "text", value: "news" });
    const onInput = vi.fn();
    input.addEventListener("input", onInput);
    const onClear = vi.fn(() => expect(input.value).toBe(""));
    addInputClearButton(input, { onClear });

    clearButtonOf(input).click();

    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onInput).not.toHaveBeenCalled();
  });

  it("cancels mousedown so the input keeps focus", () => {
    const input = host.createEl("input", { type: "text" });
    addInputClearButton(input);
    const mousedown = new MouseEvent("mousedown", { cancelable: true });

    clearButtonOf(input).dispatchEvent(mousedown);

    expect(mousedown.defaultPrevented).toBe(true);
  });

  it("leaves a disabled or read-only input untouched", () => {
    const disabled = host.createEl("input", { type: "text", value: "a" });
    const readOnly = host.createEl("input", { type: "text", value: "b" });
    disabled.disabled = true;
    readOnly.readOnly = true;
    addInputClearButton(disabled);
    addInputClearButton(readOnly);

    clearButtonOf(disabled).click();
    clearButtonOf(readOnly).click();

    expect(disabled.value).toBe("a");
    expect(readOnly.value).toBe("b");
  });

  it("clears a Setting text field through its onChange handler", () => {
    const changes: string[] = [];
    new Setting(host).addText((text) => {
      text.setValue("https://proxy.example/?url=");
      text.onChange((value) => changes.push(value));
      addInputClearButton(text.inputEl);
    });
    const input = host.querySelector("input") as HTMLInputElement;

    clearButtonOf(input).click();

    expect(changes).toEqual([""]);
    expect(input.closest(".setting-item-control")).not.toBeNull();
  });

  it("refuses an input that is not in the DOM", () => {
    const detached = createEl("input");

    expect(() => addInputClearButton(detached)).toThrow(/in the DOM/);
  });
});
