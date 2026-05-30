import { Modal, App, setIcon, Notice } from "obsidian";
import type { RssDashboardSettings } from "../types/types";

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
      text: "Keyboard Shortcuts",
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

    this.renderSection(body, "General Navigation", [
      { key: "?", desc: "Open Help Dialog" },
      { key: "Esc", desc: "Close Dialog / Clear Selection" },
      { key: "r", desc: "Refresh Feed" },
    ]);

    this.renderSection(body, "Dashboard View", [
      { key: "Shift + s", desc: "Focus sidebar" },
      { key: "Shift + r", desc: "Focus reader view" },
      { key: "Shift + 1", desc: "All articles filter" },
      { key: "Shift + 2", desc: "Unread articles filter" },
      { key: "Shift + 3", desc: "Read articles filter" },
      { key: "1", desc: "List view" },
      { key: "2", desc: "Card view" },
      { key: "3", desc: "Feed view" },
    ]);

    this.renderSection(body, "Reader View", [
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
    ]);

    this.renderSection(body, "Article Manipulation", [
      { key: "Arrow keys", desc: "Card view navigation" },
      { key: "o / Enter", desc: "Open article in reader pane" },
      { key: "k", desc: "Close reader pane" },
      { key: "j", desc: "Open prior article in feed" },
      { key: "l", desc: "Open next article in feed" },
      { key: "m", desc: "Mark article read/unread toggle" },
      { key: "Shift + a", desc: "Mark all as read" },
      { key: "f", desc: "Star/Unstar article" },
      { key: "t", desc: "Add tags to article" },
      { key: "s", desc: "Save full content to notes" },
    ]);

    this.renderSection(body, "Sidebar Navigation", [
      { key: "Shift + l", desc: "Next item" },
      { key: "Shift + j", desc: "Previous item" },
      { key: "ArrowUp / ArrowDown", desc: "Move focused item" },
      { key: "ArrowLeft / ArrowRight", desc: "Jump between folders" },
      { key: "Shift + o / Shift + Enter", desc: "Open focused item" },
      { key: "Shift + x", desc: "Open/Collapse folder" },
      { key: "Shift + d", desc: "Delete folder/feed" },
      { key: "Shift + r", desc: "Rename folder/feed" },
    ]);
  }

  private async saveShortcutsToVault(): Promise<void> {
    try {
      // Build the markdown content
      const shortcutsData = [
        {
          section: "General Navigation",
          items: [
            { key: "?", desc: "Open Help Dialog" },
            { key: "Esc", desc: "Close Dialog / Clear Selection" },
            { key: "r", desc: "Refresh Feed" },
          ],
        },
        {
          section: "Dashboard View",
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
          section: "Reader View",
          items: [
            { key: "Shift + d", desc: "Focus dashboard view" },
            { key: "Shift + s", desc: "Focus sidebar" },
            { key: "Shift + r", desc: "Focus reader view" },
            { key: "ArrowUp / ArrowDown", desc: "Scroll article up/down" },
            {
              key: "ArrowLeft / ArrowRight",
              desc: "Scroll article left/right",
            },
            { key: "PageUp / PageDown", desc: "Scroll by one page" },
            { key: "Home / End", desc: "Jump to start/end of article" },
            { key: "= / +", desc: "Increase font size" },
            { key: "- / _", desc: "Decrease font size" },
            { key: "0", desc: "Reset font size" },
          ],
        },
        {
          section: "Article Manipulation",
          items: [
            { key: "Arrow keys", desc: "Card view navigation" },
            { key: "o / Enter", desc: "Open article in reader pane" },
            { key: "k", desc: "Close reader pane" },
            { key: "j", desc: "Open prior article in feed" },
            { key: "l", desc: "Open next article in feed" },
            { key: "m", desc: "Mark article read/unread toggle" },
            { key: "Shift + a", desc: "Mark all as read" },
            { key: "f", desc: "Star/Unstar article" },
            { key: "t", desc: "Add tags to article" },
            { key: "s", desc: "Save full content to notes" },
          ],
        },
        {
          section: "Sidebar Navigation",
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

      let content = "# Keyboard Shortcuts\n\n";
      shortcutsData.forEach((section) => {
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
      const folderPath =
        saveFolder === "/" ? "" : saveFolder.replace(/^\/|\/$/g, "");

      // Ensure folder exists (skip if saving to root)
      if (folderPath) {
        try {
          const folderExists = vault.getAbstractFileByPath(folderPath);
          if (!folderExists) {
            await vault.createFolder(folderPath);
          }
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
        ? `${folderPath}/Keyboard Shortcuts.md`
        : "Keyboard Shortcuts.md";

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
    items: Array<{ key: string; desc: string }>,
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
