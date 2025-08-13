import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import RssDashboardPlugin from "./../../main";
import { Tag, ViewLocation, Feed } from "../types/types";
import { EditFeedModal } from "../modals/feed-manager-modal";

export class RssDashboardSettingTab extends PluginSettingTab {
    plugin: RssDashboardPlugin;
    private currentTab: string = "General";
    private tabNames = [
        "General",
        "Display",
        "Media",
        "Article Saving",
        "Import/Export",
        "Tags",
        "Support"
    ];

    constructor(app: App, plugin: RssDashboardPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();


        const tabBar = containerEl.createDiv("rss-dashboard-settings-tab-bar");
        this.tabNames.forEach(tab => {
            const tabBtn = tabBar.createEl("button", {
                text: tab,
                cls: "rss-dashboard-settings-tab-btn" + (this.currentTab === tab ? " active" : "")
            });
            tabBtn.onclick = () => {
                this.currentTab = tab;
                this.display();
            };
        });

    
        const tabContent = containerEl.createDiv("rss-dashboard-settings-tab-content");
        switch (this.currentTab) {
            case "General":
                this.createGeneralSettings(tabContent);
                break;
            case "Display":
                this.createDisplaySettings(tabContent);
                break;
            case "Media":
                this.createMediaSettings(tabContent);
                break;
            case "Article Saving":
                this.createArticleSavingSettings(tabContent);
                break;
            case "Import/Export":
                this.createImportExportTab(tabContent);
                break;
            case "Tags":
                this.createTagsSettings(tabContent);
                break;
            case "Support":
                this.createSupportTab(tabContent);
                break;
        }
    }

    private createGeneralSettings(containerEl: HTMLElement): void {

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

            new Setting(containerEl)
            .setName("Use Domain Favicons")
            .setDesc("Show domain-specific favicons instead of generic RSS icons for feeds")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.display.useDomainFavicons)
                    .onChange(async (value) => {
                        this.plugin.settings.display.useDomainFavicons = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.view?.sidebar) {
                            this.plugin.view.sidebar.render();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Filter Display Style")
            .setDesc("Choose how to display the filter buttons in the sidebar")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("vertical", "Vertical List")
                    .addOption("inline", "Inline Icons")
                    .setValue(this.plugin.settings.display.filterDisplayStyle)
                    .onChange(async (value: "vertical" | "inline") => {
                        this.plugin.settings.display.filterDisplayStyle = value;
                        await this.plugin.saveSettings();
                        if (this.plugin.view?.sidebar) {
                            this.plugin.view.sidebar.render();
                        }
                    })
            );

        

        new Setting(containerEl)
            .setName("Default Filter")
            .setDesc("Choose which filter to show by default when opening the dashboard")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("all", "All Items")
                    .addOption("starred", "Starred Items")
                    .addOption("unread", "Unread Items")
                    .addOption("read", "Read Items")
                    .addOption("saved", "Saved Items")
                    .addOption("videos", "Videos")
                    .addOption("podcasts", "Podcasts")
                    .setValue(this.plugin.settings.display.defaultFilter)
                    .onChange(async (value: "all" | "starred" | "unread" | "read" | "saved" | "videos" | "podcasts") => {
                        this.plugin.settings.display.defaultFilter = value;
                        
                        // If the new default filter is hidden, show a warning
                        const hiddenFilters = this.plugin.settings.display.hiddenFilters || [];
                        if (hiddenFilters.includes(value)) {
                            new Notice(`Warning: "${value}" filter is currently hidden. Consider showing it first.`);
                        }
                        
                        await this.plugin.saveSettings();
                        if (this.plugin.view?.sidebar) {
                            this.plugin.view.sidebar.render();
                        }
                    })
            );

        // Add separator
        containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

        // Filter visibility settings
        containerEl.createEl("h4", { text: "Filter Visibility" });
        containerEl.createEl("p", { 
            text: "Choose which filter items to show or hide in the sidebar:",
            cls: "rss-dashboard-settings-description"
        });



        const filterOptions = [
            { key: "starred", label: "Starred Items", icon: "star" },
            { key: "unread", label: "Unread Items", icon: "circle" },
            { key: "read", label: "Read Items", icon: "check-circle" },
            { key: "saved", label: "Saved Items", icon: "save" },
            { key: "videos", label: "Videos", icon: "play" },
            { key: "podcasts", label: "Podcasts", icon: "mic" }
        ];

        filterOptions.forEach(filter => {
            // Ensure hiddenFilters array exists and initialize if needed
            if (!this.plugin.settings.display.hiddenFilters) {
                this.plugin.settings.display.hiddenFilters = [];
            }
            
            const isHidden = this.plugin.settings.display.hiddenFilters.includes(filter.key);
            new Setting(containerEl)
                .setName(filter.label)
                .setDesc(`${isHidden ? "Hidden" : "Visible"} in sidebar`)
                .addToggle((toggle) =>
                    toggle
                        .setValue(!isHidden)
                        .onChange(async (value) => {
                            // Ensure hiddenFilters array exists
                            if (!this.plugin.settings.display.hiddenFilters) {
                                this.plugin.settings.display.hiddenFilters = [];
                            }
                            
                            if (value) {
                                // Show filter - remove from hidden list
                                this.plugin.settings.display.hiddenFilters = 
                                    this.plugin.settings.display.hiddenFilters.filter(f => f !== filter.key);
                            } else {
                                // Hide filter - add to hidden list
                                if (!this.plugin.settings.display.hiddenFilters.includes(filter.key)) {
                                    this.plugin.settings.display.hiddenFilters.push(filter.key);
                                }
                                
                                // If we're hiding the currently selected filter, reset to "all"
                                if (this.plugin.view?.sidebar && 
                                    this.plugin.view.currentFolder === filter.key) {
                                    this.plugin.view.currentFolder = null;
                                }
                            }
                            await this.plugin.saveSettings();
                            if (this.plugin.view?.sidebar) {
                                this.plugin.view.sidebar.render();
                            }
                        })
                );
        });

        // Note about "All Items" filter
        containerEl.createEl("p", { 
            text: "Note: The 'All Items' filter cannot be hidden as it's always required.",
            cls: "rss-dashboard-settings-note"
        });
    }

    private createMediaSettings(containerEl: HTMLElement): void {
        
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

    private createImportExportTab(containerEl: HTMLElement): void {
       
        const dataSection = containerEl.createDiv();
        dataSection.createEl("h4", { text: "Backup & Restore (data.json)" });
        
        const dataBtnRow = dataSection.createDiv({ cls: "rss-dashboard-import-export-btn-row" });
        const exportBtn = dataBtnRow.createEl("button", { 
            text: "Export data.json",
            cls: "rss-dashboard-import-export-btn"
        });
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
        
        const importBtn = dataBtnRow.createEl("button", { 
            text: "Import data.json",
            cls: "rss-dashboard-import-export-btn"
        });
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

       
        const opmlSection = containerEl.createDiv();
        opmlSection.createEl("h4", { text: "Import/Export OPML" });
        
        const opmlBtnRow = opmlSection.createDiv({ cls: "rss-dashboard-import-export-btn-row" });
        const importOpmlBtn = opmlBtnRow.createEl("button", { 
            text: "Import OPML",
            cls: "rss-dashboard-import-export-btn"
        });
        importOpmlBtn.onclick = () => this.plugin.importOpml();
        
        const exportOpmlBtn = opmlBtnRow.createEl("button", { 
            text: "Export OPML",
            cls: "rss-dashboard-import-export-btn"
        });
        exportOpmlBtn.onclick = () => this.plugin.exportOpml();
    }

    private createTagsSettings(containerEl: HTMLElement): void {

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

    private createSupportTab(containerEl: HTMLElement): void {
        
        const supportMessage = containerEl.createEl("div", { 
            cls: "rss-dashboard-support-message",
            text: "❤️ If you enjoy using this plugin, consider supporting development!" 
        });
        
        const btnRow = containerEl.createDiv({ cls: "rss-dashboard-support-btn-row" });
        
       
        const bmcBtn = btnRow.createEl("a", { 
            text: "🍕 Buy me a pizza", 
            href: "https://www.buymeacoffee.com/amatya_aditya", 
            cls: "rss-dashboard-support-btn rss-dashboard-bmc-btn" 
        });
        bmcBtn.target = "_blank";
        
     
        const kofiBtn = btnRow.createEl("a", { 
            text: "💙 Ko-fi", 
            href: "https://ko-fi.com/Y8Y41FV4WI", 
            cls: "rss-dashboard-support-btn rss-dashboard-kofi-btn" 
        });
        kofiBtn.target = "_blank";
        
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