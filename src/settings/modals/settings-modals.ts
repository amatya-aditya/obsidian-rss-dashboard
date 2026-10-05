/**
 * Shared modal classes used by the RSS Dashboard settings tabs.
 *
 * Extracted from settings-tab.ts to break the monolith.
 * Imports are kept minimal — only Obsidian core + platform utils.
 */
import { App, Modal, Notice, Setting, TextComponent } from "obsidian";
import type { SavedTemplate } from "../../types/types";
import {
  setCssProps,
  shouldUseMobileSidebarLayout,
} from "../../utils/platform-utils";
import { settingsUiCompatibility } from "../settings-ui-compat";

// ── TemplateNameModal ───────────────────────────────────────────────────────

export class TemplateNameModal extends Modal {
  private result: string | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    this.containerEl.addClass("rss-dashboard-template-dialog-container");
    this.modalEl.addClass("rss-dashboard-template-dialog");
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

export class ConfirmTemplateAssignmentModal extends Modal {
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(app: App) {
    super(app);
  }

  onOpen() {
    this.containerEl.addClass("rss-dashboard-template-dialog-container");
    this.modalEl.addClass("rss-dashboard-template-dialog");
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl("h2", { text: "Use template for this feed?" });
    contentEl.createEl("p", {
      text: "Use this new template for all future saves from this feed?",
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("No, keep unassigned").onClick(() => {
          this.confirmed = false;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Yes, use for this feed")
          .setCta()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose() {
    this.contentEl.empty();
    this.resolvePromise?.(this.confirmed);
  }

  waitForClose(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

export interface SavedTemplateEditorResult {
  name: string;
  template: string;
  defaultFolder: string;
  filenamePattern: string;
  makeGlobalDefault: boolean;
}

export class SavedTemplateEditorModal extends Modal {
  private result: SavedTemplateEditorResult | null = null;
  private resolvePromise:
    ((value: SavedTemplateEditorResult | null) => void) | null = null;
  private readonly initial: SavedTemplateEditorResult;
  private readonly existingTemplates: readonly SavedTemplate[];
  private readonly editingId: string | undefined;

  constructor(
    app: App,
    initial: SavedTemplateEditorResult,
    existingTemplates: readonly SavedTemplate[],
    editingId?: string,
  ) {
    super(app);
    this.initial = initial;
    this.existingTemplates = existingTemplates;
    this.editingId = editingId;
  }

  onOpen() {
    this.containerEl.addClass("rss-dashboard-template-dialog-container");
    this.modalEl.addClass("rss-dashboard-template-dialog");
    const { contentEl } = this;
    contentEl.empty();
    new Setting(contentEl)
      .setName(this.editingId ? "Edit saved template" : "Create saved template")
      .setHeading();

    let nameInput: HTMLInputElement;
    let bodyInput: HTMLTextAreaElement;
    let folderInput: HTMLInputElement;
    let filenameInput: HTMLInputElement;
    let defaultCheckbox: HTMLInputElement;

    const createTextField = (
      name: string,
      id: string,
      value: string,
      multiline = false,
    ): HTMLInputElement | HTMLTextAreaElement => {
      contentEl.createEl("label", { text: name, attr: { for: id } });
      const input = multiline
        ? contentEl.createEl("textarea", { attr: { id, rows: "8" } })
        : contentEl.createEl("input", {
            attr: { id, type: "text" },
          });
      input.value = value;
      return input;
    };

    nameInput = createTextField(
      "Template name",
      "rss-saved-template-name",
      this.initial.name,
    ) as HTMLInputElement;
    bodyInput = createTextField(
      "Template body",
      "rss-saved-template-body",
      this.initial.template,
      true,
    ) as HTMLTextAreaElement;
    folderInput = createTextField(
      "Custom folder",
      "rss-saved-template-folder",
      this.initial.defaultFolder,
    ) as HTMLInputElement;
    filenameInput = createTextField(
      "Filename pattern",
      "rss-saved-template-filename",
      this.initial.filenamePattern,
    ) as HTMLInputElement;
    filenameInput.setAttribute(
      "aria-describedby",
      "rss-saved-template-filename-help",
    );
    contentEl.createEl("p", {
      cls: "setting-item-description",
      attr: { id: "rss-saved-template-filename-help" },
      text: "Leave blank to use the article title. The .md extension is added automatically.",
    });

    const defaultLabel = contentEl.createEl("label", {
      attr: { for: "rss-saved-template-global-default" },
      text: "Make global default",
    });
    defaultCheckbox = contentEl.createEl("input", {
      attr: { id: "rss-saved-template-global-default", type: "checkbox" },
    });
    defaultCheckbox.checked = this.initial.makeGlobalDefault;
    defaultLabel.insertAdjacentElement("afterbegin", defaultCheckbox);
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "A feed-assigned template takes precedence over the global default. The standalone template is used when no saved default is selected.",
    });

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            const name = nameInput.value.trim();
            const duplicate = this.existingTemplates.some(
              (template) =>
                template.id !== this.editingId &&
                template.name.trim().toLocaleLowerCase() ===
                  name.toLocaleLowerCase(),
            );
            if (!name || duplicate) {
              new Notice(
                duplicate
                  ? "Template names must be unique."
                  : "Enter a template name.",
              );
              nameInput.focus();
              return;
            }
            this.result = {
              name,
              template: bodyInput.value,
              defaultFolder: folderInput.value.trim(),
              filenamePattern: filenameInput.value.trim(),
              makeGlobalDefault: defaultCheckbox.checked,
            };
            this.close();
          }),
      );

    window.setTimeout(() => nameInput.focus(), 50);
  }

  onClose() {
    this.contentEl.empty();
    this.resolvePromise?.(this.result);
  }

  waitForClose(): Promise<SavedTemplateEditorResult | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }
}

export class ConfirmTemplateReplacementModal extends Modal {
  private confirmed = false;
  private resolvePromise: ((value: boolean) => void) | null = null;

  constructor(
    app: App,
    feedName: string,
    currentTemplateName: string,
    nextTemplateName: string,
  ) {
    super(app);
    this.feedName = feedName;
    this.currentTemplateName = currentTemplateName;
    this.nextTemplateName = nextTemplateName;
  }

  private readonly feedName: string;
  private readonly currentTemplateName: string;
  private readonly nextTemplateName: string;

  onOpen() {
    this.containerEl.addClass("rss-dashboard-template-dialog-container");
    this.modalEl.addClass("rss-dashboard-template-dialog");
    const { contentEl } = this;
    contentEl.empty();
    new Setting(contentEl).setName("Replace feed template?").setHeading();
    contentEl.createEl("p", {
      text: `Replace "${this.currentTemplateName}" with "${this.nextTemplateName}" for ${this.feedName}?`,
    });
    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Keep current template")
          .onClick(() => this.close()),
      )
      .addButton((button) =>
        button
          .setButtonText("Replace template")
          .setCta()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose() {
    this.contentEl.empty();
    this.resolvePromise?.(this.confirmed);
  }

  waitForClose(): Promise<boolean> {
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
      .addButton((btn) => {
        btn.setButtonText("Delete");
        settingsUiCompatibility.markDestructive(btn);
        btn.onClick(() => {
          this.confirmed = true;
          this.close();
        });
      });
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
      .addButton((btn) => {
        btn
          .setButtonText("Factory reset")
          .setClass("rss-dashboard-danger-button");
        settingsUiCompatibility.markDestructive(btn);
        btn.onClick(() => {
          this.confirmed = true;
          this.close();
        });
      });
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

export type RetentionChangeAction =
  "apply-now" | "apply-on-next-refresh" | "cancel";

export class RetentionChangeConfirmModal extends Modal {
  private action: RetentionChangeAction = "cancel";
  private resolvePromise: ((value: RetentionChangeAction) => void) | null =
    null;
  private settled = false;

  constructor(app: App) {
    super(app);
  }

  waitForClose(): Promise<RetentionChangeAction> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  private settle(action: RetentionChangeAction): void {
    if (this.settled) return;
    this.settled = true;
    this.action = action;
    this.resolvePromise?.(this.action);
    this.resolvePromise = null;
    this.close();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-modal");
    this.modalEl.addClass("rss-dashboard-modal-container");

    contentEl.createEl("h2", { text: "Apply retention change?" });
    contentEl.createEl("p", {
      text: "Newly unprotected articles and articles older than your retention limit may be permanently removed.",
    });

    const buttonsSetting = new Setting(contentEl);
    buttonsSetting.controlEl.addClass("rss-dashboard-modal-buttons");
    buttonsSetting
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => {
          this.settle("cancel");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Apply on next refresh").onClick(() => {
          this.settle("apply-on-next-refresh");
        }),
      )
      .addButton((button) => {
        button.setButtonText("Apply now");
        settingsUiCompatibility.markDestructive(button);
        button.onClick(() => {
          this.settle("apply-now");
        });
      });
  }

  onClose(): void {
    if (!this.settled) {
      this.settled = true;
      this.resolvePromise?.("cancel");
      this.resolvePromise = null;
    }
    this.contentEl.empty();
  }
}

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
        btn.setButtonText("Apply to all feeds");
        settingsUiCompatibility.markDestructive(btn);
        if (isMobile) setCssProps(btn.buttonEl, { width: "100%" });
        btn.onClick(() => {
          this.action = "apply";
          this.close();
        });
      })
      .addButton((btn) => {
        btn.setButtonText("Apply & refresh all");
        settingsUiCompatibility.markDestructive(btn);
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
