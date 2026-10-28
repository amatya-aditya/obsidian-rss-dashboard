import { App, setIcon, Setting } from "obsidian";
import { AccessibleModal } from "../utils/accessible-modal";
import { isValidFolderName } from "../utils/validation";
import { addInputClearButton } from "../utils/input-clear-button";

export interface FolderNameModalOptions {
  title: string;
  defaultValue?: string;
  existingNames?: string[];
  onSubmit: (name: string) => void;
}

// FolderNameModal — Uses Obsidian's Modal class to prevent mobile focus bugs.
// ⚠️ DO NOT move the input to a raw document.body div or add event.stopPropagation()
// guards. Previous attempts created race conditions with Obsidian's workspace handler,
// causing text deletion, lag, and dropped keystrokes. See bug docs for history.
export class FolderNameModal extends AccessibleModal {
  private readonly opts: FolderNameModalOptions;

  constructor(app: App, opts: FolderNameModalOptions) {
    super(app);
    this.opts = opts;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    // Scope CSS to this modal element (used for input iOS sizing rules).
    this.modalEl.addClass("rss-folder-name-modal");

    new Setting(contentEl).setName(this.opts.title).setHeading();

    const inputWrapper = contentEl.createDiv({
      cls: "rss-folder-name-modal-input-wrapper rss-input-margin-bottom",
    });

    const nameInput = inputWrapper.createEl("input", {
      attr: {
        type: "text",
        value: this.opts.defaultValue ?? "",
        placeholder: "Enter folder name",
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
      },
      cls: "rss-full-width-input rss-folder-name-modal-input",
    });
    nameInput.spellcheck = false;

    addInputClearButton(nameInput, {
      container: inputWrapper,
      label: "Clear folder name",
    });

    const errorMsg = contentEl.createDiv({
      cls: "rss-folder-name-modal-error rss-folder-name-modal-error-hidden",
    });

    const showError = (msg: string) => {
      errorMsg.textContent = msg;
      errorMsg.removeClass("rss-folder-name-modal-error-hidden");
      nameInput.classList.add("rss-folder-name-modal-input-error");
    };
    const clearError = () => {
      errorMsg.addClass("rss-folder-name-modal-error-hidden");
      nameInput.classList.remove("rss-folder-name-modal-input-error");
    };

    const submit = () => {
      const name = nameInput.value.trim();
      const validation = isValidFolderName(name);
      if (!validation.valid) {
        showError(validation.error || "Please enter a folder name.");
        nameInput.focus();
        return;
      }
      if (
        this.opts.existingNames?.includes(name) &&
        name !== this.opts.defaultValue
      ) {
        showError("A folder with this name already exists.");
        nameInput.focus();
        return;
      }
      this.close();
      this.opts.onSubmit(name);
    };

    nameInput.addEventListener("input", clearError);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    const buttonContainer = contentEl.createDiv({
      cls: "rss-dashboard-modal-buttons rss-folder-name-modal-buttons",
    });

    const okButton = buttonContainer.createEl("button");
    okButton.className = "rss-dashboard-primary-button";
    okButton.addClass("rss-folder-name-modal-ok");
    const okIcon = okButton.createSpan();
    setIcon(okIcon, "check");
    okButton.createSpan({ text: "OK" });
    okButton.addEventListener("click", submit);

    const cancelButton = buttonContainer.createEl("button");
    cancelButton.addClass("rss-folder-name-modal-cancel");
    const cancelIcon = cancelButton.createSpan();
    setIcon(cancelIcon, "x");
    cancelButton.createSpan({ text: "Cancel" });
    cancelButton.addEventListener("click", () => {
      this.close();
    });

    // Single focus+select; Obsidian's Modal handles focus isolation.
    // ⚠️ Do NOT add rAF re-focus, blur recovery, or stopPropagation.
    window.setTimeout(() => {
      if (this.contentEl.isConnected) {
        nameInput.focus();
        nameInput.select();
      }
    }, 50);
  }

  onClose() {
    this.contentEl.empty();
  }
}
