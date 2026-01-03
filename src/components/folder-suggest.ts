import { AbstractInputSuggest, App } from "obsidian";
import type { Folder } from "../types/types";

/**
 * Provides type-ahead folder suggestions for text inputs
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
    private folders: string[];

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
    public selectSuggestion(folder: string): void {
        this.setValue(folder);
        this.close();
    }
}
