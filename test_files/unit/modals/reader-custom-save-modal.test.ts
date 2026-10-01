import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { ReaderCustomSaveModal } from "../../../src/modals/reader-custom-save-modal";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../../../src/types/types";

function makeItem(): FeedItem {
  return {
    title: "Article",
    link: "https://example.com/a",
    description: "Body",
    pubDate: "2026-08-07",
    guid: "a",
    feedTitle: "Feed",
    feedUrl: "https://example.com/feed.xml",
    coverImage: "",
  };
}

function makeSettings(): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  settings.feeds = [];
  settings.articleSaving.defaultFolder = "Saved";
  settings.articleSaving.defaultTemplate = "Default template";
  settings.articleSaving.savedTemplates = [];
  return settings;
}

describe("ReaderCustomSaveModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    document.body.empty();
  });

  function open(onSave = vi.fn()) {
    const item = makeItem();
    new ReaderCustomSaveModal(new App(), {
      settings: makeSettings(),
      item,
      displayTitle: "Shown title",
      feedTemplate: undefined,
      onSave,
    }).open();
    return { item, onSave };
  }

  const clickButton = (label: string) =>
    Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent === label)!
      .click();

  it("opens inside a modal container carrying its own dialog class", () => {
    open();

    const dialog = document.querySelector(".rss-dashboard-custom-save-modal");
    expect(dialog).not.toBeNull();
    expect(dialog?.closest(".modal-container")).not.toBeNull();
    expect(
      document.querySelector<HTMLTextAreaElement>("textarea")?.value,
    ).toBe("Default template");
  });

  it("closes on Cancel without calling the save callback", () => {
    const { onSave } = open();

    clickButton("Cancel");

    expect(document.querySelector(".rss-dashboard-custom-save-modal")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("hands the folder and template to the save callback once, then closes", async () => {
    const onSave = vi.fn(() => {
      // The dialog stays open until the save has finished.
      expect(
        document.querySelector(".rss-dashboard-custom-save-modal"),
      ).not.toBeNull();
    });
    const { item } = open(onSave);

    document.querySelector<HTMLInputElement>(
      ".rss-dashboard-folder-input-container input",
    )!.value = " Notes ";
    clickButton("Save");

    await vi.waitFor(() => {
      expect(
        document.querySelector(".rss-dashboard-custom-save-modal"),
      ).toBeNull();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      item,
      displayTitle: "Shown title",
      folder: "Notes",
      template: "Default template",
      pendingNewTemplate: null,
      selectedTemplateId: "",
    });
  });
});
