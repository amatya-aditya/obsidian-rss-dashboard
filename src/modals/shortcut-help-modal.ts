import { Modal, App, setIcon, Notice } from "obsidian";
import type { RssDashboardSettings } from "../types/types";
import { ensureVaultFolder } from "../utils/vault-files";

interface ShortcutItem {
  key: string;
  desc: string;
}

export interface ShortcutSection {
  section: string;
  items: ShortcutItem[];
}

/**
 * The shortcut list shown in the help dialog and written to the vault note.
 * Keep it in step with `src/hotkeys/dashboard-hotkeys.ts`,
 * `src/hotkeys/reader-hotkeys.ts`, and `docs/user/keyboard-shortcuts.md`.
 */
export const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    section: "General navigation",
    items: [
      { key: "?", desc: "Open help dialog" },
      { key: "Esc", desc: "Close dialog" },
      { key: "r", desc: "Refresh feed" },
    ],
  },
  {
    section: "Dashboard view",
    items: [
      { key: "Shift + s", desc: "Focus sidebar" },
      { key: "Shift + r", desc: "Focus reader view" },
      { key: "Shift + 1", desc: "All articles filter" },
      { key: "Shift + 2", desc: "Unread articles filter" },
      { key: "Shift + 3", desc: "Read articles filter" },
      { key: "1", desc: "List view" },
      { key: "2", desc: "Card view" },
      { key: "3", desc: "Feed view" },
    ],
  },
  {
    section: "Reader view",
    items: [
      { key: "Shift + d", desc: "Focus dashboard view" },
      { key: "Shift + s", desc: "Focus sidebar" },
      { key: "Shift + r", desc: "Focus reader view" },
      { key: "ArrowUp / ArrowDown", desc: "Scroll article up/down" },
      { key: "ArrowLeft / ArrowRight", desc: "Scroll article left/right" },
      { key: "PageUp / PageDown", desc: "Scroll by one page" },
      { key: "Home / End", desc: "Jump to start/end of article" },
      { key: "= / +", desc: "Increase font size" },
      { key: "- / _", desc: "Decrease font size" },
      { key: "0", desc: "Reset font size" },
    ],
  },
  {
    section: "Article manipulation",
    items: [
      { key: "ArrowUp / ArrowDown", desc: "Move article selection up / down" },
      {
        key: "ArrowLeft / ArrowRight",
        desc: "Move article selection left / right (card view only)",
      },
      { key: "o / Enter", desc: "Open article in reader pane" },
      { key: "k", desc: "Close reader pane" },
      { key: "j", desc: "Open previous article" },
      { key: "l", desc: "Open next article" },
      {
        key: "Space / Shift + Space",
        desc: "Select next / previous article without opening",
      },
      { key: "m", desc: "Mark article read/unread toggle" },
      { key: ",", desc: "Mark article read and open next" },
      { key: "Shift + a", desc: "Mark all as read" },
      { key: "f", desc: "Star/Unstar article" },
      { key: "t", desc: "Add tags to article" },
      { key: "s", desc: "Save full content to notes" },
    ],
  },
  {
    section: "Sidebar navigation",
    items: [
      { key: "Shift + l", desc: "Next item" },
      { key: "Shift + j", desc: "Previous item" },
      { key: "ArrowUp / ArrowDown", desc: "Move focused item" },
      { key: "ArrowLeft / ArrowRight", desc: "Jump between folders" },
      { key: "Shift + o / Shift + Enter", desc: "Open focused item" },
      { key: "Shift + x", desc: "Open/Collapse folder" },
      { key: "Shift + d", desc: "Delete folder/feed" },
      { key: "Shift + r", desc: "Rename folder/feed" },
    ],
  },
];

export class ShortcutHelpModal extends Modal {
  private settings: RssDashboardSettings;

  constructor(app: App, settings: RssDashboardSettings) {
    super(app);
    this.settings = settings;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");
    this.modalEl.addClass("rss-shortcut-help-modal");

    const header = contentEl.createDiv({ cls: "rss-dashboard-header" });
    header.createDiv({
      cls: "rss-dashboard-header-title",
      text: "Keyboard shortcuts",
    });

    // Add save link below title
    const saveLink = header.createEl("a", {
      cls: "rss-dashboard-save-shortcuts-link",
      text: "Save keyboard shortcuts to a vault note",
      href: "#",
    });
    saveLink.addEventListener("click", (e: Event) => {
      e.preventDefault();
      void this.saveShortcutsToVault();
    });

    const closeBtn = header.createDiv({
      cls: "rss-dashboard-header-close-button clickable-icon",
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Close",
      },
    });
    setIcon(closeBtn, "x");
    const handleClose = (e: Event) => {
      e.preventDefault();
      this.close();
    };
    closeBtn.addEventListener("click", handleClose);
    closeBtn.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        handleClose(e);
      }
    });

    const body = contentEl.createDiv({ cls: "rss-dashboard-modal-content" });

    for (const { section, items } of SHORTCUT_SECTIONS) {
      this.renderSection(body, section, items);
    }
  }

  private async saveShortcutsToVault(): Promise<void> {
    try {
      // Build the markdown content
      let content = "# Keyboard shortcuts\n\n";
      SHORTCUT_SECTIONS.forEach((section) => {
        content += `## ${section.section}\n\n`;
        content += "| Shortcut | Action |\n";
        content += "|----------|--------|\n";
        section.items.forEach((item) => {
          content += `| ${item.key} | ${item.desc} |\n`;
        });
        content += "\n";
      });

      // Determine the save folder - default to vault root if not configured
      let saveFolder = this.settings.articleSaving.defaultFolder;
      if (!saveFolder || saveFolder.trim() === "") {
        saveFolder = "/";
      }

      // Normalize the path
      const vault = this.app.vault;
      let folderPath =
        saveFolder === "/" ? "" : saveFolder.replace(/^\/|\/$/g, "");

      // Ensure folder exists (skip if saving to root). The folder on disk may
      // differ in case from the setting, so use the path it resolves to.
      if (folderPath) {
        try {
          folderPath = await ensureVaultFolder(this.app, folderPath);
        } catch (folderError) {
          console.error(
            "[RSS Dashboard] Failed to create folder:",
            folderPath,
            folderError,
          );
          throw new Error(`Could not create folder: ${folderPath}`);
        }
      }

      // Create or overwrite the file
      const filePath = folderPath
        ? `${folderPath}/keyboard-shortcuts.md`
        : "keyboard-shortcuts.md";

      // Check if file exists and delete it first
      try {
        const existingFile = vault.getAbstractFileByPath(filePath);
        if (existingFile) {
          await this.app.fileManager.trashFile(existingFile);
        }
      } catch (deleteError) {
        console.warn(
          "[RSS Dashboard] Could not delete existing file:",
          filePath,
          deleteError,
        );
        // Continue anyway - vault.create might overwrite
      }

      // Create the file
      const file = await vault.create(filePath, content);

      new Notice(`Keyboard shortcuts saved to "${file.path}"`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        "[RSS Dashboard] Failed to save keyboard shortcuts:",
        errorMsg,
      );
      new Notice(`Failed to save shortcuts: ${errorMsg}`);
    }
  }

  private renderSection(
    container: HTMLElement,
    title: string,
    items: ShortcutItem[],
  ) {
    const section = container.createDiv({ cls: "rss-shortcut-section" });
    section.createEl("h3", { text: title });

    const grid = section.createDiv({ cls: "rss-shortcut-grid" });
    items.forEach((item) => {
      const row = grid.createDiv({ cls: "rss-shortcut-row" });
      row.createDiv({ cls: "rss-shortcut-desc", text: item.desc });
      const keyContainer = row.createDiv({
        cls: "rss-shortcut-key-container",
      });
      keyContainer.createEl("kbd", { text: item.key });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
