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

    new Setting(contentEl).setName("Update feed tags").setHeading();

    contentEl
      .createDiv({ cls: "tag-application-confirm-description" })
      .setText("How would you like to apply these tag changes?");

    const warning = contentEl.createDiv({
      cls: "tag-application-confirm-warning",
    });
    warning.setText(
      "This will remove the selected tag names from all existing articles in this feed, including tags added manually or by other auto-tag rules.",
    );

    const btns = contentEl.createDiv({ cls: "tag-application-confirm-buttons" });

    const applyBtn = btns.createEl("button", {
      text: "Apply to existing",
      cls: "mod-cta",
    });
    applyBtn.addEventListener("click", () => {
      this.settle("apply_existing");
    });

    const futureBtn = btns.createEl("button", {
      text: "Future only",
    });
    futureBtn.addEventListener("click", () => {
      this.settle("future_only");
    });

    const cancelBtn = btns.createEl("button", {
      text: "Cancel",
      cls: "mod-warning",
    });
    cancelBtn.addEventListener("click", () => {
      this.settle("cancel_save");
    });
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
