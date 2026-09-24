import { App, Modal } from "obsidian";

/**
 * Refresh details shown as a modal on mobile, where an anchored popover
 * beside the full-width sidebar has no room to be read.
 */
export class RefreshDetailsModal extends Modal {
  private readonly lines: string[];

  constructor(app: App, lines: string[]) {
    super(app);
    this.lines = lines;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-refresh-details-modal");

    this.setTitle("Refresh details");
    for (const line of this.lines) {
      contentEl.createDiv({
        cls: "rss-dashboard-refresh-details-line",
        text: line,
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
