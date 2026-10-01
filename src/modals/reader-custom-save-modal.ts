import { App, Modal, setIcon, Setting } from "obsidian";
import { VaultFolderSuggest } from "../components/folder-suggest";
import {
  ConfirmTemplateAssignmentModal,
  TemplateNameModal,
} from "../settings/modals/settings-modals";
import type { FeedItem, RssDashboardSettings } from "../types/types";

/** A template written in the dialog but not yet added to the saved list. */
export interface PendingNewTemplate {
  id: string;
  name: string;
  template: string;
  assignToFeed: boolean;
  previousSelectedTemplateId: string;
}

export interface ReaderCustomSaveRequest {
  item: FeedItem;
  displayTitle: string | undefined;
  folder: string;
  template: string | undefined;
  pendingNewTemplate: PendingNewTemplate | null;
  selectedTemplateId: string;
}

export interface ReaderCustomSaveModalOptions {
  settings: Readonly<RssDashboardSettings>;
  item: FeedItem;
  displayTitle: string | undefined;
  /** The feed's own template, used to pre-fill the template box. */
  feedTemplate: string | undefined;
  /** Saves the article; the dialog closes after it resolves. */
  onSave: (request: ReaderCustomSaveRequest) => Promise<void> | void;
}

/** The template box plus the template choice the user has made in it. */
interface TemplateSection {
  templateInput: HTMLTextAreaElement;
  getSelection: () => Pick<
    ReaderCustomSaveRequest,
    "pendingNewTemplate" | "selectedTemplateId"
  >;
}

export class ReaderCustomSaveModal extends Modal {
  private readonly opts: ReaderCustomSaveModalOptions;

  constructor(app: App, opts: ReaderCustomSaveModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-custom-save-modal");

    new Setting(contentEl).setName("Save article").setHeading();

    const folderInput = this.renderFolderField();
    const template = this.renderTemplateSection();
    this.renderButtons(folderInput, template);
  }

  private renderFolderField(): HTMLInputElement {
    const { contentEl } = this;

    contentEl.createEl("label", {
      text: "Save to folder:",
    });

    const folderInputContainer = contentEl.createDiv({
      cls: "rss-dashboard-folder-input-container",
    });

    const folderInput = folderInputContainer.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Enter folder path",
        value: this.opts.settings.articleSaving.defaultFolder || "",
      },
    });

    const clearIcon = folderInputContainer.createDiv({
      cls: "clickable-icon rss-dashboard-clear-icon",
      attr: {
        "aria-label": "Clear input",
        role: "button",
        tabindex: "0",
      },
    });
    setIcon(clearIcon, "x");
    const clearAction = () => {
      folderInput.value = "";
      folderInput.focus();
    };
    clearIcon.addEventListener("click", clearAction);
    clearIcon.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        clearAction();
      }
    });

    new VaultFolderSuggest(this.app, folderInput);
    return folderInput;
  }

  private renderTemplateSection(): TemplateSection {
    const { contentEl } = this;
    const { settings, item, feedTemplate } = this.opts;

    contentEl.createEl("label", {
      text: "Saved template:",
      attr: { for: "rss-dashboard-saved-template" },
    });

    const savedTemplateSelectWrapper = contentEl.createDiv({
      cls: "rss-dashboard-template-select-wrapper",
    });
    const savedTemplateSelect = savedTemplateSelectWrapper.createEl("select", {
      cls: "rss-dashboard-template-select",
      attr: { id: "rss-dashboard-saved-template" },
    });
    savedTemplateSelect.createEl("option", {
      text: "Current template",
      value: "",
    });
    for (const savedTemplate of settings.articleSaving.savedTemplates) {
      savedTemplateSelect.createEl("option", {
        text: savedTemplate.name,
        value: savedTemplate.id,
      });
    }
    const feedTemplateId = settings.feeds.find(
      (feed) => feed.url === item.feedUrl,
    )?.customTemplate;
    const initialSelectedTemplateId =
      settings.articleSaving.savedTemplates.some(
        (template) => template.id === feedTemplateId,
      )
        ? (feedTemplateId ?? "")
        : "";
    savedTemplateSelect.value = initialSelectedTemplateId;

    contentEl.createEl("label", {
      text: "Use template:",
    });
    const templateInput = contentEl.createEl("textarea", {
      attr: {
        placeholder: "Enter template",
        rows: "6",
      },
    });
    // Pre-populate with the feed's custom template if available, otherwise use default
    templateInput.value =
      feedTemplate || settings.articleSaving.defaultTemplate || "";
    let templateBaseline = templateInput.value;
    let selectedTemplateId = initialSelectedTemplateId;
    let pendingNewTemplate: PendingNewTemplate | null = null;

    const discardPendingNewTemplate = () => {
      if (!pendingNewTemplate) return;

      const pendingOption = Array.from(savedTemplateSelect.options).find(
        (option) => option.value === pendingNewTemplate?.id,
      );
      pendingOption?.remove();
      selectedTemplateId = pendingNewTemplate.previousSelectedTemplateId;
      savedTemplateSelect.value = selectedTemplateId;
      pendingNewTemplate = null;
    };

    const saveAsTemplateButton = contentEl.createEl("button", {
      text: "Save as new template",
      cls: "rss-dashboard-custom-save-template-button",
    });
    saveAsTemplateButton.hidden = true;

    const refreshSaveAsTemplateButton = () => {
      if (
        pendingNewTemplate &&
        pendingNewTemplate.template !== templateInput.value
      ) {
        discardPendingNewTemplate();
      }

      saveAsTemplateButton.hidden = templateInput.value === templateBaseline;
      saveAsTemplateButton.textContent = pendingNewTemplate
        ? "New template will be saved"
        : "Save as new template";
    };

    savedTemplateSelect.addEventListener("change", () => {
      discardPendingNewTemplate();
      selectedTemplateId = savedTemplateSelect.value;
      const selectedTemplate = settings.articleSaving.savedTemplates.find(
        (template) => template.id === selectedTemplateId,
      );
      if (selectedTemplate) {
        templateInput.value = selectedTemplate.template;
        templateBaseline = selectedTemplate.template;
      }
      pendingNewTemplate = null;
      refreshSaveAsTemplateButton();
    });

    templateInput.addEventListener("input", refreshSaveAsTemplateButton);

    saveAsTemplateButton.addEventListener("click", () => {
      void (async () => {
        const nameModal = new TemplateNameModal(this.app);
        nameModal.open();
        const name = await nameModal.waitForClose();
        if (!name) return;

        const assignmentModal = new ConfirmTemplateAssignmentModal(this.app);
        assignmentModal.open();
        const assignToFeed = await assignmentModal.waitForClose();
        const id = "template-" + Date.now();
        pendingNewTemplate = {
          id,
          name,
          template: templateInput.value,
          assignToFeed,
          previousSelectedTemplateId: selectedTemplateId,
        };
        savedTemplateSelect.createEl("option", { text: name, value: id });
        savedTemplateSelect.value = id;
        selectedTemplateId = id;
        templateBaseline = templateInput.value;
        refreshSaveAsTemplateButton();
      })();
    });

    return {
      templateInput,
      getSelection: () => ({ pendingNewTemplate, selectedTemplateId }),
    };
  }

  private renderButtons(
    folderInput: HTMLInputElement,
    template: TemplateSection,
  ): void {
    const { item, displayTitle, onSave } = this.opts;

    const buttonContainer = this.contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
      cls: "rss-dashboard-custom-save-cancel-button",
    });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const saveButton = buttonContainer.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button rss-dashboard-custom-save-confirm-button",
    });
    saveButton.addEventListener("click", () => {
      void (async () => {
        await onSave({
          item,
          displayTitle,
          folder: folderInput.value.trim(),
          template: template.templateInput.value.trim() || undefined,
          ...template.getSelection(),
        });

        this.close();
      })();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
