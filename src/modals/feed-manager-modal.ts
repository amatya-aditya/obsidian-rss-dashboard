import { Modal, App, Setting, Notice } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { Feed, Folder } from "../types";

function collectAllFolders(folders: Folder[], base = ""): string[] {
    let paths: string[] = [];
    for (const f of folders) {
        const path = base ? `${base}/${f.name}` : f.name;
        paths.push(path);
        if (f.subfolders && f.subfolders.length > 0) {
            paths = paths.concat(collectAllFolders(f.subfolders, path));
        }
    }
    return paths;
}

class EditFeedModal extends Modal {
    feed: Feed;
    plugin: RssDashboardPlugin;
    onSave: () => void;
    constructor(app: App, plugin: RssDashboardPlugin, feed: Feed, onSave: () => void) {
        super(app);
        this.feed = feed;
        this.plugin = plugin;
        this.onSave = onSave;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Edit Feed" });
        let title = this.feed.title;
        let url = this.feed.url;
        let folder = this.feed.folder || "";
        const allFolders = collectAllFolders(this.plugin.settings.folders);
        let titleInput: HTMLInputElement;
        let urlInput: HTMLInputElement;
        let folderInput: HTMLInputElement;
        let dropdown: HTMLDivElement | null = null;
        new Setting(contentEl)
            .setName("Title")
            .addText(text => {
                text.setValue(title).onChange(v => title = v);
                titleInput = text.inputEl;
                titleInput.autocomplete = "off";
                titleInput.spellcheck = false;
                titleInput.addEventListener("focus", () => titleInput.select());
                titleInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        urlInput?.focus();
                    } else if (e.key === "Escape") {
                        this.close();
                    }
                });
            });
        new Setting(contentEl)
            .setName("URL")
            .addText(text => {
                text.setValue(url).onChange(v => url = v);
                urlInput = text.inputEl;
                urlInput.autocomplete = "off";
                urlInput.spellcheck = false;
                urlInput.addEventListener("focus", () => urlInput.select());
                urlInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        folderInput?.focus();
                    } else if (e.key === "Escape") {
                        this.close();
                    }
                });
            });
        
        new Setting(contentEl)
            .setName("Folder")
            .addText(text => {
                text.setValue(folder)
                    .setPlaceholder("Type or select folder...")
                    .inputEl.classList.add("edit-feed-folder-input");
                folderInput = text.inputEl;
                folderInput.autocomplete = "off";
                folderInput.spellcheck = false;
                folderInput.addEventListener("focus", () => folderInput.select());
                folderInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        saveBtn.click();
                    } else if (e.key === "Escape") {
                        this.close();
                    }
                });
                text.onChange(v => {
                    folder = v;
                    if (dropdown) {
                        
                        const filtered = allFolders.filter(f => f.toLowerCase().includes(v.toLowerCase()));
                        if (dropdown) {
                            dropdown.innerHTML = "";
                            filtered.forEach(f => {
                                if (dropdown) {
                                    const opt = dropdown.createDiv({ text: f, cls: "edit-feed-folder-option" });
                                    opt.onclick = () => {
                                        folder = f;
                                        text.setValue(f);
                                        if (dropdown) dropdown.style.display = "none";
                                    };
                                }
                            });
                            dropdown.style.display = filtered.length ? "block" : "none";
                        }
                    }
                });
                text.inputEl.onfocus = () => {
                    if (!dropdown) {
                        dropdown = contentEl.createDiv({ cls: "edit-feed-folder-dropdown" });
                        dropdown.style.position = "absolute";
                        dropdown.style.background = "var(--background-primary)";
                        dropdown.style.border = "1px solid var(--background-modifier-border, #ccc)";
                        dropdown.style.zIndex = "10000";
                        dropdown.style.width = folderInput.offsetWidth + "px";
                        dropdown.style.maxHeight = "180px";
                        dropdown.style.overflowY = "auto";
                        dropdown.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                        dropdown.style.left = folderInput.getBoundingClientRect().left + "px";
                        dropdown.style.top = (folderInput.getBoundingClientRect().bottom + window.scrollY) + "px";
                        document.body.appendChild(dropdown);
                    }
                    
                    if (dropdown) {
                        dropdown.innerHTML = "";
                        allFolders.forEach(f => {
                            if (dropdown) {
                                const opt = dropdown.createDiv({ text: f, cls: "edit-feed-folder-option" });
                                opt.onclick = () => {
                                    folder = f;
                                    text.setValue(f);
                                    if (dropdown) dropdown.style.display = "none";
                                };
                            }
                        });
                        dropdown.style.display = allFolders.length ? "block" : "none";
                    }
                };
                text.inputEl.onblur = () => {
                    setTimeout(() => {
                        if (dropdown) dropdown.style.display = "none";
                    }, 200);
                };
            });
        const btns = contentEl.createDiv("rss-dashboard-modal-buttons");
        const saveBtn = btns.createEl("button", { text: "Save", cls: "rss-dashboard-primary-button" });
        const cancelBtn = btns.createEl("button", { text: "Cancel" });
        saveBtn.onclick = async () => {
            this.feed.title = title;
            this.feed.url = url;
            this.feed.folder = folder;
            await this.plugin.saveSettings();
            new Notice("Feed updated");
            this.close();
            this.onSave();
        };
        cancelBtn.onclick = () => this.close();
        
        setTimeout(() => {
            titleInput?.focus();
            titleInput?.select();
        }, 0);
    }
    onClose() {
        this.contentEl.empty();
    }
}

class AddFeedModal extends Modal {
    plugin: RssDashboardPlugin;
    onSave: () => void;
    constructor(app: App, plugin: RssDashboardPlugin, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Add Feed" });
        let url = "";
        let title = "";
        let status = "";
        let latestEntry = "";
        let folder = "";
        let allFolders = collectAllFolders(this.plugin.settings.folders);
        let titleInput: HTMLInputElement;
        let urlInput: HTMLInputElement;
        let folderInput: HTMLInputElement;
        let statusDiv: HTMLDivElement;
        let latestEntryDiv: HTMLDivElement;
        let dropdown: HTMLDivElement | null = null;
        
        new Setting(contentEl)
            .setName("Feed URL")
            .addText(text => {
                text.onChange(v => url = v);
                urlInput = text.inputEl;
                urlInput.autocomplete = "off";
                urlInput.spellcheck = false;
                urlInput.addEventListener("focus", () => urlInput.select());
                urlInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        titleInput?.focus();
                    } else if (e.key === "Escape") {
                        this.close();
                    }
                });
            })
            .addButton(btn => {
                btn.setButtonText("Load")
                    .onClick(async () => {
                        status = "Loading...";
                        if (statusDiv) statusDiv.textContent = status;
                        try {
                            const res = await (window as any).requestUrl({ url });
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(res.text, "text/xml");
                            const feedTitle = doc.querySelector("channel > title, feed > title");
                            title = feedTitle?.textContent || "";
                            if (titleInput) titleInput.value = title;
                            const latestItem = doc.querySelector("item > pubDate, entry > updated, entry > published");
                            if (latestItem) {
                                const date = new Date(latestItem.textContent!);
                                const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
                                latestEntry = daysAgo === 0 ? "Today" : `${daysAgo} days`;
                                if (latestEntryDiv) latestEntryDiv.textContent = latestEntry;
                            }
                            status = "OK";
                        } catch (e) {
                            status = "Error loading feed";
                        }
                        if (statusDiv) statusDiv.textContent = status;
                    });
            });
        
        new Setting(contentEl)
            .setName("Title")
            .addText(text => {
                titleInput = text.inputEl;
                text.setValue(title).onChange(v => title = v);
                titleInput.autocomplete = "off";
                titleInput.spellcheck = false;
                titleInput.addEventListener("focus", () => titleInput.select());
                titleInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        folderInput?.focus();
                    } else if (e.key === "Escape") {
                        this.close();
                    }
                });
            });
        
        latestEntryDiv = contentEl.createDiv({ text: latestEntry, cls: "add-feed-latest-entry" });
        
        statusDiv = contentEl.createDiv({ text: status, cls: "add-feed-status" });
        
        new Setting(contentEl)
            .setName("Folder")
            .addText(text => {
                folderInput = text.inputEl;
                text.setValue(folder).onChange(v => {
                    folder = v;
                    if (dropdown) {
                        
                        const filtered = allFolders.filter(f => f.toLowerCase().includes(v.toLowerCase()));
                        if (dropdown) {
                            dropdown.innerHTML = "";
                            filtered.forEach(f => {
                                if (dropdown) {
                                    const opt = dropdown.createDiv({ text: f, cls: "edit-feed-folder-option" });
                                    opt.onclick = () => {
                                        folder = f;
                                        text.setValue(f);
                                        if (dropdown) dropdown.style.display = "none";
                                    };
                                }
                            });
                            dropdown.style.display = filtered.length ? "block" : "none";
                        }
                    }
                });
                folderInput.autocomplete = "off";
                folderInput.spellcheck = false;
                folderInput.addEventListener("focus", () => folderInput.select());
                folderInput.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") {
                        saveBtn.click();
                    } else if (e.key === "Escape") {
                        this.close();
                    }
                });
                text.inputEl.onfocus = () => {
                    if (!dropdown) {
                        dropdown = contentEl.createDiv({ cls: "edit-feed-folder-dropdown" });
                        dropdown.style.position = "absolute";
                        dropdown.style.background = "var(--background-primary)";
                        dropdown.style.border = "1px solid var(--background-modifier-border, #ccc)";
                        dropdown.style.zIndex = "10000";
                        dropdown.style.width = folderInput.offsetWidth + "px";
                        dropdown.style.maxHeight = "180px";
                        dropdown.style.overflowY = "auto";
                        dropdown.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
                        dropdown.style.left = folderInput.getBoundingClientRect().left + "px";
                        dropdown.style.top = (folderInput.getBoundingClientRect().bottom + window.scrollY) + "px";
                        document.body.appendChild(dropdown);
                    }
                    
                    if (dropdown) {
                        dropdown.innerHTML = "";
                        allFolders.forEach(f => {
                            if (dropdown) {
                                const opt = dropdown.createDiv({ text: f, cls: "edit-feed-folder-option" });
                                opt.onclick = () => {
                                    folder = f;
                                    text.setValue(f);
                                    if (dropdown) dropdown.style.display = "none";
                                };
                            }
                        });
                        dropdown.style.display = allFolders.length ? "block" : "none";
                    }
                };
                text.inputEl.onblur = () => {
                    setTimeout(() => {
                        if (dropdown) dropdown.style.display = "none";
                    }, 200);
                };
            });
        
        const btns = contentEl.createDiv("rss-dashboard-modal-buttons");
        const saveBtn = btns.createEl("button", { text: "Save", cls: "rss-dashboard-primary-button" });
        const cancelBtn = btns.createEl("button", { text: "Cancel" });
        saveBtn.onclick = async () => {
            this.plugin.addFeed(title, url, folder);
            new Notice("Feed added");
            this.close();
            this.onSave();
        };
        cancelBtn.onclick = () => this.close();
        
        setTimeout(() => {
            urlInput?.focus();
            urlInput?.select();
        }, 0);
    }
    onClose() {
        this.contentEl.empty();
    }
}

export class FeedManagerModal extends Modal {
    plugin: RssDashboardPlugin;

    constructor(app: App, plugin: RssDashboardPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass("rss-dashboard-modal-container");
        contentEl.createEl("h2", { text: "Manage Feeds" });

        
        const addFeedBtn = contentEl.createEl("button", { text: "+ Add Feed", cls: "rss-dashboard-primary-button" });
        addFeedBtn.style.marginBottom = "1rem";
        addFeedBtn.onclick = () => {
            new AddFeedModal(this.app, this.plugin, () => this.onOpen()).open();
        };

        
        const allFolderPaths = collectAllFolders(this.plugin.settings.folders);
        
        const feedsByFolder: Record<string, Feed[]> = {};
        for (const path of allFolderPaths) feedsByFolder[path] = [];
        const uncategorized: Feed[] = [];
        for (const feed of this.plugin.settings.feeds) {
            if (feed.folder && allFolderPaths.includes(feed.folder)) {
                feedsByFolder[feed.folder].push(feed);
            } else {
                uncategorized.push(feed);
            }
        }

        
        for (const folderPath of allFolderPaths) {
            const folderDiv = contentEl.createDiv({ cls: "feed-manager-folder" });
            folderDiv.createEl("h3", { text: folderPath });
            const feeds = feedsByFolder[folderPath];
            if (feeds.length === 0) {
                folderDiv.createDiv({ text: "No feeds in this folder.", cls: "feed-manager-empty" });
            } else {
                for (const feed of feeds) {
                    this.renderFeedRow(folderDiv, feed);
                }
            }
        }
        
        if (uncategorized.length > 0) {
            const uncategorizedDiv = contentEl.createDiv({ cls: "feed-manager-folder" });
            uncategorizedDiv.createEl("h3", { text: "Uncategorized" });
            for (const feed of uncategorized) {
                this.renderFeedRow(uncategorizedDiv, feed);
            }
        }
    }

    renderFeedRow(parent: HTMLElement, feed: Feed) {
        const row = parent.createDiv({ cls: "feed-manager-row" });
        row.createDiv({ text: feed.title, cls: "feed-manager-title" });
        row.createDiv({ text: feed.url, cls: "feed-manager-url" });
        row.createDiv({ text: feed.folder || "Uncategorized", cls: "feed-manager-foldername" });
        
        const editBtn = row.createEl("button", { text: "Edit" });
        editBtn.onclick = () => {
            new EditFeedModal(this.app, this.plugin, feed, () => this.onOpen()).open();
        };
        
        const delBtn = row.createEl("button", { text: "Delete" });
        delBtn.onclick = async () => {
            this.showConfirmModal(`Delete feed '${feed.title}'?`, async () => {
                this.plugin.settings.feeds = this.plugin.settings.feeds.filter(f => f !== feed);
                await this.plugin.saveSettings();
                new Notice("Feed deleted");
                this.onOpen(); 
            });
        };
    }

    
    private showConfirmModal(message: string, onConfirm: () => void): void {
        document.querySelectorAll('.rss-dashboard-modal').forEach(el => el.remove());
        setTimeout(() => {
            const modal = document.createElement("div");
            modal.className = "rss-dashboard-modal";
            const modalContent = document.createElement("div");
            modalContent.className = "rss-dashboard-modal-content";
            const modalTitle = document.createElement("h2");
            modalTitle.textContent = "Confirm";
            const msg = document.createElement("div");
            msg.textContent = message;
            const buttonContainer = document.createElement("div");
            buttonContainer.className = "rss-dashboard-modal-buttons";
            const cancelButton = document.createElement("button");
            cancelButton.textContent = "Cancel";
            cancelButton.onclick = () => document.body.removeChild(modal);
            const okButton = document.createElement("button");
            okButton.textContent = "OK";
            okButton.className = "rss-dashboard-primary-button";
            okButton.onclick = () => {
                document.body.removeChild(modal);
                onConfirm();
            };
            buttonContainer.appendChild(cancelButton);
            buttonContainer.appendChild(okButton);
            modalContent.appendChild(modalTitle);
            modalContent.appendChild(msg);
            modalContent.appendChild(buttonContainer);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            setTimeout(() => okButton.focus(), 0);
        }, 0);
    }

    onClose() {
        this.contentEl.empty();
    }
} 