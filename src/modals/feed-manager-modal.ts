import { Modal, App, Setting, Notice, requestUrl } from "obsidian";
import type RssDashboardPlugin from "../../main";
import type { Feed, Folder } from "../types/types";

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

export class EditFeedModal extends Modal {
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
        this.modalEl.addClasses(["rss-dashboard-modal", "rss-dashboard-modal-container"]);
        contentEl.empty();
        new Setting(contentEl).setName("Edit feed").setHeading();
        let title = this.feed.title;
        let url = this.feed.url;
        let folder = this.feed.folder || "";
        let status = "";
        let latestEntry = "-";
        const allFolders = collectAllFolders(this.plugin.settings.folders).sort((a, b) => a.localeCompare(b));
        let titleInput: HTMLInputElement;
        let urlInput: HTMLInputElement;
        let folderInput: HTMLInputElement;
        let statusDiv: HTMLDivElement;
        let latestEntryDiv: HTMLDivElement;
        let dropdown: HTMLDivElement | null = null;

        new Setting(contentEl)
            .setName("Feed URL")
            .addText(text => {
                text.setValue(url).onChange(v => url = v);
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
                            const res = await requestUrl(url);
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(res.text, "text/xml");
                            const feedTitle = doc.querySelector("channel > title, feed > title");
                            if (feedTitle?.textContent) {
                                title = feedTitle.textContent;
                                if (titleInput) titleInput.value = title;
                            }
                            const latestItem = doc.querySelector("item > pubDate, entry > updated, entry > published");
                            if (latestItem?.textContent) {
                                const date = new Date(latestItem.textContent);
                                const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
                                latestEntry = daysAgo === 0 ? "Today" : `${daysAgo} days ago`;
                            } else {
                                latestEntry = "N/A";
                            }
                            if (latestEntryDiv) latestEntryDiv.textContent = latestEntry;
                            status = "OK";
                        } catch (e) {
                            status = "Error loading feed";
                            latestEntry = "-";
                            if (latestEntryDiv) latestEntryDiv.textContent = latestEntry;
                        }
                        if (statusDiv) statusDiv.textContent = status;
                    });
            });

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
                        folderInput?.focus();
                    } else if (e.key === "Escape") {
                        this.close();
                    }
                });
            });

        const latestEntrySetting = new Setting(contentEl)
            .setName("Latest entry posted");
        latestEntryDiv = latestEntrySetting.controlEl.createDiv({ text: latestEntry, cls: "add-feed-latest-entry" });

        const statusSetting = new Setting(contentEl)
            .setName("Status");
        statusDiv = statusSetting.controlEl.createDiv({ text: status, cls: "add-feed-status" });

        new Setting(contentEl)
            .setName("Folder")
            .addText(text => {
                text.setValue(folder)
                    .setPlaceholder("Type or select folder...")
                    .inputEl.classList.add("edit-feed-folder-input", "custom-input");
                folderInput = text.inputEl;
                folderInput.autocomplete = "off";
                folderInput.spellcheck = false;
                folderInput.addEventListener("focus", () => {
                    if (!dropdown) {
                        dropdown = contentEl.createDiv({ cls: "edit-feed-folder-dropdown" });
                        dropdown.style.width = folderInput.offsetWidth + "px";
                        dropdown.style.left = folderInput.getBoundingClientRect().left + "px";
                        dropdown.style.top = (folderInput.getBoundingClientRect().bottom + window.scrollY) + "px";
                        document.body.appendChild(dropdown);
                    }
                    if (dropdown) {
                        dropdown.removeClass("hidden");
                        dropdown.addClass("visible");
                        while (dropdown.firstChild) {
                            dropdown.removeChild(dropdown.firstChild);
                        }
                        allFolders.forEach(f => {
                            if (dropdown) {
                                const opt = dropdown.createDiv({ text: f, cls: "edit-feed-folder-option" });
                                opt.onclick = () => {
                                    folder = f;
                                    text.setValue(f);
                                    if (dropdown) {
                                        dropdown.addClass("hidden");
                                        dropdown.removeClass("visible");
                                    }
                                    text.inputEl.blur();
                                };
                            }
                        });
                    }
                });
                text.onChange(v => {
                    folder = v;
                    if (dropdown) {
                        const filtered = allFolders.filter(f => f.toLowerCase().includes(v.toLowerCase()));
                        if (dropdown) {
                            while (dropdown.firstChild) {
                                dropdown.removeChild(dropdown.firstChild);
                            }
                            filtered.forEach(f => {
                                if (dropdown) {
                                    const opt = dropdown.createDiv({ text: f, cls: "edit-feed-folder-option" });
                                    opt.onclick = () => {
                                        folder = f;
                                        text.setValue(f);
                                        if (dropdown) {
                                            dropdown.addClass("hidden");
                                            dropdown.removeClass("visible");
                                        }
                                        text.inputEl.blur();
                                    };
                                }
                            });
                        }
                    }
                });
                text.inputEl.onblur = () => {
                    window.setTimeout(() => {
                        if (dropdown) dropdown.addClass("hidden");
                    }, 200);
                };
            });

        
        new Setting(contentEl).setName("Per feed control options").setHeading();
        
        let autoDeleteDuration = this.feed.autoDeleteDuration || 0;
        let maxItemsLimit = this.feed.maxItemsLimit || this.plugin.settings.maxItems;
        let scanInterval = this.feed.scanInterval || 0;

        
        const autoDeleteSetting = new Setting(contentEl)
            .setName("Auto delete articles duration")
            .setDesc("Days to keep articles before auto-delete");
        
        let autoDeleteDropdown: unknown = null;
        let autoDeleteCustomInput: HTMLInputElement | null = null;
        
        autoDeleteSetting.addDropdown(dropdown => {
            autoDeleteDropdown = dropdown;
            dropdown
                .addOption("0", "Disabled")
                .addOption("1", "1 day")
                .addOption("3", "3 days")
                .addOption("7", "1 week")
                .addOption("14", "2 weeks")
                .addOption("30", "1 month")
                .addOption("60", "2 months")
                .addOption("90", "3 months")
                .addOption("180", "6 months")
                .addOption("365", "1 year")
                .addOption("custom", "Custom...")
                .setValue(autoDeleteDuration === 0 ? "0" : 
                         [1, 3, 7, 14, 30, 60, 90, 180, 365].includes(autoDeleteDuration) ? 
                         autoDeleteDuration.toString() : "custom")
                .onChange(value => {
                    if (value === "custom") {
                        
                        if (!autoDeleteCustomInput) {
                            autoDeleteCustomInput = autoDeleteSetting.controlEl.createEl("input", {
                                type: "number",
                                placeholder: "Enter days",
                                cls: "custom-input"
                            });
                            autoDeleteCustomInput.min = "1";
                            autoDeleteCustomInput.value = autoDeleteDuration > 0 ? autoDeleteDuration.toString() : "";
                            autoDeleteCustomInput.addEventListener("change", (evt: Event) => {
                                const target = evt.target as HTMLInputElement;
                                autoDeleteDuration = parseInt(target.value) || 0;
                            });
                        }
                        if (autoDeleteCustomInput) {
                            autoDeleteCustomInput.removeClass("hidden");
                            autoDeleteCustomInput.addClass("visible");
                        }
                    } else {
                        
                        if (autoDeleteCustomInput) {
                            autoDeleteCustomInput.addClass("hidden");
                        }
                        autoDeleteDuration = parseInt(value) || 0;
                    }
                });
        });

        
        const maxItemsSetting = new Setting(contentEl)
            .setName("Max items limit")
            .setDesc("Maximum number of items to keep per feed");
        
        let maxItemsDropdown: unknown = null;
        let maxItemsCustomInput: HTMLInputElement | null = null;
        
        maxItemsSetting.addDropdown(dropdown => {
            maxItemsDropdown = dropdown;
            dropdown
                .addOption("0", "Unlimited")
                .addOption("10", "10 items")
                .addOption("25", "25 items")
                .addOption("50", "50 items")
                .addOption("100", "100 items")
                .addOption("200", "200 items")
                .addOption("500", "500 items")
                .addOption("1000", "1000 items")
                .addOption("custom", "Custom...")
                .setValue(maxItemsLimit === 0 ? "0" : 
                         [10, 25, 50, 100, 200, 500, 1000].includes(maxItemsLimit) ? 
                         maxItemsLimit.toString() : "custom")
                .onChange(value => {
                    if (value === "custom") {
                        
                        if (!maxItemsCustomInput) {
                            maxItemsCustomInput = maxItemsSetting.controlEl.createEl("input", {
                                type: "number",
                                placeholder: "Enter number",
                                cls: "custom-input"
                            });
                            maxItemsCustomInput.min = "1";
                            maxItemsCustomInput.addEventListener("change", (evt: Event) => {
                                const target = evt.target as HTMLInputElement;
                                maxItemsLimit = parseInt(target.value) || 0;
                            });
                        }
                        if (maxItemsCustomInput) {
                            maxItemsCustomInput.removeClass("hidden");
                            maxItemsCustomInput.addClass("visible");
                        }
                    } else {
                        
                        if (maxItemsCustomInput) {
                            maxItemsCustomInput.addClass("hidden");
                        }
                        maxItemsLimit = parseInt(value) || 0;
                    }
                });
        });

        
        const scanIntervalSetting = new Setting(contentEl)
            .setName("Scan interval")
            .setDesc("Custom scan interval in minutes");
        
        let scanIntervalDropdown: unknown = null;
        let scanIntervalCustomInput: HTMLInputElement | null = null;
        
        scanIntervalSetting.addDropdown(dropdown => {
            scanIntervalDropdown = dropdown;
            dropdown
                .addOption("0", "Use global setting")
                .addOption("5", "5 minutes")
                .addOption("10", "10 minutes")
                .addOption("15", "15 minutes")
                .addOption("30", "30 minutes")
                .addOption("60", "1 hour")
                .addOption("120", "2 hours")
                .addOption("240", "4 hours")
                .addOption("480", "8 hours")
                .addOption("720", "12 hours")
                .addOption("1440", "24 hours")
                .addOption("custom", "Custom...")
                .setValue(scanInterval === 0 ? "0" : 
                         [5, 10, 15, 30, 60, 120, 240, 480, 720, 1440].includes(scanInterval) ? 
                         scanInterval.toString() : "custom")
                .onChange(value => {
                    if (value === "custom") {
                        
                        if (!scanIntervalCustomInput) {
                            scanIntervalCustomInput = scanIntervalSetting.controlEl.createEl("input", {
                                type: "number",
                                placeholder: "Enter minutes",
                                cls: "custom-input"
                            });
                            scanIntervalCustomInput.min = "1";
                            scanIntervalCustomInput.addEventListener("change", (evt: Event) => {
                                const target = evt.target as HTMLInputElement;
                                scanInterval = parseInt(target.value) || 0;
                            });
                        }
                        if (scanIntervalCustomInput) {
                            scanIntervalCustomInput.removeClass("hidden");
                            scanIntervalCustomInput.addClass("visible");
                        }
                    } else {
                        
                        if (scanIntervalCustomInput) {
                            scanIntervalCustomInput.addClass("hidden");
                        }
                        scanInterval = parseInt(value) || 0;
                    }
                });
        });

        const btns = contentEl.createDiv("rss-dashboard-modal-buttons");
        const saveBtn = btns.createEl("button", { text: "Save", cls: "rss-dashboard-primary-button" });
        const cancelBtn = btns.createEl("button", { text: "Cancel" });
        saveBtn.onclick = async () => {
            const oldTitle = this.feed.title;
            this.feed.title = title;
            this.feed.url = url;
            this.feed.folder = folder;
            this.feed.autoDeleteDuration = autoDeleteDuration;
            
            // Update feedTitle for all articles in this feed when the title changes
            if (oldTitle !== title) {
                for (const item of this.feed.items) {
                    item.feedTitle = title;
                }
            }
            
            
            const oldMaxItemsLimit = this.feed.maxItemsLimit || this.plugin.settings.maxItems;
            const newMaxItemsLimit = maxItemsLimit || this.plugin.settings.maxItems;
            
            this.feed.maxItemsLimit = newMaxItemsLimit;
            this.feed.scanInterval = scanInterval;
            
            
            if (newMaxItemsLimit > 0 && this.feed.items.length > newMaxItemsLimit) {
                
                this.feed.items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
                this.feed.items = this.feed.items.slice(0, newMaxItemsLimit);
                new Notice(`Feed updated and trimmed to ${newMaxItemsLimit} articles`);
            } else {
                new Notice("Feed updated");
            }
            
            await this.plugin.saveSettings();
            this.close();
            this.onSave();
        };
        cancelBtn.onclick = () => this.close();
        
        window.setTimeout(() => {
            titleInput?.focus();
            titleInput?.select();
        }, 0);
    }
    onClose() {
        this.contentEl.empty();
    }
}

export class AddFeedModal extends Modal {
	folders: Folder[];
	onAdd: (title: string, url: string, folder: string, autoDeleteDuration?: number, maxItemsLimit?: number, scanInterval?: number) => Promise<void>;
	onSave: () => void;
	defaultFolder: string;
	plugin?: RssDashboardPlugin;

	constructor(app: App, folders: Folder[], onAdd: (title: string, url: string, folder: string, autoDeleteDuration?: number, maxItemsLimit?: number, scanInterval?: number) => Promise<void>, onSave: () => void, defaultFolder = "", plugin?: RssDashboardPlugin) {
		super(app);
		this.folders = folders;
		this.onAdd = onAdd;
		this.onSave = onSave;
		this.defaultFolder = defaultFolder;
		this.plugin = plugin || undefined;
	}
    onOpen() {
        const { contentEl } = this;
        this.modalEl.className += " rss-dashboard-modal rss-dashboard-modal-container";
        contentEl.empty();
        new Setting(contentEl).setName("Add feed").setHeading();
        let url = "";
        let title = "";
        let status = "";
        let latestEntry = "-";
        let folder = this.defaultFolder;
        let allFolders = collectAllFolders(this.folders).sort((a, b) => a.localeCompare(b));
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
                            const res = await requestUrl(url);
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
                            } else {
								latestEntry = "N/A";
							}
                            if (latestEntryDiv) latestEntryDiv.textContent = latestEntry;
                            status = "OK";
                        } catch (e) {
                            status = "Error loading feed";
							latestEntry = "-";
							if (latestEntryDiv) latestEntryDiv.textContent = latestEntry;
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

        const latestEntrySetting = new Setting(contentEl)
            .setName("Latest entry posted");
        latestEntryDiv = latestEntrySetting.controlEl.createDiv({ text: latestEntry, cls: "add-feed-latest-entry" });

        const statusSetting = new Setting(contentEl)
            .setName("Status");
        statusDiv = statusSetting.controlEl.createDiv({ text: status, cls: "add-feed-status" });
        
        
        
        new Setting(contentEl)
            .setName("Folder")
            .addText(text => {
                folderInput = text.inputEl;
                text.setValue(folder).onChange(v => {
                    folder = v;
                    if (dropdown) {
                        
                        const filtered = allFolders.filter(f => f.toLowerCase().includes(v.toLowerCase()));
                        if (dropdown) {
                            while (dropdown.firstChild) {
                                dropdown.removeChild(dropdown.firstChild);
                            }
                            filtered.forEach(f => {
                                if (dropdown) {
                                    const opt = dropdown.createDiv({ text: f, cls: "edit-feed-folder-option" });
                                    opt.onclick = () => {
                                        folder = f;
                                        text.setValue(f);
                                        if (dropdown) {
                                            dropdown.addClass("hidden");
                                            dropdown.removeClass("visible");
                                        }
                                        text.inputEl.blur();
                                    };
                                }
                            });
                        }
                    }
                });
                folderInput.autocomplete = "off";
                folderInput.spellcheck = false;
                folderInput.addEventListener("focus", () => {
                    if (!dropdown) {
                        dropdown = contentEl.createDiv({ cls: "edit-feed-folder-dropdown" });
                        dropdown.style.width = folderInput.offsetWidth + "px";
                        dropdown.style.left = folderInput.getBoundingClientRect().left + "px";
                        dropdown.style.top = (folderInput.getBoundingClientRect().bottom + window.scrollY) + "px";
                        document.body.appendChild(dropdown);
                    }
                    if (dropdown) {
                        dropdown.removeClass("hidden");
                        dropdown.addClass("visible");
                        while (dropdown.firstChild) {
                            dropdown.removeChild(dropdown.firstChild);
                        }
                        allFolders.forEach(f => {
                            if (dropdown) {
                                const opt = dropdown.createDiv({ text: f, cls: "edit-feed-folder-option" });
                                opt.onclick = () => {
                                    folder = f;
                                    text.setValue(f);
                                    if (dropdown) {
                                        dropdown.addClass("hidden");
                                        dropdown.removeClass("visible");
                                    }
                                    text.inputEl.blur();
                                };
                            }
                        });
                    }
                });
                text.inputEl.onblur = () => {
                    window.setTimeout(() => {
                        if (dropdown) dropdown.addClass("hidden");
                    }, 200);
                };
            });

        
        new Setting(contentEl).setName("Per feed control options").setHeading();
        
        let autoDeleteDuration = 0;
        let maxItemsLimit = this.plugin?.settings?.maxItems || 25;
        let scanInterval = 0;

        
        const autoDeleteSetting = new Setting(contentEl)
            .setName("Auto delete articles duration")
            .setDesc("Days to keep articles before auto-delete");
        
        let autoDeleteDropdown: unknown = null;
        let autoDeleteCustomInput: HTMLInputElement | null = null;
        
        autoDeleteSetting.addDropdown(dropdown => {
            autoDeleteDropdown = dropdown;
            dropdown
                .addOption("0", "Disabled")
                .addOption("1", "1 day")
                .addOption("3", "3 days")
                .addOption("7", "1 week")
                .addOption("14", "2 weeks")
                .addOption("30", "1 month")
                .addOption("60", "2 months")
                .addOption("90", "3 months")
                .addOption("180", "6 months")
                .addOption("365", "1 year")
                .addOption("custom", "Custom...")
                .setValue("0")
                .onChange(value => {
                    if (value === "custom") {
                        
                        if (!autoDeleteCustomInput) {
                            autoDeleteCustomInput = autoDeleteSetting.controlEl.createEl("input", {
                                type: "number",
                                placeholder: "Enter days",
                                cls: "custom-input"
                            });
                            autoDeleteCustomInput.min = "1";
                            autoDeleteCustomInput.value = autoDeleteDuration > 0 ? autoDeleteDuration.toString() : "";
                            autoDeleteCustomInput.addEventListener("change", (evt: Event) => {
                                const target = evt.target as HTMLInputElement;
                                autoDeleteDuration = parseInt(target.value) || 0;
                            });
                        }
                        if (autoDeleteCustomInput) {
                            autoDeleteCustomInput.removeClass("hidden");
                            autoDeleteCustomInput.addClass("visible");
                        }
                    } else {
                        
                        if (autoDeleteCustomInput) {
                            autoDeleteCustomInput.addClass("hidden");
                        }
                        autoDeleteDuration = parseInt(value) || 0;
                    }
                });
        });

        
        const maxItemsSetting = new Setting(contentEl)
            .setName("Max items limit")
            .setDesc("Maximum number of items to keep per feed");
        
        let maxItemsDropdown: unknown = null;
        let maxItemsCustomInput: HTMLInputElement | null = null;
        
        maxItemsSetting.addDropdown(dropdown => {
            maxItemsDropdown = dropdown;
            dropdown
                .addOption("0", "Unlimited")
                .addOption("10", "10 items")
                .addOption("25", "25 items")
                .addOption("50", "50 items")
                .addOption("100", "100 items")
                .addOption("200", "200 items")
                .addOption("500", "500 items")
                .addOption("1000", "1000 items")
                .addOption("custom", "Custom...")
                .setValue(maxItemsLimit === 0 ? "0" : 
                         [10, 25, 50, 100, 200, 500, 1000].includes(maxItemsLimit) ? 
                         maxItemsLimit.toString() : "custom")
                .onChange(value => {
                    if (value === "custom") {
                        
                        if (!maxItemsCustomInput) {
                            maxItemsCustomInput = maxItemsSetting.controlEl.createEl("input", {
                                type: "number",
                                placeholder: "Enter number",
                                cls: "custom-input"
                            });
                            maxItemsCustomInput.min = "1";
                            maxItemsCustomInput.value = maxItemsLimit > 0 ? maxItemsLimit.toString() : "";
                            maxItemsCustomInput.addEventListener("change", (evt: Event) => {
                                const target = evt.target as HTMLInputElement;
                                maxItemsLimit = parseInt(target.value) || 0;
                            });
                        }
                        if (maxItemsCustomInput) {
                            maxItemsCustomInput.removeClass("hidden");
                            maxItemsCustomInput.addClass("visible");
                        }
                    } else {
                        
                        if (maxItemsCustomInput) {
                            maxItemsCustomInput.addClass("hidden");
                        }
                        maxItemsLimit = parseInt(value) || 0;
                    }
                });
        });

        
        const scanIntervalSetting = new Setting(contentEl)
            .setName("Scan interval")
            .setDesc("Custom scan interval in minutes");
        
        let scanIntervalDropdown: unknown = null;
        let scanIntervalCustomInput: HTMLInputElement | null = null;
        
        scanIntervalSetting.addDropdown(dropdown => {
            scanIntervalDropdown = dropdown;
            dropdown
                .addOption("0", "Use global setting")
                .addOption("5", "5 minutes")
                .addOption("10", "10 minutes")
                .addOption("15", "15 minutes")
                .addOption("30", "30 minutes")
                .addOption("60", "1 hour")
                .addOption("120", "2 hours")
                .addOption("240", "4 hours")
                .addOption("480", "8 hours")
                .addOption("720", "12 hours")
                .addOption("1440", "24 hours")
                .addOption("custom", "Custom...")
                .setValue("0")
                .onChange(value => {
                    if (value === "custom") {
                        
                        if (!scanIntervalCustomInput) {
                            scanIntervalCustomInput = scanIntervalSetting.controlEl.createEl("input", {
                                type: "number",
                                placeholder: "Enter minutes",
                                cls: "custom-input"
                            });
                            scanIntervalCustomInput.min = "1";
                            scanIntervalCustomInput.value = scanInterval > 0 ? scanInterval.toString() : "";
                            scanIntervalCustomInput.addEventListener("change", (evt: Event) => {
                                const target = evt.target as HTMLInputElement;
                                scanInterval = parseInt(target.value) || 0;
                            });
                        }
                        if (scanIntervalCustomInput) {
                            scanIntervalCustomInput.removeClass("hidden");
                            scanIntervalCustomInput.addClass("visible");
                        }
                    } else {
                        
                        if (scanIntervalCustomInput) {
                            scanIntervalCustomInput.addClass("hidden");
                        }
                        scanInterval = parseInt(value) || 0;
                    }
                });
        });
        
        const btns = contentEl.createDiv({ cls: "rss-dashboard-modal-buttons" });
        const saveBtn = btns.createEl("button", { text: "Save", cls: "rss-dashboard-primary-button" });
        const cancelBtn = btns.createEl("button", { text: "Cancel" });
        saveBtn.onclick = async () => {
            if (!url) {
                new Notice("Feed URL cannot be empty");
                return;
            }
            if (!title) {
                new Notice("Title cannot be empty");
                return;
            }
            this.onAdd(title, url, folder, autoDeleteDuration, maxItemsLimit, scanInterval);
            this.onSave();
            this.close();
        };
        cancelBtn.onclick = () => this.close();
        
        window.setTimeout(() => {
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
        this.modalEl.className += " rss-dashboard-modal rss-dashboard-modal-container";
        contentEl.empty();
        new Setting(contentEl).setName("Manage feeds").setHeading();

        
        const addFeedBtn = contentEl.createEl("button", { text: "+ Add Feed", cls: "rss-dashboard-primary-button feed-manager-add-button" });
        addFeedBtn.onclick = () => {
            new AddFeedModal(
				this.app, 
				this.plugin.settings.folders,
				(title, url, folder, autoDeleteDuration, maxItemsLimit, scanInterval) => this.plugin.addFeed(title, url, folder, autoDeleteDuration, maxItemsLimit, scanInterval),
				() => this.onOpen(),
				"",
				this.plugin
			).open();
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
            new Setting(folderDiv).setName(folderPath).setHeading();
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
            new Setting(uncategorizedDiv).setName("Uncategorized").setHeading();
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
        window.setTimeout(() => {
            const modal = document.body.createDiv({
                cls: "rss-dashboard-modal"
            });
            const modalContent = modal.createDiv({
                cls: "rss-dashboard-modal-content"
            });
            new Setting(modalContent).setName("Confirm").setHeading();
            const msg = modalContent.createDiv({
                text: message
            });
            const buttonContainer = modalContent.createDiv({
                cls: "rss-dashboard-modal-buttons"
            });
            const cancelButton = buttonContainer.createEl("button", {
                text: "Cancel"
            });
            cancelButton.onclick = () => document.body.removeChild(modal);
            const okButton = buttonContainer.createEl("button", {
                text: "OK",
                cls: "rss-dashboard-primary-button"
            });
            okButton.onclick = () => {
                document.body.removeChild(modal);
                onConfirm();
            };
            window.setTimeout(() => okButton.focus(), 0);
        }, 0);
    }

    onClose() {
        this.contentEl.empty();
    }
} 
