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

  it("keeps color selectors out of the inline 'Add new tag' row", () => {
    const { anchor } = createModalWithAnchor();
    const close = createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
    });

    const row = document.querySelector<HTMLElement>(
      ".rss-dashboard-tag-inline-add-row",
    )!;
    expect(row.querySelector("input[type='color']")).toBeNull();
    expect(
      row.querySelector(".rss-dashboard-tag-color-palette-control"),
    ).toBeNull();
    close();
  });

  it("orders the inline row as name, Add, Edit, then tag settings", () => {
    const { anchor } = createModalWithAnchor();
    const close = createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
    });

    const row = document.querySelector<HTMLElement>(
      ".rss-dashboard-tag-inline-add-row",
    )!;
    expect(
      Array.from(row.children).map(
        (el) => el.getAttribute("aria-label") ?? el.tagName.toLowerCase(),
      ),
    ).toEqual(["div", "Add tag", "Edit new tag", "Open tag settings"]);
    close();
  });

  describe("icon controls", () => {
    const openPortal = (tags = [{ name: "News", color: "#ff0000" }]) => {
      const { anchor } = createModalWithAnchor();
      const settings = JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS),
      ) as typeof DEFAULT_SETTINGS;
      settings.availableTags = tags;
      const close = createTagsDropdownPortal({
        app: new App(),
        anchor,
        settings,
        item: makeItem(),
        onTagAssignmentChange: vi.fn(),
        onOpenTagsSettings: vi.fn(),
      });
      return { settings, close };
    };

    it.each([
      [".rss-dashboard-tag-edit-button", "Edit tag"],
      [".rss-dashboard-tag-delete-button", "Delete tag"],
      [".rss-dashboard-tag-inline-add", "Add tag"],
      [".rss-dashboard-tag-inline-edit", "Edit new tag"],
      [".rss-dashboard-tag-inline-settings", "Open tag settings"],
    ])("renders %s as a native, named button", (selector, name) => {
      const { close } = openPortal();
      const control = document.querySelector<HTMLElement>(selector)!;

      expect(control.tagName).toBe("BUTTON");
      expect(control.getAttribute("type")).toBe("button");
      expect(control.getAttribute("aria-label")).toBe(name);
      expect(control.hasAttribute("role")).toBe(false);
      expect(control.hasAttribute("tabindex")).toBe(false);
      close();
    });

    it("keeps the manage-tags group container as a group", () => {
      const { close } = openPortal();
      const group = document.querySelector(
        ".rss-dashboard-tags-dropdown-content-portal",
      )!;
      expect(group.getAttribute("role")).toBe("group");
      close();
    });

    it("opens the tag editor when the Edit button is clicked", () => {
      const { close } = openPortal();
      const click = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-edit-button")!
        .dispatchEvent(click);

      expect(
        document.querySelector(".rss-dashboard-tag-modal-color-picker"),
      ).not.toBeNull();
      expect(click.defaultPrevented).toBe(true);
      close();
    });

    it("propagates a rename to folder rules and auto-tag defaults", async () => {
      const { settings, close } = openPortal();
      settings.folders = [
        {
          name: "Tech",
          subfolders: [],
          autoTags: [{ name: "News", color: "#ff0000" }],
        },
      ];
      settings.media.defaultVideoTags = ["News"];

      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-edit-button")!
        .click();
      document.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-modal-name-input",
      )!.value = "Updates";
      document
        .querySelector<HTMLButtonElement>(
          "button.rss-dashboard-primary-button",
        )!
        .click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(settings.folders[0].autoTags?.[0]?.name).toBe("Updates");
      expect(settings.media.defaultVideoTags).toEqual(["Updates"]);
      close();
    });

    it("deletes the tag when the Delete button is clicked", () => {
      const { settings, close } = openPortal();
      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-delete-button")!
        .click();

      expect(settings.availableTags).toHaveLength(0);
      close();
    });

    it("adds the typed tag when the Add button is clicked", () => {
      const { settings, close } = openPortal([]);
      document.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-inline-input",
      )!.value = "Later";
      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-inline-add")!
        .click();

      expect(settings.availableTags).toEqual([{ name: "Later" }]);
      close();
    });

    describe("Edit new tag button", () => {
      const openCreateEditor = (
        tags: { name: string; color: string }[] = [],
        typed = "Later",
      ) => {
        const onTagAssignmentChange = vi.fn();
        const onPersistSettings = vi.fn();
        const onClosed = vi.fn();
        const { anchor } = createModalWithAnchor();
        const settings = JSON.parse(
          JSON.stringify(DEFAULT_SETTINGS),
        ) as typeof DEFAULT_SETTINGS;
        settings.availableTags = tags;
        const close = createTagsDropdownPortal({
          app: new App(),
          anchor,
          settings,
          item: makeItem(),
          onTagAssignmentChange,
          onPersistSettings,
          onClosed,
        });
        document.querySelector<HTMLInputElement>(
          ".rss-dashboard-tag-inline-input",
        )!.value = typed;
        document
          .querySelector<HTMLElement>(".rss-dashboard-tag-inline-edit")!
          .click();
        return {
          settings,
          close,
          onTagAssignmentChange,
          onPersistSettings,
          onClosed,
        };
      };
      const modalName = () =>
        document.querySelector<HTMLInputElement>(
          ".rss-dashboard-edit-tag-modal .rss-dashboard-tag-modal-name-input",
        )!;
      const clickAdd = async () => {
        document
          .querySelector<HTMLButtonElement>(
            ".rss-dashboard-edit-tag-modal .rss-dashboard-primary-button",
          )!
          .click();
        await new Promise((r) => setTimeout(r, 0));
      };

      it("opens the Add/edit modal with the typed name and dismisses the popover", () => {
        const { onClosed, close } = openCreateEditor();

        expect(modalName().value).toBe("Later");
        expect(
          document.querySelector(
            ".rss-dashboard-edit-tag-modal .rss-dashboard-primary-button",
          )?.textContent,
        ).toBe("Add tag");
        expect(
          document.querySelector(".rss-dashboard-tags-dropdown-content-portal"),
        ).toBeNull();
        expect(onClosed).toHaveBeenCalledTimes(1);
        close();
      });

      it("adds the tag with default colors and assigns it to the article", async () => {
        const { settings, onTagAssignmentChange, onPersistSettings, close } =
          openCreateEditor();

        await clickAdd();

        expect(settings.availableTags).toStrictEqual([{ name: "Later" }]);
        expect(onTagAssignmentChange).toHaveBeenCalledWith(
          { name: "Later" },
          true,
        );
        expect(onPersistSettings).toHaveBeenCalledTimes(1);
        close();
      });

      it("stores the colors chosen in the modal", async () => {
        const { settings, close } = openCreateEditor();
        const picker = document.querySelector<HTMLInputElement>(
          ".rss-dashboard-tag-modal-background-input",
        )!;
        picker.value = "#123456";
        picker.dispatchEvent(new Event("input", { bubbles: true }));

        await clickAdd();

        expect(settings.availableTags).toStrictEqual([
          { name: "Later", color: "#123456" },
        ]);
        close();
      });

      it("adds nothing when the editor is cancelled", () => {
        const { settings, onTagAssignmentChange, close } = openCreateEditor();
        document
          .querySelector<HTMLButtonElement>(
            ".rss-dashboard-edit-tag-modal .rss-dashboard-modal-buttons button",
          )!
          .click();

        expect(settings.availableTags).toEqual([]);
        expect(onTagAssignmentChange).not.toHaveBeenCalled();
        close();
      });

      it("rejects a name that already exists", async () => {
        const { settings, onTagAssignmentChange, close } = openCreateEditor(
          [{ name: "News", color: "#ff0000" }],
          "news",
        );

        await clickAdd();

        expect(settings.availableTags).toHaveLength(1);
        expect(onTagAssignmentChange).not.toHaveBeenCalled();
        close();
      });

      it("rejects an empty name", async () => {
        const { settings, onTagAssignmentChange, close } = openCreateEditor(
          [],
          "  ",
        );

        await clickAdd();

        expect(settings.availableTags).toEqual([]);
        expect(onTagAssignmentChange).not.toHaveBeenCalled();
        close();
      });
    });

    it("opens tag settings and closes the menu when the settings button is clicked", () => {
      const { close } = openPortal();
      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-inline-settings")!
        .click();

      expect(
        document.querySelector(".rss-dashboard-tags-dropdown-content-portal"),
      ).toBeNull();
      close();
    });
  });

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

  it("dismisses the popover once the tag editor opens, and still reports a saved edit", async () => {
    const { anchor } = createModalWithAnchor();
    const settings = JSON.parse(
      JSON.stringify(DEFAULT_SETTINGS),
    ) as typeof DEFAULT_SETTINGS;
    settings.availableTags = [{ name: "News", color: "#ff0000" }];
    const onClosed = vi.fn();
    const onTagEdited = vi.fn();
    const close = createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings,
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
      onTagEdited,
      onClosed,
    });

    document
      .querySelector<HTMLElement>(".rss-dashboard-tag-edit-button")!
      .click();

    expect(
      document.querySelector(".rss-dashboard-tags-dropdown-content-portal"),
    ).toBeNull();
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector(".rss-dashboard-edit-tag-modal"),
    ).not.toBeNull();

    document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-name-input",
    )!.value = "Updates";
    document
      .querySelector<HTMLButtonElement>("button.rss-dashboard-primary-button")!
      .click();
    await new Promise((r) => setTimeout(r, 0));

    expect(onTagEdited).toHaveBeenCalledTimes(1);
    expect(onTagEdited.mock.calls[0][1]).toMatchObject({ name: "Updates" });
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
    button = document.body.createEl("button", {
      cls: "rss-dashboard-tags-toggle",
      attr: { type: "button", "aria-expanded": "false" },
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
