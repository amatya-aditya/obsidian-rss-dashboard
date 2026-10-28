import { AbstractInputSuggest, App, TFolder, setIcon } from "obsidian";
import type { Folder } from "../types/types";
import { collectFolderPaths } from "../utils/folder-paths";

/** Class on Obsidian's suggest container, so the plugin styles only its own. */
export const FOLDER_SUGGEST_CONTAINER_CLASS = "rss-folder-suggest-container";

/**
 * `AbstractInputSuggest` names its popover container `suggestEl`, but
 * Obsidian's typings leave it out. It is a stable `div.suggestion-container`
 * (observed on 1.14.4; see test_files/stubs/obsidian-console-probes.md), so one
 * narrow cast reaches it.
 */
interface SuggestContainerAccess {
  suggestEl: HTMLElement;
}

/**
 * Shared behavior of the folder type-ahead fields. Obsidian draws the list: it
 * opens below the input, flips above it when there is no room, and stays
 * reachable on a phone. This class supplies the rows and what happens when one
 * is chosen.
 */
abstract class FolderInputSuggest<T> extends AbstractInputSuggest<T> {
  protected readonly inputEl: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
    this.inputEl = inputEl;
    (this as unknown as SuggestContainerAccess).suggestEl.addClass(
      FOLDER_SUGGEST_CONTAINER_CLASS,
    );

    // Obsidian opens the list when the field gains focus or its text changes.
    // A click on an empty field that already has focus (after Escape, or after
    // a choice) does neither, so ask for the full list again.
    this.inputEl.addEventListener("click", () => {
      if (this.inputEl.value === "") {
        this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  /**
   * The base class neither sets the field's value nor closes the list when a
   * row is chosen, so do both, and tell the form the value changed. The list
   * closes last: the `input` event would otherwise reopen it.
   */
  protected commitValue(value: string, options?: { refocus?: boolean }): void {
    this.setValue(value);
    this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
    this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
    if (options?.refocus) this.inputEl.focus();
    this.close();
  }
}

/** Provides type-ahead folder suggestions from the vault. */
export class VaultFolderSuggest extends FolderInputSuggest<TFolder> {
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
    this.commitValue(folder.path);
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
  { kind: "folder"; path: string } | { kind: "add-new"; name: string };

/** Provides type-ahead folder suggestions for RSS sidebar folders. */
export class FolderSuggest extends FolderInputSuggest<FolderSuggestOption> {
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
    // The RSS folder tree is small and hand-made, and an empty field lists all
    // of it; Obsidian's default cap of 100 rows would hide the rest.
    this.limit = 0;

    this.inputEl.addEventListener("input", () => {
      const forbidden = /[\\:*?"<>|]/g;
      if (forbidden.test(this.inputEl.value)) {
        this.inputEl.value = this.inputEl.value.replace(forbidden, "");
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

    // Only an empty query lists every folder. A non-empty query narrows the
    // list, including when it equals an existing folder exactly; the exact
    // match only suppresses the add-new row below.
    const matches =
      lowerQuery === ""
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
    this.commitValue(option.kind === "add-new" ? option.name : option.path, {
      refocus: true,
    });
  }
}
