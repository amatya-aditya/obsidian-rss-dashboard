import { App, Modal, Setting, setIcon } from "obsidian";
import {
  DEFAULT_SETTINGS,
  type FeedItem,
  type RssDashboardSettings,
  type SavedTemplate,
} from "../types/types";
import { ArticleSaver } from "../services/article-saver";
import { VaultFolderSuggest } from "../components/folder-suggest";
import { ONE_SAVE_OVERRIDE_TEMPLATE_ID } from "../utils/saved-template-utils";
import { addActionButtonContent } from "../utils/action-button-content";
import {
  ConfirmTemplateAssignmentModal,
  ConfirmTemplateReplacementModal,
  SavedTemplateEditorModal,
} from "../settings/modals/settings-modals";

interface PendingTemplate {
  id: string;
  name: string;
  template: string;
  defaultFolder: string;
  filenamePattern: string;
  makeGlobalDefault: boolean;
  assignToFeed: boolean;
  previousSelectedTemplateId: string;
}

export interface ReaderCustomSaveModalContext {
  getSettings: () => RssDashboardSettings;
  getArticleSaver: () => ArticleSaver;
  displayTitle: string | undefined;
  getSavedTemplateForArticle: (item: FeedItem) => SavedTemplate | undefined;
  saveSettings: () => Promise<void>;
  buildReaderSaveMarkdown: (item: FeedItem) => string;
  onArticleSave: (item: FeedItem) => void;
  updateSavedLabel: (saved: boolean) => void;
}

interface TemplateControls {
  select: HTMLSelectElement;
  input: HTMLTextAreaElement;
  filenamePatternInput: HTMLInputElement;
  saveAsButton: HTMLButtonElement;
  saveAsLabel: HTMLSpanElement;
  getFilenamePattern: () => string | undefined;
  getSelectedTemplate: () => SavedTemplate | undefined;
  getAssignToFeedId: () => string;
}

interface FilenamePatternControls {
  input: HTMLInputElement;
  getEffectivePattern: () => string | undefined;
  refresh: () => void;
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
  const feed = settings.feeds.find((feed) => feed.url === item.feedUrl);
  const feedTemplateId = feed?.customTemplate;
  const initialSelectedTemplateId =
    [feedTemplateId, settings.articleSaving.globalDefaultTemplateId].find(
      (templateId) =>
        settings.articleSaving.savedTemplates.some(
          (template) => template.id === templateId,
        ),
    ) || "";
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

function createFilenamePatternControls(
  content: HTMLElement,
  item: FeedItem,
  folderInput: HTMLInputElement,
  select: HTMLSelectElement,
  context: ReaderCustomSaveModalContext,
  getTemplatePattern: () => string | undefined,
): FilenamePatternControls {
  content.createEl("label", {
    text: "Filename pattern override (optional):",
    attr: { for: "rss-dashboard-filename-pattern" },
  });
  const input = content.createEl("input", {
    attr: {
      id: "rss-dashboard-filename-pattern",
      type: "text",
      placeholder: "{{title}}",
      "aria-describedby": "rss-dashboard-filename-pattern-description",
    },
  });
  content.createEl("p", {
    cls: "setting-item-description",
    attr: { id: "rss-dashboard-filename-pattern-description" },
    text: "Leave blank to use the selected saved template's filename pattern.",
  });
  const resetButton = content.createEl("button", {
    cls: "rss-dashboard-use-template-filename-pattern-button",
    text: "Use template pattern",
    attr: { type: "button" },
  });
  const inheritedPattern = content.createEl("p", {
    cls: "setting-item-description rss-dashboard-template-filename-pattern",
  });
  const preview = content.createEl("p", {
    cls: "setting-item-description rss-dashboard-filename-preview",
    attr: { "aria-live": "polite" },
  });
  const getEffectivePattern = () =>
    input.value.trim() || getTemplatePattern()?.trim() || undefined;
  const refresh = () => {
    const templatePattern = getTemplatePattern()?.trim();
    inheritedPattern.textContent = templatePattern
      ? `Template pattern: ${templatePattern}`
      : "Template pattern: none (uses article title)";
    const saveItem = context.displayTitle
      ? { ...item, title: context.displayTitle }
      : item;
    const filename = context
      .getArticleSaver()
      .getFilenamePreview(
        saveItem,
        folderInput.value.trim(),
        getEffectivePattern(),
      );
    preview.textContent = `Filename preview: ${filename}`;
    resetButton.disabled = !input.value.trim();
  };
  input.addEventListener("input", refresh);
  folderInput.addEventListener("input", refresh);
  select.addEventListener("change", refresh);
  resetButton.addEventListener("click", () => {
    input.value = "";
    refresh();
    input.focus();
  });
  refresh();
  return { input, getEffectivePattern, refresh };
}

function confirmFeedTemplateAssignment(
  app: App,
  item: FeedItem,
  selected: SavedTemplate | undefined,
  context: ReaderCustomSaveModalContext,
  setAssignToFeedId: (id: string) => void,
): void {
  const feed = context
    .getSettings()
    .feeds.find((entry) => entry.url === item.feedUrl);
  if (!selected || !feed || selected.id === feed.customTemplate) {
    setAssignToFeedId("");
    return;
  }
  if (!feed.customTemplate) {
    setAssignToFeedId(selected.id);
    return;
  }
  const current = context
    .getSettings()
    .articleSaving.savedTemplates.find(
      (template) => template.id === feed.customTemplate,
    );
  const confirm = new ConfirmTemplateReplacementModal(
    app,
    feed.title,
    current?.name || "Current template",
    selected.name,
  );
  confirm.open();
  void confirm.waitForClose().then((accepted) => {
    if (accepted) setAssignToFeedId(selected.id);
  });
}

async function createPendingTemplate(options: {
  app: App;
  item: FeedItem;
  input: HTMLTextAreaElement;
  folderInput: HTMLInputElement;
  context: ReaderCustomSaveModalContext;
  previousSelectedTemplateId: string;
}): Promise<PendingTemplate | null> {
  const { app, item, input, folderInput, context, previousSelectedTemplateId } =
    options;
  const editor = new SavedTemplateEditorModal(
    app,
    {
      name: "",
      template: input.value,
      defaultFolder: folderInput.value.trim(),
      filenamePattern: "",
      makeGlobalDefault: false,
    },
    context.getSettings().articleSaving.savedTemplates,
  );
  editor.open();
  const result = await editor.waitForClose();
  if (!result) return null;

  const feed = context
    .getSettings()
    .feeds.find((entry) => entry.url === item.feedUrl);
  let assignToFeed = false;
  if (feed?.customTemplate) {
    const current = context
      .getSettings()
      .articleSaving.savedTemplates.find(
        (template) => template.id === feed.customTemplate,
      );
    const confirm = new ConfirmTemplateReplacementModal(
      app,
      feed.title,
      current?.name || "Current template",
      result.name,
    );
    confirm.open();
    assignToFeed = await confirm.waitForClose();
  } else {
    const confirm = new ConfirmTemplateAssignmentModal(app);
    confirm.open();
    assignToFeed = await confirm.waitForClose();
  }

  return {
    id: `template-${Date.now()}`,
    name: result.name,
    template: result.template,
    defaultFolder: result.defaultFolder,
    filenamePattern: result.filenamePattern,
    makeGlobalDefault: result.makeGlobalDefault,
    assignToFeed,
    previousSelectedTemplateId,
  };
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
    context.getSavedTemplateForArticle(item)?.template ??
    settings.articleSaving.defaultTemplate ??
    "";
  let baseline = input.value;
  let selectedId = select.value;
  const defaultFolder = settings.articleSaving.defaultFolder || "";
  const initialTemplate = settings.articleSaving.savedTemplates.find(
    (template) => template.id === selectedId,
  );
  if (initialTemplate) {
    folderInput.value = initialTemplate.defaultFolder || defaultFolder;
  }
  let assignToFeedId = "";
  let pending: PendingTemplate | null = null;
  const getPending = () => pending;
  const filenameControls = createFilenamePatternControls(
    content,
    item,
    folderInput,
    select,
    context,
    () =>
      getPending()?.filenamePattern ||
      context
        .getSettings()
        .articleSaving.savedTemplates.find(
          (template) => template.id === select.value,
        )?.filenamePattern,
  );
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
    const requestedId = select.value;
    discardPending();
    selectedId = requestedId;
    select.value = requestedId;
    const selected = context
      .getSettings()
      .articleSaving.savedTemplates.find(
        (template) => template.id === selectedId,
      );
    input.value =
      selected?.template ?? context.getSettings().articleSaving.defaultTemplate;
    baseline = input.value;
    folderInput.value = selected?.defaultFolder || defaultFolder;
    pending = null;
    assignToFeedId = "";
    confirmFeedTemplateAssignment(app, item, selected, context, (id) => {
      assignToFeedId = id;
    });
    refresh();
    filenameControls.refresh();
  });
  input.addEventListener("input", refresh);
  saveAsButton.addEventListener("click", () => {
    void (async () => {
      const pendingTemplate = await createPendingTemplate({
        app,
        item,
        input,
        folderInput,
        context,
        previousSelectedTemplateId: selectedId,
      });
      if (!pendingTemplate) return;
      pending = pendingTemplate;
      const { id, name } = pendingTemplate;
      select.createEl("option", { text: name, value: id });
      select.value = id;
      selectedId = id;
      input.value = pendingTemplate.template;
      folderInput.value = pendingTemplate.defaultFolder || defaultFolder;
      assignToFeedId = pendingTemplate.assignToFeed ? id : "";
      baseline = pendingTemplate.template;
      refresh();
      filenameControls.refresh();
    })();
  });
  return {
    select,
    input,
    filenamePatternInput: filenameControls.input,
    saveAsButton,
    saveAsLabel,
    getFilenamePattern: filenameControls.getEffectivePattern,
    getPending,
    getSelectedTemplate: () =>
      context
        .getSettings()
        .articleSaving.savedTemplates.find(
          (template) => template.id === selectedId,
        ),
    getAssignToFeedId: () => assignToFeedId,
  };
}

function createActionButtons(
  content: HTMLElement,
  modal: Modal,
  item: FeedItem,
  folderInput: HTMLInputElement,
  templateControls: TemplateControls & {
    getPending: () => PendingTemplate | null;
  },
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

  const buttonContainer = content.createDiv({
    cls: "rss-dashboard-modal-buttons",
  });
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
      const pendingTemplate = templateControls.getPending();
      const savedTemplate = pendingTemplate
        ? {
            id: pendingTemplate.id,
            name: pendingTemplate.name,
            template: pendingTemplate.template,
            defaultFolder: pendingTemplate.defaultFolder,
            ...(pendingTemplate.filenamePattern
              ? { filenamePattern: pendingTemplate.filenamePattern }
              : {}),
          }
        : templateControls.getSelectedTemplate();
      const filenamePattern = templateControls.getFilenamePattern();
      const templateForSave = filenamePattern
        ? savedTemplate
          ? { ...savedTemplate, filenamePattern }
          : {
              id: ONE_SAVE_OVERRIDE_TEMPLATE_ID,
              name: "One-save filename override",
              template: template || "",
              defaultFolder: folder,
              filenamePattern,
            }
        : savedTemplate;
      const markdownContent = context.buildReaderSaveMarkdown(item);
      const saveItem = context.displayTitle
        ? { ...item, title: context.displayTitle }
        : item;
      const articleSaver = context.getArticleSaver();
      const file = templateForSave
        ? await articleSaver.saveArticle(
            saveItem,
            folder,
            template,
            markdownContent,
            templateForSave,
          )
        : await articleSaver.saveArticle(
            saveItem,
            folder,
            template,
            markdownContent,
          );
      if (file) {
        const settings = context.getSettings();
        const feed = settings.feeds.find((entry) => entry.url === item.feedUrl);
        const pending = pendingTemplate;
        if (pending) {
          const newTemplate = {
            id: pending.id,
            name: pending.name,
            template: pending.template,
            defaultFolder: pending.defaultFolder,
            ...(pending.filenamePattern
              ? { filenamePattern: pending.filenamePattern }
              : {}),
          };
          settings.articleSaving.savedTemplates.push(newTemplate);
          if (pending.makeGlobalDefault) {
            settings.articleSaving.globalDefaultTemplateId = newTemplate.id;
          }
          if (pending.assignToFeed && feed)
            feed.customTemplate = newTemplate.id;
        } else if (templateControls.getAssignToFeedId() && feed) {
          feed.customTemplate = templateControls.getAssignToFeedId();
        } else if (feed && !templateControls.select.value) {
          // "Current template" is chosen: the feed goes back to the default (#814).
          feed.customTemplate = undefined;
        }
        await context.saveSettings();
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
