import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { App } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import {
  ShortcutHelpModal,
  SHORTCUT_SECTIONS,
} from "../../../src/modals/shortcut-help-modal";

describe("ShortcutHelpModal", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  function createMockApp(): App {
    return {} as unknown as App;
  }

  it("renders the help modal with correct sections", () => {
    const app = createMockApp();
    const modal = new ShortcutHelpModal(app, structuredClone(DEFAULT_SETTINGS));

    // Simulate Obsidian Modal open behavior
    modal.onOpen();

    const content = modal.contentEl;
    expect(content.querySelector(".rss-dashboard-header")).toBeDefined();

    // Should have general navigation section
    const textContent = content.textContent;
    expect(textContent).toContain("General navigation");
    expect(textContent).toContain("Open help dialog");
    expect(textContent).toContain("Focus dashboard view");
    expect(textContent).toContain("Focus sidebar");
    expect(textContent).toContain("Focus reader view");
    expect(textContent).toContain("Shift + l");
    expect(textContent).toContain("Shift + o / Shift + Enter");

    modal.onClose();
  });

  describe("article navigation shortcuts", () => {
    // The decided meaning (#864, #865, #866), identical in the dashboard and
    // the Reader. The hotkey tests assert the behavior; this pins the help.
    const expected: Array<[string, string]> = [
      ["j", "Open previous article"],
      ["l", "Open next article"],
      ["k", "Close reader pane"],
      [
        "Space / Shift + Space",
        "Select next / previous article without opening",
      ],
    ];

    function renderedRows(): Map<string, string> {
      const modal = new ShortcutHelpModal(
        createMockApp(),
        structuredClone(DEFAULT_SETTINGS),
      );
      modal.onOpen();
      const rows = new Map<string, string>();
      modal.contentEl.querySelectorAll(".rss-shortcut-row").forEach((row) => {
        rows.set(
          row.querySelector("kbd")?.textContent ?? "",
          row.querySelector(".rss-shortcut-desc")?.textContent ?? "",
        );
      });
      modal.onClose();
      return rows;
    }

    it.each(expected)("lists %s as %s", (key, desc) => {
      expect(renderedRows().get(key)).toBe(desc);
    });

    it("no longer calls j the prior article", () => {
      const text = [...renderedRows().values()].join("\n");
      expect(text).not.toMatch(/prior/i);
    });

    it("matches the keyboard shortcuts guide for the same keys", () => {
      const guide = readFileSync("docs/user/keyboard-shortcuts.md", "utf8");
      for (const [key, desc] of expected) {
        const row = guide
          .split("\n")
          .find((line) => line.startsWith(`| ${key} `));
        expect(row, `guide row for ${key}`).toBeDefined();
        expect(row).toContain(desc);
      }
    });

    it("builds the saved vault note from the same rows", () => {
      const articleSection = SHORTCUT_SECTIONS.find(
        (section) => section.section === "Article manipulation",
      );
      expect(articleSection?.items).toEqual(
        expect.arrayContaining(expected.map(([key, desc]) => ({ key, desc }))),
      );
    });
  });

  describe("Esc shortcut", () => {
    // Esc closes dialogs only; no handler clears a selection (#880).
    function escItems() {
      return SHORTCUT_SECTIONS.flatMap((section) => section.items).filter(
        (item) => item.key === "Esc",
      );
    }

    it("lists Esc as closing a dialog and nothing else", () => {
      expect(escItems()).toEqual([{ key: "Esc", desc: "Close dialog" }]);
    });

    it("shows the same Esc row in the rendered dialog", () => {
      const modal = new ShortcutHelpModal(
        createMockApp(),
        structuredClone(DEFAULT_SETTINGS),
      );
      modal.onOpen();
      const row = [
        ...modal.contentEl.querySelectorAll(".rss-shortcut-row"),
      ].find(
        (candidate) => candidate.querySelector("kbd")?.textContent === "Esc",
      );
      expect(row?.querySelector(".rss-shortcut-desc")?.textContent).toBe(
        "Close dialog",
      );
      modal.onClose();
    });

    it("matches the keyboard shortcuts guide", () => {
      const guide = readFileSync("docs/user/keyboard-shortcuts.md", "utf8");
      const row = guide.split("\n").find((line) => line.startsWith("| Esc "));
      expect(row).toMatch(/^\| Esc\s+\| Close dialog\s+\|$/);
    });
  });

  describe("article arrow-key shortcuts", () => {
    // Up and Down step the article selection in every view; Left and Right
    // only act in card view (and jump folders while the sidebar has focus).
    const expected: Array<[string, string]> = [
      ["ArrowUp / ArrowDown", "Move article selection up / down"],
      [
        "ArrowLeft / ArrowRight",
        "Move article selection left / right (card view only)",
      ],
    ];

    function articleItems() {
      const section = SHORTCUT_SECTIONS.find(
        (candidate) => candidate.section === "Article manipulation",
      );
      return section?.items ?? [];
    }

    it("no longer calls the arrow keys card view navigation", () => {
      expect(articleItems().map((item) => item.key)).not.toContain(
        "Arrow keys",
      );
      const text = SHORTCUT_SECTIONS.flatMap((section) => section.items)
        .map((item) => item.desc)
        .join("\n");
      expect(text).not.toMatch(/card view navigation/i);
    });

    it.each(expected)("lists %s as %s", (key, desc) => {
      expect(articleItems()).toContainEqual({ key, desc });
    });

    it("matches the keyboard shortcuts guide", () => {
      const guide = readFileSync("docs/user/keyboard-shortcuts.md", "utf8");
      const articleTable = guide
        .split("## Article Manipulation")[1]
        ?.split("## Sidebar Navigation")[0];
      expect(articleTable).toBeDefined();
      for (const [key, desc] of expected) {
        const row = articleTable
          ?.split("\n")
          .find((line) => line.startsWith(`| ${key} `));
        expect(row, `guide row for ${key}`).toBeDefined();
        expect(row).toContain(desc);
      }
    });
  });

  it("has a compliant clickable-icon for the close button", () => {
    const app = createMockApp();
    const modal = new ShortcutHelpModal(app, structuredClone(DEFAULT_SETTINGS));

    modal.onOpen();

    const closeBtn = modal.contentEl.querySelector(
      ".rss-dashboard-header-close-button.clickable-icon",
    );
    expect(closeBtn).not.toBeNull();
    if (closeBtn) {
      expect(closeBtn.getAttribute("role")).toBe("button");
      expect(closeBtn.getAttribute("tabindex")).toBe("0");
    }

    modal.onClose();
  });

  describe("saving the shortcuts to a vault note", () => {
    function createSettings(defaultFolder: string): RssDashboardSettings {
      const settings = JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS),
      ) as RssDashboardSettings;
      settings.articleSaving.defaultFolder = defaultFolder;
      return settings;
    }

    async function clickSaveLink(modal: ShortcutHelpModal): Promise<void> {
      const link = modal.contentEl.querySelector(
        ".rss-dashboard-save-shortcuts-link",
      ) as HTMLElement;
      link.click();
      await vi.waitFor(() => {
        expect(debugSpy).toHaveBeenCalledWith(
          "[Stub Notice]",
          expect.any(String),
        );
      });
    }

    let debugSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("saves into an existing folder whose name differs only in case", async () => {
      const app = App.createMock();
      await app.vault.createFolder("RSS Articles");
      const modal = new ShortcutHelpModal(app, createSettings("rss articles"));
      modal.onOpen();

      await clickSaveLink(modal);

      expect(
        app.vault.getAbstractFileByPath("RSS Articles/keyboard-shortcuts.md"),
      ).not.toBeNull();
      expect(debugSpy).toHaveBeenCalledWith(
        "[Stub Notice]",
        expect.stringContaining(
          'Keyboard shortcuts saved to "RSS Articles/keyboard-shortcuts.md"',
        ),
      );
      modal.onClose();
    });

    it("creates the save folder when it doesn't exist", async () => {
      const app = App.createMock();
      const modal = new ShortcutHelpModal(app, createSettings("Notes/RSS"));
      modal.onOpen();

      await clickSaveLink(modal);

      expect(
        app.vault.getAbstractFileByPath("Notes/RSS/keyboard-shortcuts.md"),
      ).not.toBeNull();
      modal.onClose();
    });
  });
});
