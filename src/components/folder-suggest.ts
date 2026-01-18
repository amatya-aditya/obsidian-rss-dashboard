import { AbstractInputSuggest, App, TFolder } from "obsidian";
import type { Folder } from "../types/types";

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

/**
 * Provides type-ahead folder suggestions for RSS sidebar folders
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
    private folders: string[];
    private inputEl: HTMLInputElement;

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

    constructor(app: App, inputEl: HTMLInputElement, folders: Folder[]) {
        super(app, inputEl);
        this.inputEl = inputEl;
        this.folders = this.collectAllFolders(folders);
    }

    /**
     * Updates the available folders
     */
    public updateFolders(folders: Folder[]): void {
        this.folders = this.collectAllFolders(folders);
    }

    /**
     * Returns filtered folder suggestions based on the query
     */
    protected getSuggestions(query: string): string[] {
        const lowerQuery = query.toLowerCase();
        return this.folders.filter(folder =>
            folder.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Renders a folder suggestion in the dropdown
     */
    public renderSuggestion(folder: string, el: HTMLElement): void {
        el.setText(folder);
    }

    /**
     * Called when a folder is selected
     */
    public selectSuggestion(folder: string, _evt: MouseEvent | KeyboardEvent): void {
        this.inputEl.value = folder;
        this.inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        this.inputEl.dispatchEvent(new Event("change", { bubbles: true }));
        this.close();
    }
}
