import { App, Modal, Notice, Setting } from "obsidian";
import type {
  OpenWebViewerSaveDialog,
  WebViewerSaveDialogOptions,
} from "../services/web-viewer-integration";

export class WebViewerSaveModal extends Modal {
  private readonly opts: WebViewerSaveDialogOptions;

  constructor(app: App, opts: WebViewerSaveDialogOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { defaultFolder, defaultTemplate, includeFrontmatter, onSave } =
      this.opts;
    const { contentEl } = this;
    contentEl.empty();

    this.modalEl.addClass("rss-dashboard-web-viewer-save-modal");

    new Setting(contentEl).setName("Save with template").setHeading();

    contentEl.createEl("label", {
      text: "Save to folder:",
    });

    const folderInput = contentEl.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Enter folder path",
        value: defaultFolder,
        autocomplete: "off",
      },
    });
    folderInput.spellcheck = false;
    folderInput.addEventListener("focus", () => folderInput.select());

    contentEl.createEl("label", {
      text: "Use template:",
    });

    const templateInput = contentEl.createEl("textarea", {
      attr: {
        placeholder: "Enter template",
        rows: "6",
        autocomplete: "off",
      },
    });
    templateInput.spellcheck = false;
    templateInput.value = defaultTemplate;
    templateInput.addEventListener("focus", () => templateInput.select());

    const includeFrontmatterCheck = contentEl.createDiv({
      cls: "rss-dashboard-checkbox",
    });

    const frontmatterCheckbox = includeFrontmatterCheck.createEl("input", {
      attr: {
        type: "checkbox",
        id: "include-frontmatter",
      },
    });
    frontmatterCheckbox.checked = includeFrontmatter;

    includeFrontmatterCheck.createEl("label", {
      attr: { htmlFor: "include-frontmatter" },
      text: "Include frontmatter",
    });

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    const saveButton = buttonContainer.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button",
    });
    saveButton.addEventListener("click", () => {
      void (async () => {
        const folder = folderInput.value.trim();
        const template = templateInput.value.trim();

        try {
          await onSave(folder, template, frontmatterCheckbox.checked);

          this.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          new Notice(`Error saving article: ${message}`);
        }
      })();
    });

    folderInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        templateInput.focus();
      }
    });
    templateInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        saveButton.click();
        e.preventDefault();
      }
    });

    window.requestAnimationFrame(() => {
      folderInput.focus();
      folderInput.select();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

/** Opener handed to `WebViewerIntegration`, which may not import modals. */
export function openWebViewerSaveModal(app: App): OpenWebViewerSaveDialog {
  return (options) => new WebViewerSaveModal(app, options).open();
}
