import { Modal, App, setIcon } from "obsidian";

export class ShortcutHelpModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");
    this.modalEl.addClass("shortcut-help-modal");

    const header = contentEl.createDiv({ cls: "rss-dashboard-header" });
    header.createDiv({ cls: "rss-dashboard-header-title", text: "Keyboard Shortcuts" });

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
      { key: "Shift + 1", desc: "All articles filter" },
      { key: "Shift + 2", desc: "Unread articles filter" },
      { key: "Shift + 3", desc: "Read articles filter" },
      { key: "1", desc: "List view" },
      { key: "2", desc: "Card view" },
      { key: "3", desc: "Feed view" },
    ]);

    this.renderSection(body, "Reader View", [
      { key: "+", desc: "Increase font size" },
      { key: "-", desc: "Decrease font size" },
      { key: "0", desc: "Reset font size" },
    ]);

    this.renderSection(body, "Article Manipulation", [
      { key: "j / Space", desc: "Next article" },
      { key: "k / Shift + Space", desc: "Previous article" },
      { key: "← → ↑ ↓", desc: "Card view navigation" },
      { key: "o / Enter", desc: "Open/Close article" },
      { key: "m", desc: "Mark as read/unread toggle" },
      { key: "Shift + a", desc: "Mark all as read" },
      { key: "f", desc: "Star/Unstar article" },
      { key: "t", desc: "Add tags to article" },
      { key: "s", desc: "Save full content to notes" },
    ]);

    this.renderSection(body, "Sidebar Navigation", [
      { key: "Shift + j", desc: "Next item" },
      { key: "Shift + k", desc: "Previous item" },
      { key: "Shift + n", desc: "Focus next item" },
      { key: "Shift + p", desc: "Focus previous item" },
      { key: "Shift + o", desc: "Open focused item" },
      { key: "Shift + x", desc: "Open/Collapse folder" },
      { key: "Shift + d", desc: "Delete folder/feed" },
      { key: "Shift + r", desc: "Rename folder/feed" },
    ]);
  }

  private renderSection(container: HTMLElement, title: string, items: Array<{key: string, desc: string}>) {
    const section = container.createDiv({ cls: "rss-shortcut-section" });
    section.createEl("h3", { text: title });

    const grid = section.createDiv({ cls: "rss-shortcut-grid" });
    items.forEach(item => {
      const row = grid.createDiv({ cls: "rss-shortcut-row" });
      row.createDiv({ cls: "rss-shortcut-desc", text: item.desc });
      const keyContainer = row.createDiv({ cls: "rss-shortcut-key-container" });
      keyContainer.createEl("kbd", { text: item.key });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
