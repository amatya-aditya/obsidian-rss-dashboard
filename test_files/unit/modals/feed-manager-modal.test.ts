import { beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import { FeedManagerModal } from "../../../src/modals/feed-manager/feed-manager-modal";
import { ImportOpmlModal } from "../../../src/modals/import-opml-modal";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type RssDashboardPlugin from "../../../main";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", {
    value: 1400,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe("FeedManagerModal", () => {
  it("closes after the OPML import modal reports import started", () => {
    const app = obsidian.App.createMock();
    const plugin = {
      app,
      settings: cloneSettings(),
      saveSettings: vi.fn(async () => {}),
      getActiveDashboardView: vi.fn(async () => null),
      exportOpml: vi.fn(),
      addFeed: vi.fn(async () => true),
    };

    const openSpy = vi
      .spyOn(ImportOpmlModal.prototype, "open")
      .mockImplementation(function (this: ImportOpmlModal) {
        (
          this as unknown as { onImportStarted?: () => void }
        ).onImportStarted?.();
      });

    const modal = new FeedManagerModal(
      app as unknown as obsidian.App,
      plugin as unknown as RssDashboardPlugin,
    );
    const closeSpy = vi.spyOn(modal, "close");
    modal.open();

    const importButton = modal.contentEl.querySelector(
      ".feed-manager-import-button",
    ) as HTMLButtonElement;
    importButton.click();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
