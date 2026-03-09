import { AbstractInputSuggest, App, TFile, TFolder, Setting } from "obsidian";
import type { Folder } from "../types/types";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];

/**
 * Provides type-ahead image file suggestions from the vault
 */
export class VaultImageSuggest extends AbstractInputSuggest<TFile> {
    private inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    protected getSuggestions(query: string): TFile[] {
        const lowerQuery = query.toLowerCase();
        return this.app.vault.getFiles()
            .filter(file =>
                IMAGE_EXTENSIONS.includes(file.extension.toLowerCase()) &&
                file.path.toLowerCase().includes(lowerQuery)
            )
            .slice(0, 50);
    }

    public renderSuggestion(file: TFile, el: HTMLElement): void {
        el.setText(file.path);
    }

    public selectSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
        this.inputEl.value = file.path;
        this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        this.close();
    }
}

/**
 * Provides type-ahead folder suggestions from the vault
 */
export class VaultFolderSuggest extends AbstractInputSuggest<TFolder> {
    private inputEl: HTMLInputElement;

    constructor(app: App, inputEl: HTMLInputElement) {
        super(app, inputEl);
        this.inputEl = inputEl;
    }

    protected getSuggestions(query: string): TFolder[] {
        const lowerQuery = query.toLowerCase();
        const folders: TFolder[] = [];

        const rootFolder = this.app.vault.getRoot();
        this.collectFolders(rootFolder, folders);

        return folders.filter(folder =>
            folder.path.toLowerCase().includes(lowerQuery)
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

    public selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
        this.inputEl.value = folder.path;
        this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        this.close();
    }
}

const ADD_FOLDER_SENTINEL = "\0__add_new_folder__";

/**
 * Provides type-ahead folder suggestions for RSS sidebar folders
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
    private folders: string[];
    private inputEl: HTMLInputElement;
    private sourceFolders: Folder[];
    private onAddFolder?: (name: string) => void;

    /**
     * Collects all folder paths from the folder tree
     */
    private collectAllFolders(folders: Folder[], base = ""): string[] {
        let paths: string[] = [];
        for (const f of folders) {
            const path = base ? `${base}/${f.name}` : f.name;
            paths.push(path);
            if (f.subfolders && f.subfolders.length > 0) {
                paths = paths.concat(this.collectAllFolders(f.subfolders, path));
            }
        }
        return paths.sort((a, b) => a.localeCompare(b));
    }

    constructor(app: App, inputEl: HTMLInputElement, folders: Folder[], onAddFolder?: (name: string) => void) {
        super(app, inputEl);
        this.inputEl = inputEl;
        this.sourceFolders = folders;
        this.folders = this.collectAllFolders(folders);
        this.onAddFolder = onAddFolder;
    }

    /**
     * Updates the available folders
     */
    public updateFolders(folders: Folder[]): void {
        this.sourceFolders = folders;
        this.folders = this.collectAllFolders(folders);
    }

    /**
     * Returns filtered folder suggestions based on the query
     */
    protected getSuggestions(query: string): string[] {
        const lowerQuery = query.toLowerCase();
        const filtered = this.folders.filter(folder =>
            folder.toLowerCase().includes(lowerQuery)
        );
        filtered.push(ADD_FOLDER_SENTINEL);
        return filtered;
    }

    /**
     * Renders a folder suggestion in the dropdown
     */
    public renderSuggestion(folder: string, el: HTMLElement): void {
        if (folder === ADD_FOLDER_SENTINEL) {
            el.addClass("rss-folder-suggest-add-new");
            el.setText("Add new folder...");
        } else {
            el.setText(folder);
        }
    }

    /**
     * Called when a folder is selected
     */
    public selectSuggestion(folder: string, _evt: MouseEvent | KeyboardEvent): void {
        if (folder === ADD_FOLDER_SENTINEL) {
            this.close();
            this.showAddFolderPrompt();
            return;
        }
        this.inputEl.value = folder;
        this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        this.close();
    }

    private showAddFolderPrompt(): void {
        const modal = document.body.createDiv({
            cls: "rss-dashboard-modal rss-dashboard-modal-container"
        });
        const modalContent = modal.createDiv({
            cls: "rss-dashboard-modal-content"
        });
        new Setting(modalContent).setName("Create new folder").setHeading();
        const nameInput = modalContent.createEl("input", {
            attr: {
                type: "text",
                placeholder: "Enter folder name",
                autocomplete: "off"
            },
            cls: "rss-full-width-input rss-input-margin-bottom"
        });
        nameInput.spellcheck = false;
        nameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                submit();
            } else if (e.key === "Escape") {
                document.body.removeChild(modal);
            }
        });
        const buttonContainer = modalContent.createDiv({
            cls: "rss-dashboard-modal-buttons"
        });
        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel"
        });
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });
        const okButton = buttonContainer.createEl("button", {
            text: "OK"
        });
        okButton.className = "rss-dashboard-primary-button";

        const submit = () => {
            const name = nameInput.value.trim();
            if (name) {
                document.body.removeChild(modal);
                // Add folder to the source list
                if (!this.sourceFolders.some(f => f.name === name)) {
                    this.sourceFolders.push({
                        name,
                        subfolders: [],
                        createdAt: Date.now(),
                        modifiedAt: Date.now()
                    });
                }
                this.folders = this.collectAllFolders(this.sourceFolders);
                // Set the input value to the new folder
                this.inputEl.value = name;
                this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
                this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
                // Notify callback if provided
                if (this.onAddFolder) {
                    this.onAddFolder(name);
                }
            }
        };

        okButton.addEventListener("click", submit);
        requestAnimationFrame(() => {
            nameInput.focus();
        });
    }
}
