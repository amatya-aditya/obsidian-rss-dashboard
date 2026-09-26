import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { FolderAutoTagModal } from "../../../src/modals/feed-manager/folder-auto-tag-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function openModal(): FolderAutoTagModal {
  const plugin = {
    settings: { availableTags: [] },
  } as unknown as RssDashboardPlugin;
  const modal = new FolderAutoTagModal(
    new obsidian.App(),
    plugin,
    "News",
    [],
    vi.fn(async () => {}),
  );
  modal.open();
  return modal;
}

function setViewportWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  setViewportWidth(1400);
});

describe("FolderAutoTagModal", () => {
  it("removes the native close button in the mobile layout", () => {
    setViewportWidth(500);

    const modal = openModal();

    expect(modal.modalEl.querySelector(".modal-header-button")).toBeNull();
    expect(
      modal.modalEl.classList.contains("rss-mobile-feed-manager-modal"),
    ).toBe(true);
  });

  it("keeps the native close button in the desktop layout", () => {
    const modal = openModal();

    expect(modal.modalEl.querySelector(".modal-header-button")).not.toBeNull();
  });
});
