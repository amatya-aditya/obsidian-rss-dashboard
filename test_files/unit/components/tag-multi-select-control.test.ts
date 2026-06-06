import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag } from "../../../src/types/types";
import { addTagMultiSelectControl } from "../../../src/components/tag-multi-select-control";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function setup(opts: {
  availableTags: Tag[];
  selectedTagNames: string[];
  triggerEmptyLabel?: string;
}) {
  const onChange = vi.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);

  addTagMultiSelectControl({
    setting: { controlEl: container } as unknown as import("obsidian").Setting,
    availableTags: opts.availableTags,
    selectedTagNames: opts.selectedTagNames,
    triggerEmptyLabel: opts.triggerEmptyLabel,
    menuTitle: "Select tags",
    onChange,
  });

  const wrapper = container.querySelector<HTMLElement>(
    ".rss-dashboard-tag-multi-select",
  );
  const trigger = container.querySelector<HTMLButtonElement>(
    ".rss-dashboard-tag-multi-select-trigger",
  );

  expect(wrapper).not.toBeNull();
  expect(trigger).not.toBeNull();

  return { container, wrapper: wrapper!, trigger: trigger!, onChange };
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
  ).find((el) => el.getAttribute("data-tag-name") === name);

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

describe("tag-multi-select", () => {
  it("renders a compact trigger with the empty summary when no tags are selected", () => {
    const { trigger } = setup({
      availableTags: [{ name: "News", color: "#111122" }],
      selectedTagNames: [],
      triggerEmptyLabel: "None",
    });

    expect(trigger.textContent).toContain("None");
    expect(trigger.disabled).toBe(false);
  });

  it("renders the single selected tag name in the trigger summary", () => {
    const { trigger } = setup({
      availableTags: [
        { name: "News", color: "#111122" },
        { name: "Tech", color: "#228811" },
      ],
      selectedTagNames: ["Tech"],
    });

    expect(trigger.textContent).toContain("Tech");
  });

  it("renders an aggregate summary when multiple tags are selected", () => {
    const { trigger } = setup({
      availableTags: [
        { name: "News", color: "#111122" },
        { name: "Tech", color: "#228811" },
      ],
      selectedTagNames: ["News", "Tech"],
    });

    expect(trigger.textContent).toContain("2 tags selected");
  });

  it("opens and closes the dropdown menu from the trigger", () => {
    const { trigger } = setup({
      availableTags: [{ name: "News", color: "#111122" }],
      selectedTagNames: [],
    });

    trigger.click();
    expect(getMenu()).toBeTruthy();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    trigger.click();
    expect(
      document.body.querySelector(".rss-dashboard-tag-multi-select-menu"),
    ).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("clicking outside closes the open menu", async () => {
    const { trigger } = setup({
      availableTags: [{ name: "News", color: "#111122" }],
      selectedTagNames: [],
    });

    trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(
      document.body.querySelector(".rss-dashboard-tag-multi-select-menu"),
    ).toBeNull();
  });

  it("clicking an option emits the cumulative normalized array", () => {
    const { trigger, onChange } = setup({
      availableTags: [
        { name: "News", color: "#111122" },
        { name: "Tech", color: "#228811" },
      ],
      selectedTagNames: ["News"],
    });

    trigger.click();
    getOption("Tech").click();

    expect(onChange).toHaveBeenCalledWith(["News", "Tech"]);
    expect(trigger.textContent).toContain("2 tags selected");
  });

  it("repeated toggle on the same option updates DOM state without parent rerender", () => {
    const { trigger, onChange } = setup({
      availableTags: [{ name: "News", color: "#111122" }],
      selectedTagNames: [],
    });

    trigger.click();
    getOption("News").click();
    expect(onChange).toHaveBeenLastCalledWith(["News"]);
    expect(getOption("News").getAttribute("aria-pressed")).toBe("true");
    expect(trigger.textContent).toContain("News");

    getOption("News").click();
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(getOption("News").getAttribute("aria-pressed")).toBe("false");
    expect(trigger.textContent).toContain("None");
  });

  it("keyboard activation toggles the selected option", () => {
    const { trigger, onChange } = setup({
      availableTags: [{ name: "News", color: "#111122" }],
      selectedTagNames: [],
    });

    trigger.click();
    getOption("News").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );

    expect(onChange).toHaveBeenCalledWith(["News"]);
  });

  it("dedupes repeated names and ignores names not present in availableTags", () => {
    const { trigger } = setup({
      availableTags: [
        { name: "News", color: "#111122" },
        { name: "Tech", color: "#228811" },
      ],
      selectedTagNames: ["News", "Ghost", "News"],
    });

    expect(trigger.textContent).toContain("News");
    trigger.click();
    expect(getOption("News").getAttribute("aria-pressed")).toBe("true");
    expect(getOption("Tech").getAttribute("aria-pressed")).toBe("false");
  });

  it("shows a disabled trigger with empty-state summary when there are no available tags", () => {
    const { wrapper, trigger } = setup({
      availableTags: [],
      selectedTagNames: [],
      triggerEmptyLabel: "None",
    });

    expect(wrapper.classList.contains("rss-dashboard-tag-multi-select--empty")).toBe(
      true,
    );
    expect(trigger.disabled).toBe(true);
    expect(trigger.textContent).toContain("None");
  });
});
