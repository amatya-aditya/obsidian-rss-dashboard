import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type FeedItem } from "../../../src/types/types";
import { createTagsDropdownPortal } from "../../../src/utils/tags-dropdown-portal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

/**
 * Mirrors Obsidian's keymap focus trap: while a modal is open, its scope's
 * `tabFocusContainerEl` is the `.modal-container`, and any `focusin` landing
 * outside that container is bounced (on the next tick) back to the first
 * focusable element inside it.
 */
function installModalFocusTrap(container: HTMLElement): () => void {
  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as Node | null;
    if (!target || target === document.body || container.contains(target)) {
      return;
    }
    window.setTimeout(() => {
      container
        .querySelector<HTMLElement>("input, button, [tabindex]")
        ?.focus();
    }, 0);
  };
  document.addEventListener("focusin", onFocusIn);
  return () => document.removeEventListener("focusin", onFocusIn);
}

function createModalWithAnchor(): {
  container: HTMLElement;
  anchor: HTMLElement;
} {
  const container = document.body.createDiv({ cls: "modal-container" });
  const modal = container.createDiv({ cls: "modal" });
  modal.createEl("input", { attr: { type: "text" }, cls: "modal-first-input" });
  const anchor = modal.createDiv({ cls: "import-preview-tags-control" });
  return { container, anchor };
}

function makeItem(): FeedItem {
  return { title: "A", link: "https://a.test", guid: "a", tags: [] } as unknown as FeedItem;
}

describe("createTagsDropdownPortal inside a modal", () => {
  let removeTrap: (() => void) | null = null;

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.useFakeTimers();
  });

  afterEach(() => {
    removeTrap?.();
    removeTrap = null;
    vi.useRealTimers();
    document.body.empty();
  });

  it("keeps focus in the 'Add new tag...' input when opened from inside a modal", () => {
    const { container, anchor } = createModalWithAnchor();
    removeTrap = installModalFocusTrap(container);

    const close = createTagsDropdownPortal({
      anchor,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
    });

    const nameInput = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-inline-input",
    )!;
    nameInput.focus();
    vi.runAllTimers();

    expect(document.activeElement).toBe(nameInput);
    close();
  });
});

describe("createTagsDropdownPortal tag editing", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.restoreAllMocks();
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    document.body.empty();
  });

  it("starts the inline 'Add new tag' color at the default tag color", () => {
    const { anchor } = createModalWithAnchor();
    const close = createTagsDropdownPortal({
      anchor,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
    });

    expect(
      document.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-inline-color",
      )?.value,
    ).toBe("#8a5cf5");
    close();
  });

  it("reports the previous and updated tag after an edit is saved", async () => {
    const { anchor } = createModalWithAnchor();
    const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
    settings.availableTags = [{ name: "News", color: "#ff0000" }];
    const onTagEdited = vi.fn();

    const close = createTagsDropdownPortal({
      anchor,
      settings,
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
      onTagEdited,
    });

    document
      .querySelector<HTMLElement>(".rss-dashboard-tag-edit-button")!
      .click();
    document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-color-picker",
    )!.value = "#00ff00";
    document
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-tag-modal-form .rss-dashboard-primary-button",
      )!
      .click();
    await new Promise((r) => setTimeout(r, 0));

    expect(onTagEdited).toHaveBeenCalledWith(
      { name: "News", color: "#ff0000" },
      { name: "News", color: "#00ff00" },
    );
    close();
  });
});
