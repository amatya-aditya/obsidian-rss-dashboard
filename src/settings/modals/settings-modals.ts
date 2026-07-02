/**
 * Shared modal classes used by the RSS Dashboard settings tabs.
 *
 * Extracted from settings-tab.ts to break the monolith.
 * Imports are kept minimal — only Obsidian core + platform utils.
 */
import { App, Modal, Setting, TextComponent } from "obsidian";
import {
  setCssProps,
  shouldUseMobileSidebarLayout,
} from "../../utils/platform-utils";

// ── TemplateNameModal ───────────────────────────────────────────────────────

export class TemplateNameModal extends Modal {
  private result: string | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Save template" });
    contentEl.createEl("p", { text: "Enter a name for this template:" });

    let inputComponent: TextComponent;
    new Setting(contentEl).setName("Template name").addText((text) => {
      inputComponent = text;
      text.setPlaceholder("My template");
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.result = text.getValue().trim() || null;
          this.close();
        }
      });
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.result = null;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.result = inputComponent.getValue().trim() || null;
            this.close();
          }),
      );

    window.setTimeout(() => {
      inputComponent.inputEl.focus();
    }, 50);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(this.result);
    }
  }

  waitForClose(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

// ── HighlightWordEditModal ──────────────────────────────────────────────────

export class HighlightWordEditModal extends Modal {
  private value: string;
  private result: string | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  constructor(app: App, initialValue: string) {
    super(app);
    this.value = initialValue;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Edit highlight word" });

    let inputComponent: TextComponent;
    new Setting(contentEl).setName("Word or phrase").addText((text) => {
      inputComponent = text;
      text.setValue(this.value);
      text.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.result = text.getValue();
          this.close();
        }
      });
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.result = null;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.result = inputComponent.getValue();
            this.close();
          }),
      );

    window.setTimeout(() => {
      inputComponent.inputEl.focus();
      inputComponent.inputEl.select();
    }, 50);
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(this.result);
    }
  }

  waitForClose(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

// ── ConfirmDeleteModal ──────────────────────────────────────────────────────

export class ConfirmDeleteModal extends Modal {
  private targetLabel: string;
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(app: App, targetLabel: string) {
    super(app);
    this.targetLabel = targetLabel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Delete highlight word?" });
    contentEl.createEl("p", {
      text: `Are you sure you want to delete "${this.targetLabel}"?`,
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.confirmed = false;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Delete")
          .setWarning()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(this.confirmed);
    }
  }

  waitForClose(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

// ── FactoryResetConfirmModal ────────────────────────────────────────────────

export class FactoryResetConfirmModal extends Modal {
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    contentEl.createEl("h2", { text: "Factory reset?" });
    contentEl.createEl("p", {
      text: "This restores all plugin settings to their default values and clears your feeds, folders, tags, and plugin-managed local state.",
    });
    contentEl.createEl("p", {
      text: "Existing backup files and saved article markdown files in your vault will not be deleted.",
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting
      .addButton((btn) =>
        btn
          .setButtonText("Cancel")
          .setClass("rss-confirm-modal-cancel")
          .onClick(() => {
            this.confirmed = false;
            this.close();
          }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Factory reset")
          .setWarning()
          .setClass("rss-dashboard-danger-button")
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.resolvePromise?.(this.confirmed);
  }

  waitForClose(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

// ── ApplyMaxItemsToExistingFeedsModal ───────────────────────────────────────

export type ApplyMaxItemsAction = "cancel" | "apply" | "apply-refresh";

export class ApplyMaxItemsToExistingFeedsModal extends Modal {
  private readonly newLimit: number;
  private readonly increased: boolean;
  private action: ApplyMaxItemsAction = "cancel";
  private resolvePromise: ((value: ApplyMaxItemsAction) => void) | null = null;

  constructor(app: App, options: { newLimit: number; increased: boolean }) {
    super(app);
    this.newLimit = options.newLimit;
    this.increased = options.increased;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const isMobile = shouldUseMobileSidebarLayout();
    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");
    if (isMobile) {
      this.modalEl.addClass("rss-mobile-apply-max-items-modal");
    }

    contentEl.createEl("h2", { text: "Apply max item limit to all feeds?" });
    contentEl.createEl("p", {
      text: `You changed the default max item limit to ${this.newLimit}. Do you want to apply this to ALL existing feeds? This will overwrite any custom per-feed max item settings.`,
    });
    if (this.increased) {
      contentEl.createEl("p", {
        text: "After applying a higher limit, you must refresh all feeds to fetch additional items.",
      });
    }

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-max-items-apply-buttons");
    if (isMobile) {
      setCssProps(buttonsSetting.controlEl, {
        "flex-direction": "column",
        "align-items": "stretch",
        gap: "8px",
      });
    }
    buttonsSetting
      .addButton((btn) => {
        btn.setButtonText("Cancel");
        if (isMobile) setCssProps(btn.buttonEl, { width: "100%" });
        btn.onClick(() => {
          this.action = "cancel";
          this.close();
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Apply to all feeds").setWarning();
        if (isMobile) setCssProps(btn.buttonEl, { width: "100%" });
        btn.onClick(() => {
          this.action = "apply";
          this.close();
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Apply & refresh all").setWarning();
        if (isMobile) setCssProps(btn.buttonEl, { width: "100%" });
        btn.onClick(() => {
          this.action = "apply-refresh";
          this.close();
        });
      });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.resolvePromise?.(this.action);
  }

  waitForClose(): Promise<ApplyMaxItemsAction> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}
