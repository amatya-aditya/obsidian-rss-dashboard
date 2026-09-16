import { App, Modal, Setting } from "obsidian";

const FULL_CHANGELOG_URL =
  "https://github.com/amatya-aditya/obsidian-rss-dashboard/blob/master/CHANGELOG.md";

/**
 * Shown once per plugin update, summarizing the current version's Features.
 * Reopenable afterward from the About settings tab's "What's new" link.
 */
export class WhatsNewModal extends Modal {
  private version: string;
  private features: string[];

  constructor(app: App, version: string, features: string[]) {
    super(app);
    this.version = version;
    this.features = features;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    new Setting(contentEl)
      .setName(`What's new in v${this.version}`)
      .setHeading();

    const list = contentEl.createEl("ul", {
      cls: "rss-dashboard-whats-new-list",
    });
    for (const feature of this.features) {
      list.createEl("li", { text: feature });
    }

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const changelogLink = buttonContainer.createEl("a", {
      text: "Read full changelog",
      href: FULL_CHANGELOG_URL,
    });
    changelogLink.target = "_blank";
    changelogLink.rel = "noopener noreferrer";

    const closeButton = buttonContainer.createEl("button", {
      text: "Got it",
      cls: "mod-cta",
    });
    closeButton.onclick = () => {
      this.close();
    };
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
