import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import RssDashboardPlugin from "./../../main";
import { Tag, ViewLocation, Feed } from "../types/types";
import { EditFeedModal } from "../modals/feed-manager-modal";

export class RssDashboardSettingTab extends PluginSettingTab {
    plugin: RssDashboardPlugin;

    constructor(app: App, plugin: RssDashboardPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();


        
        const dataSection = containerEl.createDiv();
        dataSection.createEl("h3", { text: "Backup & Restore" });
        const exportBtn = dataSection.createEl("button", { text: "Export data.json" });
        exportBtn.onclick = async () => {
            const data = await this.plugin.saveData ? this.plugin.settings : null;
            if (data) {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "rss-dashboard-data.json";
                a.click();
                URL.revokeObjectURL(url);
            }
        };
        const importBtn = dataSection.createEl("button", { text: "Import data.json" });
        importBtn.onclick = async () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.onchange = async (e) => {
                const file = input.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                    const data = JSON.parse(text);
                    this.plugin.settings = Object.assign({}, this.plugin.settings, data);
                    await this.plugin.saveSettings();
                    if (this.plugin.view) this.plugin.view.render();
                    new Notice("Data imported successfully!");
                } catch (err) {
                    new Notice("Invalid data.json file");
                }
            };
            input.click();
        };
        
        this.createGeneralSettings(containerEl);
        this.createDisplaySettings(containerEl);
        this.createMediaSettings(containerEl);
        this.createArticleSavingSettings(containerEl);
        this.createImportExportSettings(containerEl);
        this.createTagsSettings(containerEl);
    }

    

    private createGeneralSettings(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "General Settings" });

        new Setting(containerEl)
            .setName("View Style")
            .setDesc("Choose between list and card view for articles")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("list", "List View")
                    .addOption("card", "Card View")
                    .setValue(this.plugin.settings.viewStyle)
                    .onChange(async (value: "list" | "card") => {
                        this.plugin.settings.viewStyle = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.view) {
                            this.plugin.view.render();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Dashboard View Location")
            .setDesc("Choose where to open the RSS Dashboard")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("main", "Main View")
                    .addOption("right-sidebar", "Right Sidebar")
                    .addOption("left-sidebar", "Left Sidebar")
                    .setValue(this.plugin.settings.viewLocation)
                    .onChange(async (value: ViewLocation) => {
                        this.plugin.settings.viewLocation = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Reader View Location")
            .setDesc("Choose where to open articles/media when clicked")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("main", "Main View (Split)")
                    .addOption("right-sidebar", "Right Sidebar")
                    .addOption("left-sidebar", "Left Sidebar")
                    .setValue(this.plugin.settings.readerViewLocation || "main")
                    .onChange(async (value: ViewLocation) => {
                        this.plugin.settings.readerViewLocation = value;
                        await this.plugin.saveSettings();
                    })
            );
            
        new Setting(containerEl)
            .setName("Use Web Viewer")
            .setDesc("Use Obsidian's core web viewer for articles when available")
            .addToggle(toggle => 
                toggle
                    .setValue(this.plugin.settings.useWebViewer || false)
                    .onChange(async (value) => {
                        this.plugin.settings.useWebViewer = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Refresh Interval")
            .setDesc("How often to refresh feeds (in minutes)")
            .addSlider((slider) =>
                slider
                    .setLimits(5, 120, 5)
                    .setValue(this.plugin.settings.refreshInterval)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.refreshInterval = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Maximum Items")
            .setDesc("Maximum number of items to display per feed")
            .addSlider((slider) =>
                slider
                    .setLimits(10, 500, 10)
                    .setValue(this.plugin.settings.maxItems)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.maxItems = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.view) {
                            this.plugin.view.render();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Page size for 'All Articles'")
            .setDesc("Number of articles to load at a time in the 'All Articles' view.")
            .addSlider((slider) => {
                slider
                    .setLimits(20, 200, 10)
                    .setValue(this.plugin.settings.allArticlesPageSize)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.allArticlesPageSize = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Page size for 'Unread Items'")
            .setDesc("Number of unread articles to load at a time.")
            .addSlider((slider) => {
                slider
                    .setLimits(20, 200, 10)
                    .setValue(this.plugin.settings.unreadArticlesPageSize)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.unreadArticlesPageSize = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Page size for 'Read Items'")
            .setDesc("Number of read articles to load at a time.")
            .addSlider((slider) => {
                slider
                    .setLimits(20, 200, 10)
                    .setValue(this.plugin.settings.readArticlesPageSize)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.readArticlesPageSize = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Page size for 'Saved Items'")
            .setDesc("Number of saved articles to load at a time.")
            .addSlider((slider) => {
                slider
                    .setLimits(20, 200, 10)
                    .setValue(this.plugin.settings.savedArticlesPageSize)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.savedArticlesPageSize = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("Page size for 'Starred Items'")
            .setDesc("Number of starred articles to load at a time.")
            .addSlider((slider) => {
                slider
                    .setLimits(20, 200, 10)
                    .setValue(this.plugin.settings.starredArticlesPageSize)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.starredArticlesPageSize = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private createDisplaySettings(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "Display Settings" });

        new Setting(containerEl)
            .setName("Show Cover Images")
            .setDesc("Display cover images for articles in reader view")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.display.showCoverImage)
                    .onChange(async (value) => {
                        this.plugin.settings.display.showCoverImage = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Show Summary")
            .setDesc("Display content summary in card view")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.display.showSummary)
                    .onChange(async (value) => {
                        this.plugin.settings.display.showSummary = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.view && this.plugin.settings.viewStyle === "card") {
                            this.plugin.view.render();
                        }
                    })
            );

        
        containerEl.createEl("h4", { text: "Card View Settings" });
    }

    private createMediaSettings(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "Media Settings" });
        
        new Setting(containerEl)
            .setName("Auto-detect Media Type")
            .setDesc("Automatically detect if feeds are YouTube, podcasts, or regular articles")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.media.autoDetectMediaType)
                    .onChange(async (value) => {
                        this.plugin.settings.media.autoDetectMediaType = value;
                        await this.plugin.saveSettings();
                    })
            );
        
        
        containerEl.createEl("h4", { text: "YouTube Settings" });
        
        new Setting(containerEl)
            .setName("Default YouTube Folder")
            .setDesc("Default folder for YouTube feeds")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.media.defaultYouTubeFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.media.defaultYouTubeFolder = value;
                        await this.plugin.saveSettings();
                    })
            );
            
        new Setting(containerEl)
            .setName("Default YouTube Tag")
            .setDesc("Default tag for YouTube videos")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.media.defaultYouTubeTag)
                    .onChange(async (value) => {
                        this.plugin.settings.media.defaultYouTubeTag = value;
                        await this.plugin.saveSettings();
                    })
            );
            
        
        containerEl.createEl("h4", { text: "Podcast Settings" });
        
        new Setting(containerEl)
            .setName("Default Podcast Folder")
            .setDesc("Default folder for podcast feeds")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.media.defaultPodcastFolder)
                    .onChange(async (value) => {
                        this.plugin.settings.media.defaultPodcastFolder = value;
                        await this.plugin.saveSettings();
                    })
            );
            
        new Setting(containerEl)
            .setName("Default Podcast Tag")
            .setDesc("Default tag for podcast episodes")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.media.defaultPodcastTag)
                    .onChange(async (value) => {
                        this.plugin.settings.media.defaultPodcastTag = value;
                        await this.plugin.saveSettings();
                    })
            );
    }

    private createArticleSavingSettings(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "Article Saving Settings" });
        
        new Setting(containerEl)
            .setName("Save path")
            .setDesc("Default folder to save articles")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.articleSaving.defaultFolder)
                    .onChange(async (value) => {
                        
                        const normalizedPath = value.replace(/^\/+|\/+$/g, '');
                        this.plugin.settings.articleSaving.defaultFolder = normalizedPath;
                        await this.plugin.saveSettings();
                    })
            );
            
        new Setting(containerEl)
            .setName("Add 'saved' Tag")
            .setDesc("Automatically add a 'saved' tag to saved articles")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.articleSaving.addSavedTag)
                    .onChange(async (value) => {
                        this.plugin.settings.articleSaving.addSavedTag = value;
                        await this.plugin.saveSettings();
                    })
            );
            
        new Setting(containerEl)
            .setName("Save Full Content")
            .setDesc("Fetch and save the full article content from the web (instead of just the RSS summary)")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.articleSaving.saveFullContent)
                    .onChange(async (value) => {
                        this.plugin.settings.articleSaving.saveFullContent = value;
                        await this.plugin.saveSettings();
                    })
            );
            
        new Setting(containerEl)
            .setName("Fetch Timeout")
            .setDesc("Timeout in seconds for fetching full article content (prevents hanging)")
            .addSlider((slider) => {
                slider
                    .setLimits(5, 30, 1)
                    .setValue(this.plugin.settings.articleSaving.fetchTimeout || 10)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.articleSaving.fetchTimeout = value;
                        await this.plugin.saveSettings();
                    });
            });
        
        
        containerEl.createEl("h4", { text: "Article Templates" });
        
        const templateContainer = containerEl.createDiv();
        
        const templateLabel = new Setting(templateContainer)
            .setName("Default Article Template")
            .setDesc("Template for saved articles. Use variables like {{title}}, {{content}}, {{link}}, etc.");
            
        const templateInput = document.createElement("textarea");
        templateInput.value = this.plugin.settings.articleSaving.defaultTemplate;
        templateInput.rows = 10;
        templateInput.addClass("rss-dashboard-template-input");
        templateInput.addEventListener("change", async () => {
            this.plugin.settings.articleSaving.defaultTemplate = templateInput.value;
            await this.plugin.saveSettings();
        });
        
        templateContainer.appendChild(templateInput);
        
        
        const variablesHelp = containerEl.createEl("div", { 
            cls: "setting-item-description",
            text: "Available variables: {{title}}, {{content}}, {{link}}, {{date}}, {{isoDate}}, {{source}}, {{author}}, {{summary}}, {{tags}}, {{feedTitle}}, {{guid}}"
        });
    }

    private createImportExportSettings(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "Import/Export" });

        const opmlContainer = containerEl.createDiv({
            cls: "rss-dashboard-opml-container",
        });

        new Setting(opmlContainer)
            .setName("Import OPML")
            .setDesc("Import RSS feeds from an OPML file")
            .addButton((button) =>
                button.setButtonText("Import OPML").onClick(() => {
                    this.plugin.importOpml();
                })
            );

        new Setting(opmlContainer)
            .setName("Export OPML")
            .setDesc("Export your RSS feeds to an OPML file")
            .addButton((button) =>
                button.setButtonText("Export OPML").onClick(() => {
                    this.plugin.exportOpml();
                })
            );
    }

    

    private createTagsSettings(containerEl: HTMLElement): void {
        containerEl.createEl("h3", { text: "Tags Management" });

        const tagsContainer = containerEl.createDiv({
            cls: "rss-dashboard-tags-container",
        });

        for (let i = 0; i < this.plugin.settings.availableTags.length; i++) {
            const tag = this.plugin.settings.availableTags[i];

            const tagSetting = new Setting(tagsContainer)
                .setName(tag.name)
                .addColorPicker((colorPicker) =>
                    colorPicker.setValue(tag.color).onChange(async (value) => {
                        this.plugin.settings.availableTags[i].color = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.view) {
                            this.plugin.view.render();
                        }
                    })
                )
                .addButton((button) =>
                    button
                        .setIcon("trash")
                        .setTooltip("Delete Tag")
                        .onClick(async () => {
                            this.plugin.settings.availableTags.splice(i, 1);
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );
        }

        
        containerEl.createEl("h4", { text: "Add New Tag" });

        const newTagContainer = containerEl.createDiv();

        const tagNameSetting = new Setting(newTagContainer)
            .setName("Tag Name")
            .addText((text) => text.setPlaceholder("Enter tag name"));

        const tagColorSetting = new Setting(newTagContainer)
            .setName("Tag Color")
            .addColorPicker((colorPicker) => colorPicker.setValue("#3498db"));

        new Setting(newTagContainer).addButton((button) =>
            button.setButtonText("Add Tag").onClick(async () => {
                const name = (tagNameSetting.components[0] as any).inputEl
                    .value;
                const color = (tagColorSetting.components[0] as any).getValue();

                if (!name) {
                    return;
                }

                this.plugin.settings.availableTags.push({
                    name,
                    color,
                });

                await this.plugin.saveSettings();
                this.display();
            })
        );
    }
}


function showConfirmModal(message: string, onConfirm: () => void) {
    document.querySelectorAll('.rss-dashboard-modal').forEach(el => el.remove());
    setTimeout(() => {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal rss-dashboard-modal-container";
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