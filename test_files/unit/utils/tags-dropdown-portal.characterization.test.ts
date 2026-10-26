import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
  type Tag,
} from "../../../src/types/types";
import { createTagsDropdownPortal } from "../../../src/utils/tags-dropdown-portal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function makeItem(tags: Tag[] = []): FeedItem {
  return {
    title: "Article",
    link: "https://example.test/article",
    guid: "article-1",
    tags,
  } as unknown as FeedItem;
}

function makeSettings(tags: Tag[] = []): RssDashboardSettings {
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.availableTags = tags;
  return settings;
}

describe("tags dropdown portal characterization", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.empty();
  });

  it("mounts in a modal, focuses its first tag, and restores focus on Escape", () => {
    const modal = document.body.createDiv({ cls: "modal-container" });
    const anchor = modal.createEl("button", {
      text: "Manage tags",
      attr: { type: "button" },
    });
    anchor.focus();
    const onOpen = vi.fn();
    const onClosed = vi.fn();

    createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings: makeSettings([{ name: "News", color: "#123456" }]),
      item: makeItem(),
      onTagAssignmentChange: vi.fn(),
      onOpen,
      onClosed,
    });

    const portal = modal.querySelector<HTMLElement>(
      ".rss-dashboard-tags-dropdown-content-portal",
    )!;
    const checkbox = portal.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-checkbox",
    )!;
    expect(portal.getAttribute("role")).toBe("group");
    expect(anchor.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(checkbox);
    expect(onOpen).toHaveBeenCalledWith(portal);

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    checkbox.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(portal.isConnected).toBe(false);
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(anchor);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("assigns a tag when its row is clicked and clears the processing state", () => {
    const anchor = document.body.createEl("button", {
      attr: { type: "button" },
    });
    const tag = { name: "Research", color: "#654321" };
    const onTagAssignmentChange = vi.fn();

    createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings: makeSettings([tag]),
      item: makeItem(),
      onTagAssignmentChange,
    });

    const row = document.querySelector<HTMLElement>(
      ".rss-dashboard-tag-label",
    )!;
    row.click();

    expect(onTagAssignmentChange).toHaveBeenCalledWith(tag, true);
    expect(
      row.parentElement?.classList.contains(
        "rss-dashboard-tag-item-processing",
      ),
    ).toBe(true);
    vi.advanceTimersByTime(200);
    expect(
      row.parentElement?.classList.contains(
        "rss-dashboard-tag-item-processing",
      ),
    ).toBe(false);
  });

  it("persists a newly added inline tag before reporting its assignment", () => {
    const anchor = document.body.createEl("button", {
      attr: { type: "button" },
    });
    const settings = makeSettings();
    const callbacks: string[] = [];

    createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings,
      item: makeItem(),
      onTagAssignmentChange: (tag, checked) => {
        callbacks.push(`assign:${tag.name}:${checked}`);
      },
      onPersistSettings: () => {
        callbacks.push("persist");
      },
      onAfterSettingsTagsMutated: () => {
        callbacks.push("mutated");
      },
    });

    const input = document.querySelector<HTMLInputElement>(
      ".rss-dashboard-tag-inline-input",
    )!;
    input.value = " Later ";
    document
      .querySelector<HTMLButtonElement>(
        ".rss-dashboard-tag-inline-button:not(.rss-dashboard-tag-inline-settings)",
      )!
      .click();

    expect(settings.availableTags).toEqual([
      { name: "Later", color: "#8a5cf5" },
    ]);
    expect(callbacks).toEqual(["persist", "mutated", "assign:Later:true"]);
    expect(
      document.querySelector(".rss-dashboard-tag-label")?.textContent,
    ).toBe("Later");
  });

  it("removes a deleted tag from the palette and unassigns it from the current item", () => {
    const anchor = document.body.createEl("button", {
      attr: { type: "button" },
    });
    const tag = { name: "Research", color: "#654321" };
    const settings = makeSettings([tag]);
    const onTagAssignmentChange = vi.fn();

    createTagsDropdownPortal({
      app: new App(),
      anchor,
      settings,
      item: makeItem([tag]),
      onTagAssignmentChange,
    });
    document
      .querySelector<HTMLButtonElement>(".rss-dashboard-tag-delete-button")!
      .click();

    expect(settings.availableTags).toEqual([]);
    expect(onTagAssignmentChange).toHaveBeenCalledWith(tag, false);
    expect(document.querySelector(".rss-dashboard-tag-item")).toBeNull();
  });
});
