import { App, Modal, Setting } from "obsidian";

export interface OpmlOverwriteConfirmModalOptions {
  /** Backs up the current feeds; the dialog stays open afterwards. */
  onExport: () => void;
  /** Starts the overwrite import; the dialog closes right after. */
  onConfirm: () => void;
}

export class OpmlOverwriteConfirmModal extends Modal {
  private readonly opts: OpmlOverwriteConfirmModalOptions;

  constructor(app: App, opts: OpmlOverwriteConfirmModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { onExport, onConfirm } = this.opts;
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClasses([
      "rss-dashboard-confirm-modal",
      "rss-opml-overwrite-confirm-modal",
    ]);

    new Setting(contentEl).setName("Replace all feeds").setHeading();

    // Warning message
    const warningDiv = contentEl.createDiv({
      cls: "delete-all-warning",
    });
    warningDiv.createEl("p", {
      text: "This action is irreversible. All your existing feeds and folders will be permanently replaced with the imported ones.",
    });

    // Backup recommendation
    const backupDiv = contentEl.createDiv({
      cls: "delete-all-backup-notice",
    });
    backupDiv.createEl("strong", {
      text: "Recommended: export your feeds first",
    });
    backupDiv.createEl("p", {
      text: "Before replacing, we strongly recommend backing up your current feeds by exporting to an OPML file.",
    });

    // Button container
    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    // Export OPML button
    const exportBtn = buttonContainer.createEl("button", {
      text: "Export OPML",
      cls: "rss-dashboard-primary-button export-opml-btn",
    });
    exportBtn.onclick = () => {
      onExport();
    };

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.onclick = () => {
      this.close();
    };

    const confirmButton = buttonContainer.createEl("button", {
      text: "Replace feeds",
      cls: "rss-dashboard-danger-button",
    });
    confirmButton.onclick = () => {
      onConfirm();
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}
