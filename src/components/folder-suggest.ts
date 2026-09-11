import { App, TFolder, setIcon } from "obsidian";
import type { Folder } from "../types/types";
import { collectFolderPaths } from "../utils/folder-paths";
import { setCssProps } from "../utils/platform-utils";

/**
 * Input suggester based only on browser APIs that exist in Obsidian 1.1.
 * AbstractInputSuggest was introduced in Obsidian 1.4.10.
 */
abstract class LegacyInputSuggest<T> {
  protected readonly app: App;
  protected readonly inputEl: HTMLInputElement;
  protected readonly suggestEl: HTMLDivElement;
  private suggestions: T[] = [];
  private selectedIndex = -1;
  private closeTimeout: number | null = null;

  constructor(app: App, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
    this.suggestEl = inputEl.ownerDocument.win.createDiv();
    this.suggestEl.classList.add("rss-dashboard-folder-suggestion-container");
    this.suggestEl.setAttribute("role", "listbox");
    setCssProps(this.suggestEl, { display: "none" });
    const inputContainer = inputEl.parentElement ?? inputEl.ownerDocument.body;
    setCssProps(inputContainer, { position: "relative" });
    inputContainer.appendChild(this.suggestEl);

    this.inputEl.addEventListener("input", () => this.refreshSuggestions());
    this.inputEl.addEventListener("keydown", (event) =>
      this.handleKeydown(event),
    );
    this.inputEl.addEventListener("blur", () => {
      this.closeTimeout = window.setTimeout(() => this.close(), 150);
    });
    this.inputEl.addEventListener("focus", () => {
      if (this.closeTimeout !== null) {
        window.clearTimeout(this.closeTimeout);
        this.closeTimeout = null;
      }
    });
  }

  protected abstract getSuggestions(query: string): T[];
  public abstract renderSuggestion(value: T, el: HTMLElement): void;
  public abstract selectSuggestion(
    value: T,
    event: MouseEvent | KeyboardEvent,
  ): void;

  public close(): void {
    setCssProps(this.suggestEl, { display: "none" });
    this.selectedIndex = -1;
  }

  private refreshSuggestions(): void {
    this.suggestions = this.getSuggestions(this.inputEl.value);
    this.selectedIndex = -1;
    this.suggestEl.empty();

    if (this.suggestions.length === 0) {
      this.close();
      return;
    }

    this.suggestions.forEach((suggestion, index) => {
      const option = this.suggestEl.createDiv({
        cls: "edit-feed-folder-option",
      });
      option.setAttribute("role", "option");
      option.dataset.suggestionIndex = String(index);
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.selectSuggestion(suggestion, event);
      });
      this.renderSuggestion(suggestion, option);
    });

    setCssProps(this.suggestEl, { display: "block" });
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (this.suggestions.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      this.selectedIndex =
        (this.selectedIndex + direction + this.suggestions.length) %
        this.suggestions.length;
      this.suggestEl.querySelectorAll<HTMLElement>("[role=option]").forEach(
        (option, index) => {
          option.classList.toggle("is-selected", index === this.selectedIndex);
          option.setAttribute(
            "aria-selected",
            index === this.selectedIndex ? "true" : "false",
          );
        },
      );
      return;
    }

    if (event.key === "Enter" && this.selectedIndex >= 0) {
      event.preventDefault();
      this.selectSuggestion(this.suggestions[this.selectedIndex], event);
      return;
    }

    if (event.key === "Escape") this.close();
  }
}

/** Provides type-ahead folder suggestions from the vault. */
export class VaultFolderSuggest extends LegacyInputSuggest<TFolder> {
  protected getSuggestions(query: string): TFolder[] {
    const folders: TFolder[] = [];
    this.collectFolders(this.app.vault.getRoot(), folders);
    const lowerQuery = query.toLowerCase();
    return folders.filter((folder) =>
      folder.path.toLowerCase().includes(lowerQuery),
    );
  }

  private collectFolders(folder: TFolder, result: TFolder[]): void {
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        result.push(child);
        this.collectFolders(child, result);
      }
    }
  }

  public renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  public selectSuggestion(
    folder: TFolder,
    _event: MouseEvent | KeyboardEvent,
  ): void {
    this.inputEl.value = folder.path;
    this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    this.close();
  }
}

/**
 * A real existing folder, or the "add a new folder with this name" row shown
 * when the typed query doesn't match one. Kept as a tagged union (rather
 * than a sentinel string like the old `"Add new folder..."` label) so the
 * add-new row can carry the actual typed name through to both rendering and
 * selection.
 */
type FolderSuggestOption =
  | { kind: "folder"; path: string }
  | { kind: "add-new"; name: string };

/** Provides type-ahead folder suggestions for RSS sidebar folders. */
export class FolderSuggest extends LegacyInputSuggest<FolderSuggestOption> {
  private folders: string[];
  private showAddNewOption: boolean;

  constructor(
    app: App,
    inputEl: HTMLInputElement,
    folders: Folder[],
    options?: { showAddNewOption?: boolean },
  ) {
    super(app, inputEl);
    this.folders = collectFolderPaths(folders, { sort: true });
    this.showAddNewOption = options?.showAddNewOption ?? true;

    this.inputEl.addEventListener("input", () => {
      const forbidden = /[\\:*?"<>|]/g;
      if (forbidden.test(this.inputEl.value)) {
        this.inputEl.value = this.inputEl.value.replace(forbidden, "");
      }
    });
    this.inputEl.addEventListener("click", () => {
      if (this.inputEl.value === "") {
        this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  public updateFolders(folders: Folder[]): void {
    this.folders = collectFolderPaths(folders, { sort: true });
  }

  protected getSuggestions(query: string): FolderSuggestOption[] {
    const trimmedQuery = query.trim();
    const lowerQuery = trimmedQuery.toLowerCase();
    const exactMatch = this.folders.some(
      (folder) => folder.toLowerCase() === lowerQuery,
    );

    // An exact match (the user finished typing a valid existing folder name)
    // shows the full folder list again, same as an empty query — there's
    // nothing left to narrow down, and browsing the rest is more useful
    // than a substring-filtered list containing just that one folder.
    const matches =
      lowerQuery === "" || exactMatch
        ? this.folders
        : this.folders.filter((folder) =>
            folder.toLowerCase().includes(lowerQuery),
          );
    const folderOptions: FolderSuggestOption[] = matches.map((path) => ({
      kind: "folder",
      path,
    }));

    if (!this.showAddNewOption || trimmedQuery === "" || exactMatch) {
      return folderOptions;
    }

    return [{ kind: "add-new", name: trimmedQuery }, ...folderOptions];
  }

  public renderSuggestion(option: FolderSuggestOption, el: HTMLElement): void {
    if (option.kind === "add-new") {
      el.addClass("rss-dashboard-add-new-suggestion");
      setIcon(
        el.createSpan({ cls: "rss-dashboard-add-new-suggestion-icon" }),
        "folder-plus",
      );
      el.createSpan({ text: `Add "${option.name}"` });
      return;
    }
    el.setText(option.path);
  }

  public selectSuggestion(
    option: FolderSuggestOption,
    _event: MouseEvent | KeyboardEvent,
  ): void {
    this.inputEl.value = option.kind === "add-new" ? option.name : option.path;
    this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    this.inputEl.focus();
    this.close();
  }
}
