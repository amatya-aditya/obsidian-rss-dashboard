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
        (section) => section.section === "Dashboard view",
      );
      expect(articleSection?.items).toEqual(
        expect.arrayContaining(expected.map(([key, desc]) => ({ key, desc }))),
      );
    });
  });

  describe("grouping by where the keys work (#1469)", () => {
    const headings: Record<string, string> = {
      "General navigation": "## General Navigation",
      "Dashboard view": "## Dashboard View",
      "Reader view": "## Reader View",
      "Article manipulation": "## Article Manipulation",
      "Sidebar navigation": "## Sidebar Navigation",
    };

    function guideRows(heading: string): Array<[string, string]> {
      const guide = readFileSync("docs/user/keyboard-shortcuts.md", "utf8");
      const body = guide.split(heading + "\n")[1]?.split("\n## ")[0] ?? "";
      return body
        .split("\n")
        .filter((line) => line.startsWith("|"))
        .slice(2)
        .map((line) => {
          const [key, desc] = line
            .slice(1, -1)
            .split(" | ")
            .map((cell) => cell.replace(/\\_/g, "_").trim());
          return [key, desc];
        });
    }

    it("keeps General navigation to ? and Esc", () => {
      const section = SHORTCUT_SECTIONS.find(
        (candidate) => candidate.section === "General navigation",
      );
      expect(section?.items.map((item) => item.key)).toEqual(["?", "Esc"]);
    });

    it("lists r under Dashboard view", () => {
      const section = SHORTCUT_SECTIONS.find(
        (candidate) => candidate.section === "Dashboard view",
      );
      expect(section?.items).toContainEqual({
        key: "r",
        desc: "Refresh feed",
      });
    });

    it("keeps the dashboard-only keys out of Article manipulation", () => {
      const section = SHORTCUT_SECTIONS.find(
        (candidate) => candidate.section === "Article manipulation",
      );
      const keys = section?.items.map((item) => item.key) ?? [];
      expect(keys).toEqual([
        "k",
        "j",
        "l",
        "m",
        ",",
        "Shift + a",
        "f",
        "Shift + f",
        "t",
        "s",
      ]);
    });

    it.each(Object.entries(headings))(
      "gives the guide the same rows as the dialog in %s",
      (name, heading) => {
        const section = SHORTCUT_SECTIONS.find(
          (candidate) => candidate.section === name,
        );
        const dialog = (section?.items ?? []).map(
          (item) => [item.key, item.desc] as [string, string],
        );
        const guide = guideRows(heading).map(
          ([key, desc]) => [key, desc.toLowerCase()] as [string, string],
        );
        expect(guide.map(([key]) => key)).toEqual(dialog.map(([key]) => key));
        expect(guide).toEqual(
          dialog.map(([key, desc]) => [key, desc.toLowerCase()]),
        );
      },
    );
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
        (candidate) => candidate.section === "Dashboard view",
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
        .split("## Dashboard View")[1]
        ?.split("## Reader View")[0];
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

  describe("YouTube focus mode shortcut", () => {
    it("lists Shift+F as toggling YouTube focus mode in the modal and the guide", () => {
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

      expect(rows.get("Shift + f")).toBe("Toggle YouTube focus mode");

      const guide = readFileSync("docs/user/keyboard-shortcuts.md", "utf8");
      const row = guide
        .split("\n")
        .find((line) => line.startsWith("| Shift + f "));
      expect(row).toBeDefined();
      expect(row).toContain("Toggle YouTube focus mode");
    });
  });

  describe("cover image shortcut (#1466)", () => {
    it("lists Shift + C as fetching or restoring the cover in the modal and the guide", () => {
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

      expect(rows.get("Shift + C")).toBe("Fetch or restore cover image");

      const guide = readFileSync("docs/user/keyboard-shortcuts.md", "utf8");
      const row = guide
        .split("\n")
        .find((line) => line.startsWith("| Shift + C "));
      expect(row).toBeDefined();
      expect(row).toContain("Fetch or restore cover image");
    });
  });

  describe("save shortcut (#1184)", () => {
    it("lists s as Save to notes in the modal and the guide, claiming no version", () => {
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

      // A static row cannot know an article's resolved save version, so it
      // makes no version claim; the per-article surfaces name it instead.
      expect(rows.get("s")).toBe("Save to notes");

      const guide = readFileSync("docs/user/keyboard-shortcuts.md", "utf8");
      const row = guide.split("\n").find((line) => line.startsWith("| s "));
      expect(row, "guide row for s").toBeDefined();
      expect(row).toContain("Save to notes");
      expect(row).not.toContain("full content");
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

  it("removes Obsidian's native close button so only the header one remains", () => {
    // On the mobile sheet the shared close-button rule re-showed the native
    // button beside the header one (#1013), so the modal removes it outright
    // like the feed modals do (#1014).
    const app = createMockApp();
    const modal = new ShortcutHelpModal(app, structuredClone(DEFAULT_SETTINGS));

    modal.onOpen();

    expect(modal.modalEl.querySelector(".modal-header-button")).toBeNull();
    expect(modal.modalEl.querySelector(".modal-close-button")).toBeNull();
    expect(
      modal.contentEl.querySelector(
        ".rss-dashboard-header-close-button.clickable-icon",
      ),
    ).not.toBeNull();

    modal.onClose();
  });

  it("closes from the header close button", () => {
    const app = createMockApp();
    const modal = new ShortcutHelpModal(app, structuredClone(DEFAULT_SETTINGS));
    const close = vi.spyOn(modal, "close").mockImplementation(() => {});
    modal.onOpen();

    const closeBtn = modal.contentEl.querySelector<HTMLElement>(
      ".rss-dashboard-header-close-button.clickable-icon",
    );
    closeBtn?.click();

    expect(close).toHaveBeenCalledTimes(1);

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

    it("writes the YouTube focus mode row into the saved note", async () => {
      const app = App.createMock();
      const modal = new ShortcutHelpModal(app, createSettings(""));
      modal.onOpen();

      await clickSaveLink(modal);

      const file = app.vault.getAbstractFileByPath("keyboard-shortcuts.md");
      expect(file).not.toBeNull();
      const content = await app.vault.read(file as never);
      expect(content).toContain("| Shift + f | Toggle YouTube focus mode |");
      modal.onClose();
    });
  });
});
