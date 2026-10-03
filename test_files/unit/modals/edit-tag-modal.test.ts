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
    expect(onSave).toHaveBeenCalledWith({ name: "Technology", color: "#111111" });
    expect(events).toEqual(["save:open"]);
    expect(document.querySelector(".rss-dashboard-edit-tag-modal")).toBeNull();
  });
});
