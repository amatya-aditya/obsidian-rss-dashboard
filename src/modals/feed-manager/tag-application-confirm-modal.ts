import { App, Modal, Setting } from "obsidian";

export type TagApplicationChoice = "apply_existing" | "future_only" | "cancel_save";

/**
 * Tri-state modal shown when the user changes a feed's auto-tag selection
 * during an edit. Resolves via `waitForClose()` with one of three outcomes:
 *
 * - `apply_existing`: retroactively apply/remove tags on current feed items
 * - `future_only`:    persist new tag selection but leave existing items alone
 * - `cancel_save`:    abort saving, revert selection
 */
export class TagApplicationConfirmModal extends Modal {
  private _resolve: ((choice: TagApplicationChoice) => void) | null = null;
  private _settled = false;

  constructor(app: App) {
    super(app);
  }

  /**
   * Returns a promise that resolves with the user's choice once the modal is
   * closed. Always resolves — never rejects.
   */
  waitForClose(): Promise<TagApplicationChoice> {
    return new Promise<TagApplicationChoice>((resolve) => {
      this._resolve = resolve;
    });
  }

  private settle(choice: TagApplicationChoice): void {
    if (this._settled) return;
    this._settled = true;
    this._resolve?.(choice);
    this._resolve = null;
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    contentEl.createEl("h2", { text: "Update feed tags" });

    contentEl.createEl("p", {
      text: "How would you like to apply these tag changes?",
    });

    contentEl.createEl("p", {
      text: "This will remove the selected tag names from all existing articles in this feed, including tags added manually or by other auto-tag rules.",
      cls: "rss-tag-application-warning",
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting.controlEl.addClass("rss-tag-application-buttons");
    buttonsSetting
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.settle("cancel_save");
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Future only").onClick(() => {
          this.settle("future_only");
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Apply to existing")
          .setCta()
          .onClick(() => {
            this.settle("apply_existing");
          }),
      );
  }

  onClose(): void {
    // Ensure the promise resolves even if the user closes via Escape/backdrop.
    if (!this._settled) {
      this._settled = true;
      this._resolve?.("cancel_save");
      this._resolve = null;
    }
    this.contentEl.empty();
  }
}
