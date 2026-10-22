import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
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
  return {
    title: "A",
    link: "https://a.test",
    guid: "a",
    tags: [],
  } as unknown as FeedItem;
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
      app: new App(),
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
      app: new App(),
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

  it.each(["Enter", " "])(
    "opens the tag editor when %j is pressed on the Edit button",
    (key) => {
      const { anchor } = createModalWithAnchor();
      const settings = JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS),
      ) as typeof DEFAULT_SETTINGS;
      settings.availableTags = [{ name: "News", color: "#ff0000" }];
      const close = createTagsDropdownPortal({
        app: new App(),
        anchor,
        settings,
        item: makeItem(),
        onTagAssignmentChange: vi.fn(),
      });

      const keydown = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-edit-button")!
        .dispatchEvent(keydown);

      expect(
        document.querySelector(".rss-dashboard-tag-modal-color-picker"),
      ).not.toBeNull();
      expect(keydown.defaultPrevented).toBe(true);
      close();
    },
  );

  it.each(["Enter", " "])(
    "deletes the tag when %j is pressed on the Delete button",
    (key) => {
      const { anchor } = createModalWithAnchor();
      const settings = JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS),
      ) as typeof DEFAULT_SETTINGS;
      settings.availableTags = [{ name: "News", color: "#ff0000" }];
      const close = createTagsDropdownPortal({
        app: new App(),
        anchor,
        settings,
        item: makeItem(),
        onTagAssignmentChange: vi.fn(),
      });

      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-delete-button")!
        .dispatchEvent(
          new KeyboardEvent("keydown", {
            key,
            bubbles: true,
            cancelable: true,
          }),
        );

      expect(settings.availableTags).toHaveLength(0);
      close();
    },
  );

  it("reports the previous and updated tag after an edit is saved", async () => {
    const { anchor } = createModalWithAnchor();
    const settings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as typeof DEFAULT_SETTINGS;
    settings.availableTags = [{ name: "News", color: "#ff0000" }];
    const onTagEdited = vi.fn();

    const close = createTagsDropdownPortal({
      app: new App(),
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

describe("createTagsDropdownPortal keyboard operation", () => {
  let button: HTMLElement;

  const openMenu = (
    tags: { name: string; color: string }[] = [],
    options: { containTab?: boolean } = {},
  ) => {
    const settings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as typeof DEFAULT_SETTINGS;
    settings.availableTags = tags;
    const onClosed = vi.fn();
    const close = createTagsDropdownPortal({
      app: new App(),
      anchor: button,
      settings,
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
      containTab: options.containTab ?? true,
      onClosed,
    });
    return { close, onClosed };
  };

  const pressEscape = (
    target: EventTarget = document.activeElement ?? document.body,
  ) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );

  const pressTab = (
    target: EventTarget = document.activeElement ?? document.body,
    shiftKey = false,
  ) => {
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };

  const menu = () =>
    document.querySelector<HTMLElement>(
      ".rss-dashboard-tags-dropdown-content-portal",
    )!;

  // The menu's controls in document order, which is their Tab order. The
  // portal's own tabindex="-1" keeps it out.
  const menuTabStops = () =>
    Array.from(
      menu().querySelectorAll<HTMLElement>(
        'input, button, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.tabIndex >= 0);

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.useFakeTimers();
    button = document.body.createDiv({
      cls: "rss-dashboard-tags-toggle",
      attr: { role: "button", tabindex: "0", "aria-expanded": "false" },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.empty();
  });

  it("moves focus to the first tag checkbox on open", () => {
    const { close } = openMenu([
      { name: "A", color: "#111111" },
      { name: "B", color: "#222222" },
    ]);
    expect(document.activeElement).toBe(
      document.querySelector(".rss-dashboard-tag-checkbox"),
    );
    close();
  });

  it("moves focus to the menu when there are no tags", () => {
    const { close } = openMenu();
    expect(document.activeElement).toBe(
      document.querySelector(".rss-dashboard-tags-dropdown-content-portal"),
    );
    close();
  });

  it("enters the menu at its first control on Tab when there are no tags", () => {
    const { close } = openMenu();
    const stops = menuTabStops();
    expect(stops.length).toBeGreaterThan(0);

    const event = pressTab(menu());

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops[0]);
    close();
  });

  it("keeps Tab and Shift+Tab inside the menu", () => {
    const { close } = openMenu([
      { name: "A", color: "#111111" },
      { name: "B", color: "#222222" },
    ]);
    const stops = menuTabStops();
    const first = stops[0];
    const last = stops[stops.length - 1];
    last.focus();
    pressTab(last);
    expect(document.activeElement).toBe(first);

    const backwards = pressTab(first, true);
    expect(backwards.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    close();
  });

  it("leaves a Tab aimed outside the menu alone", () => {
    const { close } = openMenu();
    button.focus();

    const event = pressTab(button);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(button);
    close();
  });

  it("leaves a Tab that a control inside the menu already handled", () => {
    const { close } = openMenu([{ name: "A", color: "#111111" }]);
    const first = menuTabStops()[0];
    first.focus();
    first.addEventListener("keydown", (event) => {
      if (event.key === "Tab") event.preventDefault();
    });

    // Shift+Tab from the first control would otherwise wrap to the last.
    const event = pressTab(first, true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    close();
  });

  it("leaves Tab alone in a modal-mounted menu that did not opt in", () => {
    // The Import Starred dialog mounts this portal without `containTab`: the
    // host dialog claims Escape, so trapping Tab would make closing the whole
    // dialog the only way out (found by live testing, #1480).
    const modal = document.body.createDiv({ cls: "modal-container" });
    modal.appendChild(button);
    const { close } = openMenu([{ name: "A", color: "#111111" }], {
      containTab: false,
    });
    const first = menuTabStops()[0];
    first.focus();

    // Shift+Tab from the first control would wrap if the menu trapped Tab.
    const event = pressTab(first, true);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
    close();
  });

  it("reports aria-expanded while open and after a programmatic close", () => {
    const { close } = openMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    close();
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Esc, returns focus to the button and reports collapsed", () => {
    const { onClosed } = openMenu([{ name: "A", color: "#111111" }]);
    pressEscape();
    expect(
      document.querySelector(".rss-dashboard-tags-dropdown-content-portal"),
    ).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside click and reports collapsed", () => {
    openMenu();
    vi.runAllTimers();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores Esc once focus is somewhere unrelated to the menu", () => {
    const { close } = openMenu();
    const other = document.body.createEl("input");
    other.focus();
    pressEscape(other);
    expect(
      document.querySelector(".rss-dashboard-tags-dropdown-content-portal"),
    ).not.toBeNull();
    close();
  });

  it("stops listening for Esc after the menu closes", () => {
    const { close } = openMenu();
    close();
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves aria-expanded alone on a non-button anchor", () => {
    const { anchor } = createModalWithAnchor();
    const close = createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
    });
    expect(anchor.hasAttribute("aria-expanded")).toBe(false);
    close();
  });
});
