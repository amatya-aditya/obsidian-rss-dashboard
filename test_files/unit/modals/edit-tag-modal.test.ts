import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    expect(backgroundInput.disabled).toBe(true);
    expect(backgroundInput.value).toBe("");
    expect(textInput.disabled).toBe(false);
    expect(preview.style.getPropertyValue("--tag-color")).toBe("#123456");
    expect(preview.style.getPropertyValue("--tag-text-color")).toBe("#dddddd");

    useTextDefault.click();
    expect(textInput.disabled).toBe(true);
    expect(textInput.value).toBe("");
    expect(preview.style.getPropertyValue("--tag-color")).toBe("#123456");
    expect(preview.style.getPropertyValue("--tag-text-color")).toBe("#abcdef");
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
});
