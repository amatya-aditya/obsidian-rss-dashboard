import { Modal, App, Setting } from "obsidian";

/**
 * A simple confirmation modal shown after a successful data import.
 */
export class ImportSuccessModal extends Modal {
  private message: string;

  constructor(app: App, message: string) {
    super(app);
    this.message = message;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    new Setting(contentEl).setName("Import successful").setHeading();

    contentEl.createEl("p", {
      text: this.message,
      cls: "rss-dashboard-modal-message",
    });

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const okButton = buttonContainer.createEl("button", {
      text: "OK",
      cls: "rss-dashboard-primary-button",
    });
    okButton.onclick = () => this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
