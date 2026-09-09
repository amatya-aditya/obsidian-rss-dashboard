import { setIcon } from "obsidian";

export type ImporterShellState =
  | "idle"
  | "validating"
  | "preview"
  | "executing"
  | "done"
  | "error";

export type ImporterShellValidation =
  | { valid: true }
  | { valid: false; error: string };

export interface ImporterPreviewModel {
  getStats(): unknown;
}

export interface ImporterPreviewRenderer<TModel extends ImporterPreviewModel> {
  render(container: HTMLElement, model: TModel, controls: {
    rerender: () => void;
    updateAction: () => void;
  }): void;
}

export interface ImporterShellOptions<TParsed, TModel extends ImporterPreviewModel> {
  acceptedFileTypes: string;
  validate: (content: string, file: File) => ImporterShellValidation;
  parse: (content: string) => TParsed;
  createPreviewModel: (parsed: TParsed) => TModel | null;
  renderer: ImporterPreviewRenderer<TModel>;
  execute: (model: TModel) => Promise<void>;
  onAction?: () => void;
  noItemsError?: string;
  renderError?: (container: HTMLElement, error: string) => void;
  onPreviewVisibilityChange?: (visible: boolean) => void;
  getActionState: (model: TModel | null) => {
    text: string;
    disabled: boolean;
    title?: string;
  };
}

/**
 * Format-agnostic file import lifecycle and shared preview chrome.
 * Format-specific validation, parsing, preview behavior, and execution are
 * supplied by the importer that composes this shell.
 */
export class ImporterShell<TParsed, TModel extends ImporterPreviewModel> {
  private readonly options: ImporterShellOptions<TParsed, TModel>;
  private filePathInput!: HTMLInputElement;
  private errorContainer!: HTMLDivElement;
  private previewContainer!: HTMLDivElement;
  private actionButton!: HTMLButtonElement;
  private model: TModel | null = null;

  state: ImporterShellState = "idle";
  selectedFile: File | null = null;

  constructor(options: ImporterShellOptions<TParsed, TModel>) {
    this.options = options;
  }

  mount(contentEl: HTMLElement, buttonContainer: HTMLElement): void {
    const fileSelector = contentEl.createDiv({ cls: "import-file-selector" });
    this.filePathInput = fileSelector.createEl("input", {
      type: "text",
      cls: "import-file-path-input",
      attr: { placeholder: "No file selected...", disabled: "true" },
    });

    const fileButton = fileSelector.createEl("button", { cls: "import-file-button" });
    setIcon(fileButton, "folder-open");
    fileButton.createSpan({ text: " Import file..." });
    fileButton.onclick = () => this.openFilePicker();

    this.errorContainer = contentEl.createDiv({
      cls: "import-error-container import-hidden",
    });
    this.previewContainer = contentEl.createDiv({
      cls: "import-preview-container import-hidden",
    });
    this.actionButton = buttonContainer.createEl("button", {
      text: "Import feeds",
      cls: "rss-dashboard-primary-button",
    });
    this.actionButton.disabled = true;
    this.actionButton.onclick = () => {
      if (this.options.onAction) {
        this.options.onAction();
        return;
      }
      void this.execute();
    };
  }

  async handleFileSelection(file: File): Promise<void> {
    this.selectedFile = file;
    this.filePathInput.value = file.name;
    this.model = null;
    this.state = "validating";

    try {
      const content = await file.text();
      const validation = this.options.validate(content, file);
      if (!validation.valid) {
        this.showError(validation.error);
        return;
      }
      this.model = this.options.createPreviewModel(this.options.parse(content));
      if (!this.model) {
        this.showError(this.options.noItemsError ?? "No items found in the import file.");
        return;
      }
      this.state = "preview";
      this.renderPreview();
    } catch (error) {
      this.showError(error instanceof Error ? error.message : "Unable to import file.");
    }
  }

  async execute(): Promise<void> {
    if (!this.model || this.state !== "preview") return;
    this.state = "executing";
    this.updateAction();
    try {
      await this.options.execute(this.model);
      this.state = "done";
    } catch (error) {
      this.state = "preview";
      this.updateAction();
      throw error;
    }
  }

  getPreviewModel(): TModel | null {
    return this.model;
  }

  refreshPreview(): void {
    if (this.model) this.renderPreview();
  }

  updateAction(): void {
    const action = this.options.getActionState(this.model);
    this.actionButton.textContent = action.text;
    this.actionButton.disabled = action.disabled || this.state === "executing";
    this.actionButton.classList.toggle("is-disabled", this.actionButton.disabled);
    this.actionButton.title = action.title ?? "";
  }

  private openFilePicker(): void {
    const input = activeDocument.body.createEl("input", {
      attr: { type: "file", accept: this.options.acceptedFileTypes },
    });
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) await this.handleFileSelection(file);
      input.remove();
    };
    input.click();
  }

  private renderPreview(): void {
    const model = this.model;
    if (!model) return;
    this.errorContainer.removeClass("import-visible");
    this.errorContainer.addClass("import-hidden");
    this.previewContainer.removeClass("import-hidden");
    this.previewContainer.addClass("import-visible");
    this.previewContainer.empty();
    this.options.onPreviewVisibilityChange?.(true);
    this.options.renderer.render(this.previewContainer, model, {
      rerender: () => this.refreshPreview(),
      updateAction: () => this.updateAction(),
    });
    this.updateAction();
  }

  private showError(error: string): void {
    this.state = "error";
    this.errorContainer.removeClass("import-hidden");
    this.errorContainer.addClass("import-visible");
    this.errorContainer.empty();
    if (this.options.renderError) {
      this.options.renderError(this.errorContainer, error);
    } else {
      this.errorContainer.createDiv({ cls: "import-error-message", text: error });
    }
    this.previewContainer.removeClass("import-visible");
    this.previewContainer.addClass("import-hidden");
    this.options.onPreviewVisibilityChange?.(false);
    this.updateAction();
  }
}
