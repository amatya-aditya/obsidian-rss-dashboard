import { App, Modal, Setting, setIcon } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
} from "../types/types";
import { ArticleSaver } from "../services/article-saver";
import { VaultFolderSuggest } from "../components/folder-suggest";
import {
  ConfirmTemplateAssignmentModal,
  TemplateNameModal,
} from "../settings/modals/settings-modals";

interface PendingTemplate {
  id: string;
  name: string;
  template: string;
  defaultFolder: string;
  assignToFeed: boolean;
  previousSelectedTemplateId: string;
}

export interface ReaderCustomSaveModalContext {
  getSettings: () => RssDashboardSettings;
  getArticleSaver: () => ArticleSaver;
  displayTitle: string | undefined;
  getCustomTemplateForArticle: (item: FeedItem) => string | undefined;
  buildReaderSaveMarkdown: (item: FeedItem) => string;
  onArticleSave: (item: FeedItem) => void;
  updateSavedLabel: (saved: boolean) => void;
}

interface TemplateControls {
  select: HTMLSelectElement;
  input: HTMLTextAreaElement;
  saveAsButton: HTMLButtonElement;
  saveAsLabel: HTMLSpanElement;
}

function createFolderControls(
  app: App,
  content: HTMLElement,
  context: ReaderCustomSaveModalContext,
): HTMLInputElement {
  content.createEl("label", {
    text: "Save to folder:",
    attr: { for: "rss-dashboard-save-folder" },
  });
  const folderContainer = content.createDiv({
    cls: "rss-dashboard-folder-input-container",
  });
  const folderInput = folderContainer.createEl("input", {
    attr: {
      id: "rss-dashboard-save-folder",
      type: "text",
      placeholder: "Enter folder path",
      value: context.getSettings().articleSaving.defaultFolder || "",
    },
  });
  const clearIcon = folderContainer.createDiv({
    cls: "clickable-icon rss-dashboard-clear-icon",
    attr: {
      "aria-label": "Clear save folder",
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
  clearIcon.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      clearAction();
    }
  });
  new VaultFolderSuggest(app, folderInput);
  return folderInput;
}

function createSavedTemplateSelect(
  content: HTMLElement,
  item: FeedItem,
  settings: RssDashboardSettings,
): HTMLSelectElement {
  content.createEl("label", {
    text: "Saved template:",
    attr: { for: "rss-dashboard-saved-template" },
  });
  const wrapper = content.createDiv({
    cls: "rss-dashboard-template-select-wrapper",
  });
  const select = wrapper.createEl("select", {
    cls: "rss-dashboard-template-select",
    attr: { id: "rss-dashboard-saved-template" },
  });
  select.createEl("option", { text: "Current template", value: "" });
  for (const template of settings.articleSaving.savedTemplates) {
    select.createEl("option", { text: template.name, value: template.id });
  }
  const feedTemplateId = settings.feeds.find(
    (feed) => feed.url === item.feedUrl,
  )?.customTemplate;
  const initialSelectedTemplateId = settings.articleSaving.savedTemplates.some(
    (template) => template.id === feedTemplateId,
  )
    ? (feedTemplateId ?? "")
    : "";
  select.value = initialSelectedTemplateId;
  return select;
}

function discardPendingTemplate(
  select: HTMLSelectElement,
  getPending: () => PendingTemplate | null,
  setPending: (template: PendingTemplate | null) => void,
  setSelectedId: (id: string) => void,
): void {
  const pending = getPending();
  if (!pending) return;
  const option = Array.from(select.options).find(
    (candidate) => candidate.value === pending.id,
  );
  option?.remove();
  setSelectedId(pending.previousSelectedTemplateId);
  select.value = pending.previousSelectedTemplateId;
  setPending(null);
}

function refreshSaveAsButton(
  input: HTMLTextAreaElement,
  baseline: () => string,
  button: HTMLButtonElement,
  label: HTMLSpanElement,
  getPending: () => PendingTemplate | null,
  discardPending: () => void,
): void {
  const pending = getPending();
  if (pending && pending.template !== input.value) discardPending();
  button.hidden = input.value === baseline();
  label.textContent = getPending()
    ? "New template will be saved"
    : "Save as new template";
}

function addActionButtonContent(
  button: HTMLButtonElement,
  iconName: string,
  label: string,
): HTMLSpanElement {
  const icon = button.createSpan({
    cls: "rss-dashboard-custom-save-button-icon",
    attr: { "aria-hidden": "true" },
  });
  setIcon(icon, iconName);
  return button.createSpan({
    cls: "rss-dashboard-custom-save-button-label",
    text: label,
  });
}

function createTemplateControls(
  app: App,
  content: HTMLElement,
  item: FeedItem,
  folderInput: HTMLInputElement,
  context: ReaderCustomSaveModalContext,
): TemplateControls & { getPending: () => PendingTemplate | null } {
  const settings = context.getSettings();
  const select = createSavedTemplateSelect(content, item, settings);
  content.createEl("label", {
    text: "Use template:",
    attr: { for: "rss-dashboard-save-template" },
  });
  const input = content.createEl("textarea", {
    attr: {
      id: "rss-dashboard-save-template",
      placeholder: "Enter template",
      rows: "6",
    },
  });
  input.value =
    context.getCustomTemplateForArticle(item) ||
    settings.articleSaving.defaultTemplate ||
    "";
  let baseline = input.value;
  let selectedId = select.value;
  const defaultFolder = settings.articleSaving.defaultFolder || "";
  const selectedTemplate = settings.articleSaving.savedTemplates.find(
    (template) => template.id === selectedId,
  );
  if (selectedTemplate) {
    folderInput.value = selectedTemplate.defaultFolder || defaultFolder;
  }
  let pending: PendingTemplate | null = null;
  const getPending = () => pending;
  const setPending = (value: PendingTemplate | null) => {
    pending = value;
  };
  const setSelectedId = (value: string) => {
    selectedId = value;
  };
  const discardPending = () =>
    discardPendingTemplate(select, getPending, setPending, setSelectedId);
  const saveAsButton = content.createEl("button", {
    cls: "rss-dashboard-custom-save-template-button",
    attr: { type: "button" },
  });
  const saveAsLabel = addActionButtonContent(
    saveAsButton,
    "file-plus",
    "Save as new template",
  );
  saveAsButton.hidden = true;
  const refresh = () =>
    refreshSaveAsButton(
      input,
      () => baseline,
      saveAsButton,
      saveAsLabel,
      getPending,
      discardPending,
    );

  select.addEventListener("change", () => {
    discardPending();
    selectedId = select.value;
    const selected = context
      .getSettings()
      .articleSaving.savedTemplates.find((template) => template.id === selectedId);
    if (selected) {
      input.value = selected.template;
      baseline = selected.template;
    }
    folderInput.value = selected?.defaultFolder || defaultFolder;
    pending = null;
    refresh();
  });
  input.addEventListener("input", refresh);
  saveAsButton.addEventListener("click", () => {
    void (async () => {
      const nameModal = new TemplateNameModal(app);
      nameModal.open();
      const name = await nameModal.waitForClose();
      if (!name) return;
      const assignmentModal = new ConfirmTemplateAssignmentModal(app);
      assignmentModal.open();
      const assignToFeed = await assignmentModal.waitForClose();
      const id = "template-" + Date.now();
      pending = {
        id,
        name,
        template: input.value,
        defaultFolder: folderInput.value.trim(),
        assignToFeed,
        previousSelectedTemplateId: selectedId,
      };
      select.createEl("option", { text: name, value: id });
      select.value = id;
      selectedId = id;
      baseline = input.value;
      refresh();
    })();
  });
  return { select, input, saveAsButton, saveAsLabel, getPending };
}

function createActionButtons(
  content: HTMLElement,
  modal: Modal,
  item: FeedItem,
  folderInput: HTMLInputElement,
  templateControls: TemplateControls & { getPending: () => PendingTemplate | null },
  context: ReaderCustomSaveModalContext,
): void {
  const templateHint = content.createEl("p", {
    cls: "setting-item-description rss-dashboard-custom-save-template-hint",
    text: "The prefilled template is ready to use: its frontmatter properties already have the required indentation.",
  });
  const updateTemplateHint = () => {
    templateHint.hidden =
      templateControls.input.value !==
      DEFAULT_SETTINGS.articleSaving.defaultTemplate;
  };
  templateControls.input.addEventListener("input", updateTemplateHint);
  templateControls.select.addEventListener("change", updateTemplateHint);
  updateTemplateHint();

  const buttonContainer = content.createDiv({ cls: "rss-dashboard-modal-buttons" });
  const cancelButton = buttonContainer.createEl("button", {
    cls: "rss-dashboard-custom-save-cancel-button",
    attr: { type: "button" },
  });
  addActionButtonContent(cancelButton, "x", "Cancel");
  cancelButton.addEventListener("click", () => {
    modal.close();
  });
  const saveButton = buttonContainer.createEl("button", {
    cls: "rss-dashboard-primary-button rss-dashboard-custom-save-confirm-button",
    attr: { type: "button" },
  });
  addActionButtonContent(saveButton, "save", "Save");
  buttonContainer.appendChild(templateControls.saveAsButton);
  saveButton.addEventListener("click", () => {
    void (async () => {
      const folder = folderInput.value.trim();
      const template = templateControls.input.value.trim() || undefined;
      const markdownContent = context.buildReaderSaveMarkdown(item);
      const saveItem = context.displayTitle
        ? { ...item, title: context.displayTitle }
        : item;
      const file = await context.getArticleSaver().saveArticle(
        saveItem,
        folder,
        template,
        markdownContent,
      );
      if (file) {
        const settings = context.getSettings();
        const feed = settings.feeds.find((entry) => entry.url === item.feedUrl);
        const pending = templateControls.getPending();
        if (pending) {
          const newTemplate = {
            id: pending.id,
            name: pending.name,
            template: pending.template,
            defaultFolder: pending.defaultFolder,
          };
          settings.articleSaving.savedTemplates.push(newTemplate);
          if (pending.assignToFeed && feed) feed.customTemplate = newTemplate.id;
        } else if (templateControls.select.value && feed) {
          const selected = settings.articleSaving.savedTemplates.find(
            (entry) => entry.id === templateControls.select.value,
          );
          if (selected) feed.customTemplate = selected.id;
        }
        item.saved = true;
        item.savedFilePath = file.path;
        context.onArticleSave(item);
        context.updateSavedLabel(true);
      }
      modal.close();
    })();
  });
}

export class ReaderCustomSaveModal extends Modal {
  private readonly item: FeedItem;
  private readonly context: ReaderCustomSaveModalContext;

  constructor(app: App, item: FeedItem, context: ReaderCustomSaveModalContext) {
    super(app);
    this.item = item;
    this.context = context;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("rss-dashboard-custom-save-modal");
    new Setting(contentEl).setName("Save article").setHeading();
    const folderInput = createFolderControls(this.app, contentEl, this.context);
    const templateControls = createTemplateControls(
      this.app,
      contentEl,
      this.item,
      folderInput,
      this.context,
    );
    createActionButtons(
      contentEl,
      this,
      this.item,
      folderInput,
      templateControls,
      this.context,
    );
  }

  onClose() {
    this.contentEl.empty();
  }
}
