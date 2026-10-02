import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { AddTagModal } from "../../../src/modals/add-tag-modal";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import type { RssDashboardSettings } from "../../../src/types/types";

function makeSettings(): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.availableTags = [{ name: "Tech", color: "#111111" }];
  return settings;
}

describe("AddTagModal", () => {
  let noticeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.empty();
  });

  const nameInput = () =>
    document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-modal-name-input",
    )!;
  const clickButton = (label: string) =>
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent === label)!
      .click();

  it("opens inside a modal container carrying its own dialog class", () => {
    new AddTagModal(new App(), {
      settings: makeSettings(),
      onAdded: vi.fn(),
    }).open();

    const dialog = document.querySelector(".rss-dashboard-add-tag-modal");
    expect(dialog).not.toBeNull();
    expect(dialog?.closest(".modal-container")).not.toBeNull();
  });

  it("closes on Cancel without adding a tag or calling onAdded", () => {
    const settings = makeSettings();
    const onAdded = vi.fn();
    new AddTagModal(new App(), { settings, onAdded }).open();

    nameInput().value = "Science";
    clickButton("Cancel");

    expect(document.querySelector(".rss-dashboard-add-tag-modal")).toBeNull();
    expect(onAdded).not.toHaveBeenCalled();
    expect(settings.availableTags).toHaveLength(1);
  });

  it("keeps the dialog open and rejects empty and duplicate names", () => {
    const settings = makeSettings();
    const onAdded = vi.fn();
    new AddTagModal(new App(), { settings, onAdded }).open();

    nameInput().value = "   ";
    clickButton("Add tag");
    expect(noticeSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "Please enter a tag name!",
    );

    nameInput().value = "tech";
    clickButton("Add tag");
    expect(noticeSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      "A tag with this name already exists!",
    );

    expect(onAdded).not.toHaveBeenCalled();
    expect(document.querySelector(".rss-dashboard-add-tag-modal")).not.toBeNull();
  });

  it("adds the tag, calls onAdded once, then closes", () => {
    const settings = makeSettings();
    const states: boolean[] = [];
    const onAdded = vi.fn(() => {
      // The tag is already in settings, and the dialog is still open.
      states.push(
        settings.availableTags.some((tag) => tag.name === "Science") &&
          document.querySelector(".rss-dashboard-add-tag-modal") !== null,
      );
    });
    new AddTagModal(new App(), { settings, onAdded }).open();

    nameInput().value = " Science ";
    clickButton("Add tag");

    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(states).toEqual([true]);
    expect(settings.availableTags.map((tag) => tag.name)).toEqual([
      "Tech",
      "Science",
    ]);
    expect(document.querySelector(".rss-dashboard-add-tag-modal")).toBeNull();
    expect(noticeSpy).toHaveBeenCalledWith(
      "[Stub Notice]",
      'Tag "Science" added successfully!',
    );
  });
});
