import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as obsidian from "obsidian";
import { AddFeedModal } from "../../../src/modals/feed-manager/add-feed-modal";
import { AddTagModal } from "../../../src/modals/add-tag-modal";
import { FolderNameModal } from "../../../src/modals/folder-name-modal";
import { ImportSuccessModal } from "../../../src/modals/import-success-modal";
import { RefreshDetailsModal } from "../../../src/modals/refresh-details-modal";
import { ShortcutHelpModal } from "../../../src/modals/shortcut-help-modal";
import {
  ConfirmDeleteModal,
  HighlightWordEditModal,
} from "../../../src/settings/modals/settings-modals";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// Every plugin modal goes through AccessibleModal (#826 AC-014d/e/f). These
// tests open real modals and read the result the way an assistive technology
// does: role, aria-modal and the name resolved from aria-labelledby.

function dialogName(modal: obsidian.Modal): string {
  const labelledBy = modal.containerEl.getAttribute("aria-labelledby");
  if (labelledBy) {
    return document.getElementById(labelledBy)?.textContent?.trim() ?? "";
  }
  return modal.containerEl.getAttribute("aria-label") ?? "";
}

function app(): obsidian.App {
  return new obsidian.App();
}

const MODALS: Array<[string, string, () => obsidian.Modal]> = [
  [
    "FolderNameModal",
    "Add folder",
    () =>
      new FolderNameModal(app(), { title: "Add folder", onSubmit: vi.fn() }),
  ],
  [
    "AddTagModal",
    "Add new tag",
    () =>
      new AddTagModal(app(), {
        settings: structuredClone(DEFAULT_SETTINGS),
        onAdded: vi.fn(),
      }),
  ],
  [
    "AddFeedModal",
    "Add feed",
    () => new AddFeedModal(app(), [], vi.fn(), vi.fn()),
  ],
  [
    "ShortcutHelpModal",
    "Keyboard shortcuts",
    () => new ShortcutHelpModal(app(), structuredClone(DEFAULT_SETTINGS)),
  ],
  [
    "RefreshDetailsModal",
    "Refresh details",
    () => new RefreshDetailsModal(app(), ["3 feeds refreshed"]),
  ],
  [
    "ImportSuccessModal",
    "Import successful",
    () => new ImportSuccessModal(app(), "Imported 3 feeds"),
  ],
  [
    "ConfirmDeleteModal",
    "Delete highlight word?",
    () => new ConfirmDeleteModal(app(), "alpha"),
  ],
  [
    "HighlightWordEditModal",
    "Edit highlight word",
    () => new HighlightWordEditModal(app(), "alpha"),
  ],
];

describe("plugin modals expose dialog semantics", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });
  afterEach(() => {
    document.body.empty();
  });

  it.each(MODALS)(
    "%s is a modal dialog named from its visible heading",
    (_name, heading, create) => {
      const modal = create();
      modal.open();

      expect(modal.containerEl.getAttribute("role")).toBe("dialog");
      expect(modal.containerEl.getAttribute("aria-modal")).toBe("true");
      expect(dialogName(modal)).toBe(heading);
      modal.close();
    },
  );

  it("returns focus from a real modal to the control that opened it", () => {
    const trigger = document.body.createEl("button", { text: "Add folder" });
    trigger.focus();
    const modal = new FolderNameModal(app(), {
      title: "Add folder",
      onSubmit: vi.fn(),
    });
    modal.open();
    modal.contentEl.querySelector("input")?.focus();

    modal.close();

    expect(document.activeElement).toBe(trigger);
  });

  it("keeps Tab inside a real modal", () => {
    const modal = new FolderNameModal(app(), {
      title: "Add folder",
      onSubmit: vi.fn(),
    });
    modal.open();
    const stops = Array.from(
      modal.contentEl.querySelectorAll<HTMLElement>("input, button"),
    );
    stops[stops.length - 1].focus();
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });

    stops[stops.length - 1].dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(stops[0]);
    modal.close();
  });
});

describe("modal base class seam", () => {
  const ROOT = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
  );
  const SEAM = path.join("src", "utils", "accessible-modal.ts");

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return full.endsWith(".ts") ? [full] : [];
    });
  }

  it("lets no production file extend or construct Obsidian's bare Modal", () => {
    const offenders = [
      path.join(ROOT, "main.ts"),
      ...sourceFiles(path.join(ROOT, "src")),
    ]
      .filter((file) => path.relative(ROOT, file) !== SEAM)
      .filter((file) =>
        /extends Modal\b|new Modal\(/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"));

    // A new modal extends AccessibleModal from src/utils/accessible-modal, so
    // it gets the dialog role, name, Tab containment and focus return for free.
    expect(offenders).toEqual([]);
  });
});
