import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { EditTagModal } from "../../../src/modals/edit-tag-modal";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type { RssDashboardSettings } from "../../../src/types/types";

function makeSettings(): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.availableTags = [
    { name: "Tech", color: "#111111" },
    { name: "News", color: "#222222" },
  ];
  settings.feeds = [];
  return settings;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("EditTagModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  it("opens inside a modal container carrying its own dialog class", () => {
    const settings = makeSettings();
    new EditTagModal(new App(), {
      settings,
      tag: settings.availableTags[0],
    }).open();

    const dialog = document.querySelector(".rss-dashboard-edit-tag-modal");
    expect(dialog).not.toBeNull();
    expect(dialog?.closest(".modal-container")).not.toBeNull();
    expect(
      document.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-modal-name-input",
      )?.value,
    ).toBe("Tech");
  });

  it("closes on Cancel without saving or calling onSave", () => {
    const settings = makeSettings();
    const onSave = vi.fn();
    new EditTagModal(new App(), {
      settings,
      tag: settings.availableTags[0],
      onSave,
    }).open();

    document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-name-input",
    )!.value = "Changed";
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent === "Cancel")!
      .click();

    expect(document.querySelector(".rss-dashboard-edit-tag-modal")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
    expect(settings.availableTags[0].name).toBe("Tech");
  });

  it("calls onSave once with the updated tag, then closes", async () => {
    const settings = makeSettings();
    const tag = settings.availableTags[0];
    const events: string[] = [];
    const onSave = vi.fn(() => {
      // The dialog must still be open while the callback runs.
      events.push(
        document.querySelector(".rss-dashboard-edit-tag-modal")
          ? "save:open"
          : "save:closed",
      );
    });
    new EditTagModal(new App(), { settings, tag, onSave }).open();

    document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-name-input",
    )!.value = "Technology";
    document
      .querySelector<HTMLButtonElement>("button.rss-dashboard-primary-button")!
      .click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      name: "Technology",
      color: "#111111",
      textColor: undefined,
    });
    expect(events).toEqual(["save:open"]);
    expect(document.querySelector(".rss-dashboard-edit-tag-modal")).toBeNull();
  });

  it("applies independent presets to the draft and saves them through Save changes", async () => {
    const settings = makeSettings();
    const tag = { name: "Tech" };
    settings.availableTags[0] = tag;
    const onSave = vi.fn();
    new EditTagModal(new App(), { settings, tag, onSave }).open();

    const palettes = document.querySelectorAll<HTMLSelectElement>(
      ".rss-dashboard-tag-color-palette-control select",
    );
    expect(palettes).toHaveLength(2);
    palettes[0].value = "Vintage";
    palettes[0].dispatchEvent(new Event("change", { bubbles: true }));
    palettes[1].value = "Neon/Synthwave";
    palettes[1].dispatchEvent(new Event("change", { bubbles: true }));
    expect(palettes[1].value).toBe("Neon/Synthwave");

    const triggers = document.querySelectorAll<HTMLButtonElement>(
      ".rss-dashboard-tag-color-palette-control-color-trigger",
    );
    triggers[0].click();
    Array.from(document.querySelectorAll<HTMLButtonElement>("[role=option]"))
      .find((option) => option.getAttribute("aria-label") === "Blue #547CA5")
      ?.click();
    triggers[1].click();
    Array.from(document.querySelectorAll<HTMLButtonElement>("[role=option]"))
      .find((option) => option.getAttribute("aria-label") === "Violet #A78BFA")
      ?.click();

    expect(
      document.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-modal-text-input",
      )?.value,
    ).toBe("#a78bfa");
    expect(
      document.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-modal-text-default",
      )?.checked,
    ).toBe(false);
    expect(
      document.querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-modal-background-default",
      )?.checked,
    ).toBe(false);
    expect(
      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-modal-preview")
        ?.style.getPropertyValue("--tag-color"),
    ).toBe("#547ca5");
    expect(
      document
        .querySelector<HTMLElement>(".rss-dashboard-tag-modal-preview")
        ?.style.getPropertyValue("--tag-text-color"),
    ).toBe("#a78bfa");

    document
      .querySelector<HTMLButtonElement>("button.rss-dashboard-primary-button")!
      .click();
    await flushPromises();

    expect(settings.availableTags[0]).toEqual({
      name: "Tech",
      color: "#547ca5",
      textColor: "#a78bfa",
    });
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("keeps background and text overrides independent and previews inherited values", () => {
    const settings = makeSettings();
    settings.defaultTagColor = "#123456";
    settings.defaultTagTextColor = "#abcdef";
    const tag = settings.availableTags[0];
    tag.textColor = "#dddddd";
    new EditTagModal(new App(), { settings, tag }).open();

    const backgroundInput = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-background-input",
    )!;
    const textInput = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-text-input",
    )!;
    const useBackgroundDefault = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-background-default",
    )!;
    const useTextDefault = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-text-default",
    )!;
    const preview = document.querySelector<HTMLElement>(
      ".rss-dashboard-tag-modal-preview",
    )!;

    expect(useBackgroundDefault.checked).toBe(false);
    expect(useTextDefault.checked).toBe(false);
    useBackgroundDefault.click();
    // The picker stays visible and clickable, showing the inherited color.
    expect(backgroundInput.disabled).toBe(false);
    expect(backgroundInput.type).toBe("color");
    expect(backgroundInput.value).toBe("#123456");
    expect(textInput.disabled).toBe(false);
    expect(preview.style.getPropertyValue("--tag-color")).toBe("#123456");
    expect(preview.style.getPropertyValue("--tag-text-color")).toBe("#dddddd");

    useTextDefault.click();
    expect(textInput.disabled).toBe(false);
    expect(textInput.type).toBe("color");
    expect(textInput.value).toBe("#abcdef");
    expect(preview.style.getPropertyValue("--tag-color")).toBe("#123456");
    expect(preview.style.getPropertyValue("--tag-text-color")).toBe("#abcdef");
  });

  it("restores the custom color when Use default is switched back off", () => {
    const settings = makeSettings();
    settings.defaultTagColor = "#123456";
    const tag = settings.availableTags[0];
    new EditTagModal(new App(), { settings, tag }).open();

    const backgroundInput = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-background-input",
    )!;
    const useBackgroundDefault = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-background-default",
    )!;

    useBackgroundDefault.click();
    expect(backgroundInput.value).toBe("#123456");
    useBackgroundDefault.click();
    expect(backgroundInput.disabled).toBe(false);
    expect(backgroundInput.value).toBe("#111111");
  });

  describe("Custom picker while Use default is on", () => {
    function pickColor(input: HTMLInputElement, value: string) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function openWithInheritedBackground(onSave = vi.fn()) {
      const settings = makeSettings();
      settings.defaultTagColor = "#123456";
      const tag = { name: "Tech", textColor: "#dddddd" };
      settings.availableTags[0] = tag;
      new EditTagModal(new App(), { settings, tag, onSave }).open();
      return {
        settings,
        onSave,
        backgroundInput: document.querySelector<HTMLInputElement>(
          ".rss-dashboard-tag-modal-background-input",
        )!,
        useBackgroundDefault: document.querySelector<HTMLInputElement>(
          ".rss-dashboard-tag-modal-background-default",
        )!,
        useTextDefault: document.querySelector<HTMLInputElement>(
          ".rss-dashboard-tag-modal-text-default",
        )!,
        preview: document.querySelector<HTMLElement>(
          ".rss-dashboard-tag-modal-preview",
        )!,
      };
    }

    it("is clickable from the start and unchecks Use default when its color changes", () => {
      const { backgroundInput, useBackgroundDefault, useTextDefault, preview } =
        openWithInheritedBackground();

      expect(useBackgroundDefault.checked).toBe(true);
      expect(backgroundInput.disabled).toBe(false);
      expect(backgroundInput.value).toBe("#123456");

      pickColor(backgroundInput, "#00ff00");

      expect(useBackgroundDefault.checked).toBe(false);
      expect(backgroundInput.value).toBe("#00ff00");
      expect(preview.style.getPropertyValue("--tag-color")).toBe("#00ff00");
      // The other section is untouched.
      expect(useTextDefault.checked).toBe(false);
      expect(preview.style.getPropertyValue("--tag-text-color")).toBe(
        "#dddddd",
      );
    });

    it("saves the picked color instead of inheriting the default", async () => {
      const { settings, onSave, backgroundInput } =
        openWithInheritedBackground();

      pickColor(backgroundInput, "#00ff00");
      document
        .querySelector<HTMLButtonElement>(
          "button.rss-dashboard-primary-button",
        )!
        .click();
      await flushPromises();

      expect(settings.availableTags[0]).toMatchObject({
        name: "Tech",
        color: "#00ff00",
        textColor: "#dddddd",
      });
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ color: "#00ff00" }),
      );
    });

    it("shows the inherited color again on re-check and the picked color on uncheck", () => {
      const { backgroundInput, useBackgroundDefault } =
        openWithInheritedBackground();

      pickColor(backgroundInput, "#00ff00");
      useBackgroundDefault.click();
      expect(useBackgroundDefault.checked).toBe(true);
      expect(backgroundInput.value).toBe("#123456");
      expect(backgroundInput.disabled).toBe(false);

      useBackgroundDefault.click();
      expect(useBackgroundDefault.checked).toBe(false);
      expect(backgroundInput.value).toBe("#00ff00");
    });
  });

  it("saves cleared overrides as inheritance and preserves the other override", async () => {
    const settings = makeSettings();
    settings.defaultTagColor = "#123456";
    settings.defaultTagTextColor = "#abcdef";
    const tag = settings.availableTags[0];
    tag.textColor = "#dddddd";
    const onSave = vi.fn();
    new EditTagModal(new App(), { settings, tag, onSave }).open();

    document
      .querySelector<HTMLInputElement>(
        ".rss-dashboard-tag-modal-background-default",
      )!
      .click();
    document
      .querySelector<HTMLButtonElement>(".rss-dashboard-primary-button")!
      .click();
    await flushPromises();

    expect(settings.availableTags[0]).toMatchObject({
      name: "Tech",
      textColor: "#dddddd",
    });
    expect(settings.availableTags[0]).not.toHaveProperty("color");
    expect(onSave).toHaveBeenCalledWith({
      name: "Tech",
      color: undefined,
      textColor: "#dddddd",
    });
  });

  describe("layout", () => {
    function openModal() {
      const settings = makeSettings();
      new EditTagModal(new App(), {
        settings,
        tag: settings.availableTags[0],
      }).open();
      return document.querySelector<HTMLElement>(
        ".rss-dashboard-edit-tag-modal",
      )!;
    }

    it("names the dialog Add/edit tag so the modal can serve both flows", () => {
      openModal();

      const container =
        document.querySelector<HTMLElement>(".modal-container")!;
      const headingId = container.getAttribute("aria-labelledby")!;
      expect(document.getElementById(headingId)?.textContent).toBe(
        "Add/edit tag",
      );
    });

    it("labels the name field above the input", () => {
      const dialog = openModal();

      const label = dialog.querySelector(".rss-dashboard-tag-modal-name-label");
      expect(label?.textContent).toBe("Tag name");
      // The clear-button helper wraps the input, so the label's next sibling
      // contains the input rather than being it.
      expect(
        label?.nextElementSibling?.querySelector(
          "input.rss-dashboard-tag-modal-name-input",
        ),
      ).not.toBeNull();
      expect(label?.getAttribute("for")).toBe(
        dialog
          .querySelector(".rss-dashboard-tag-modal-name-input")
          ?.getAttribute("id"),
      );
    });

    it("lists Background then Text, each with Use default, Palette, Color and Custom rows", () => {
      const dialog = openModal();

      const sections = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          ".rss-dashboard-tag-modal-section",
        ),
      );
      expect(
        sections.map(
          (section) =>
            section.querySelector(".rss-dashboard-tag-modal-section-title")
              ?.textContent,
        ),
      ).toEqual(["Background", "Text"]);

      for (const section of sections) {
        const header = section.querySelector(
          ".rss-dashboard-tag-modal-section-header",
        )!;
        expect(header.textContent).toContain("Use default");
        expect(header.querySelector("input[type=checkbox]")).not.toBeNull();
        expect(
          section.querySelector(
            ".rss-dashboard-tag-color-palette-control select",
          ),
        ).not.toBeNull();
        expect(
          section.querySelector(
            ".rss-dashboard-tag-color-palette-control-color-trigger",
          ),
        ).not.toBeNull();

        const custom = section.querySelector(
          ".rss-dashboard-tag-modal-custom-row",
        )!;
        expect(custom.textContent).toContain("Custom");
        expect(
          custom.querySelector("input.rss-dashboard-tag-modal-color-picker"),
        ).not.toBeNull();
        expect(
          custom.querySelector(
            ".rss-dashboard-tag-color-palette-control-value-readout",
          ),
        ).not.toBeNull();
      }
    });

    it("shows only the chip inside a Live preview card, with no form-state callout", () => {
      const dialog = openModal();

      const card = dialog.querySelector(
        ".rss-dashboard-tag-modal-preview-card",
      )!;
      expect(card.textContent).toContain("Live preview");
      expect(
        card.querySelector(".rss-dashboard-tag-modal-preview")?.textContent,
      ).toBe("Tech");
      expect(card.textContent).not.toContain("Updates as you choose");
      expect(dialog.textContent).not.toContain("Current form state");
    });

    it("ends with a footer holding Cancel then Save changes", () => {
      const dialog = openModal();

      const footer = dialog.querySelector(".rss-dashboard-modal-buttons")!;
      expect(
        footer.parentElement?.classList.contains(
          "rss-dashboard-tag-modal-form",
        ),
      ).toBe(true);
      expect(footer.previousElementSibling?.className).toContain(
        "rss-dashboard-tag-modal-preview-card",
      );
      expect(
        Array.from(footer.querySelectorAll("button")).map(
          (button) => button.textContent,
        ),
      ).toEqual(["Cancel", "Save changes"]);
    });

    it("shows the pointer cursor over the Cancel and Save buttons", () => {
      const css = readFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../src/styles/modals.css",
        ),
        "utf-8",
      );
      const rule = css.match(
        /\.rss-dashboard-edit-tag-modal \.rss-dashboard-modal-buttons button\s*\{([^}]*)\}/,
      )?.[1];

      expect(rule).toMatch(/cursor:\s*pointer/);
    });

    it("gives Cancel and Save one shared shape: theme radius on desktop, a pill on mobile", () => {
      // jsdom does not run the cascade, so assert the stylesheet contract.
      // The scoped selector targets every footer button, so they cannot diverge.
      const root = postcss.parse(
        readFileSync(
          path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "../../../src/styles/modals.css",
          ),
          "utf-8",
        ),
      );
      const footerButtons =
        ".rss-dashboard-edit-tag-modal .rss-dashboard-modal-buttons button";
      const radiusIn = (container: postcss.Root | postcss.AtRule) => {
        let radius: string | undefined;
        container.each((node) => {
          if (
            node.type === "rule" &&
            node.selectors
              .map((s) => s.replace(/\s+/g, " "))
              .includes(footerButtons)
          ) {
            node.each((decl) => {
              if (decl.type === "decl" && decl.prop === "border-radius") {
                radius = decl.value;
              }
            });
          }
        });
        return radius;
      };
      const mobile = root.nodes.find(
        (node): node is postcss.AtRule =>
          node.type === "atrule" &&
          node.name === "media" &&
          node.params === "(max-width: 768px)" &&
          radiusIn(node) !== undefined,
      );

      expect(radiusIn(root)).toBe("var(--button-radius, 6px)");
      expect(mobile && radiusIn(mobile)).toBe("999px");
    });

    it("keeps the Custom color picker a fixed-size circle", () => {
      const css = readFileSync(
        path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../src/styles/modals.css",
        ),
        "utf-8",
      );
      const rule = css.match(
        /body \.rss-dashboard-tag-modal-color-picker\s*\{([^}]*)\}/,
      )?.[1];

      expect(rule).toMatch(/width:\s*38px/);
      expect(rule).toMatch(/height:\s*38px/);
      expect(rule).toMatch(/border-radius:\s*50%/);
    });
  });
});
