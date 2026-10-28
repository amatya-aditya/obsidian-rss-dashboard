import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag } from "../../../src/types/types";
import { addTagMultiSelectControl } from "../../../src/components/tag-multi-select-control";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function setup(opts: {
  availableTags: Tag[];
  selectedTagNames: string[];
  onChange?: (selectedTagNames: string[]) => void | Promise<void>;
}) {
  const onChange = opts.onChange ?? vi.fn();
  const controlEl = document.body.createDiv();
  addTagMultiSelectControl({
    setting: { controlEl } as unknown as import("obsidian").Setting,
    availableTags: opts.availableTags,
    selectedTagNames: opts.selectedTagNames,
    menuTitle: "Select tags",
    onChange,
  });

  const trigger = controlEl.querySelector<HTMLButtonElement>("button")!;
  return { controlEl, trigger, onChange };
}

function getMenu(): HTMLElement {
  const menu = document.body.querySelector<HTMLElement>(
    ".rss-dashboard-tag-multi-select-menu",
  );
  if (!menu) {
    throw new Error("Tag menu not found");
  }
  return menu;
}

function getOption(name: string): HTMLButtonElement {
  const option = Array.from(
    getMenu().querySelectorAll<HTMLButtonElement>(
      ".rss-dashboard-tag-multi-select-menu-option",
    ),
  ).find((element) => element.getAttribute("data-tag-name") === name);

  if (!option) {
    throw new Error(`Tag option not found: ${name}`);
  }
  return option;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("tag multi-select control characterization", () => {
  it("normalizes selected names and keeps menu options in available-tag order", () => {
    const { trigger } = setup({
      availableTags: [
        { name: "Zulu", color: "#111111" },
        { name: "News", color: "#222222" },
        { name: "Alpha", color: "#333333" },
      ],
      selectedTagNames: ["Ghost", " News ", "News", "Zulu"],
    });

    expect(trigger.textContent).toContain("2 tags selected");
    trigger.click();

    expect(
      Array.from(
        getMenu().querySelectorAll<HTMLButtonElement>(
          ".rss-dashboard-tag-multi-select-menu-option",
        ),
      ).map((option) => option.getAttribute("data-tag-name")),
    ).toEqual(["Zulu", "News", "Alpha"]);
    expect(getOption("Zulu").getAttribute("aria-pressed")).toBe("true");
    expect(getOption("News").getAttribute("aria-pressed")).toBe("true");
    expect(getOption("Alpha").getAttribute("aria-pressed")).toBe("false");
  });

  it("updates the trigger and option before notifying the owner of a selection", () => {
    let trigger: HTMLButtonElement;
    const onChange = vi.fn((selectedTagNames: string[]) => {
      expect(selectedTagNames).toEqual(["News"]);
      expect(trigger.textContent).toContain("News");
      expect(getOption("News").getAttribute("aria-pressed")).toBe("true");
    });
    const control = setup({
      availableTags: [{ name: "News", color: "#111111" }],
      selectedTagNames: [],
      onChange,
    });
    trigger = control.trigger;

    trigger.click();
    getOption("News").click();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and prevents the key's default action", () => {
    const { trigger } = setup({
      availableTags: [{ name: "News", color: "#111111" }],
      selectedTagNames: [],
    });
    trigger.click();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });

    document.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.body.querySelector(".rss-dashboard-tag-multi-select-menu"),
    ).toBeNull();
  });

  it("closes on an outside pointer press after the desktop listener is attached", async () => {
    const { trigger } = setup({
      availableTags: [{ name: "News", color: "#111111" }],
      selectedTagNames: [],
    });
    trigger.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    document.body
      .createDiv()
      .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(
      document.body.querySelector(".rss-dashboard-tag-multi-select-menu"),
    ).toBeNull();
  });
});
