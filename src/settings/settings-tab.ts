import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import RssDashboardPlugin from "./../../main";
import { ViewLocation, RssDashboardSettings } from "../types/types";

export class RssDashboardSettingTab extends PluginSettingTab {
    plugin: RssDashboardPlugin;
    private currentTab = "General";
    private tabNames = [
        "General",
        "Display",
        "Media",
        "Article saving",
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
            case "Article saving":
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
            .setName("View style")
            .setDesc("Choose between list and card view for articles")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("list", "List view")
                    .addOption("card", "Card view")
                    .setValue(this.plugin.settings.viewStyle)
                    .onChange(async (value: string) => {
                        this.plugin.settings.viewStyle = value as "list" | "card";
                        await this.plugin.saveSettings();
                        const view = await this.plugin.getActiveDashboardView();
                        if (view) {
                            await this.app.workspace.revealLeaf(view.leaf);
                            view.render();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Dashboard view location")
            .setDesc("Choose where to open the RSS dashboard")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("main", "Main view")
                    .addOption("right-sidebar", "Right sidebar")
                    .addOption("left-sidebar", "Left sidebar")
                    .setValue(this.plugin.settings.viewLocation)
                    .onChange(async (value: string) => {
                        this.plugin.settings.viewLocation = value as ViewLocation;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Reader view location")
            .setDesc("Choose where to open articles/media when clicked")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("main", "Main view (split)")
                    .addOption("right-sidebar", "Right sidebar")
                    .addOption("left-sidebar", "Left sidebar")
                    .setValue(this.plugin.settings.readerViewLocation || "main")
                    .onChange(async (value: string) => {
                        this.plugin.settings.readerViewLocation = value as ViewLocation;
                        await this.plugin.saveSettings();
                    })
            );
            
        new Setting(containerEl)
            .setName("Use web viewer")
            .setDesc("Use web viewer core plugin for articles when available")
            .addToggle(toggle => 
                toggle
                    .setValue(this.plugin.settings.useWebViewer || false)
                    .onChange(async (value) => {
                        this.plugin.settings.useWebViewer = value;
                        await this.plugin.saveSettings();
                    })
            );

        new Setting(containerEl)
            .setName("Refresh interval")
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
            .setName("Maximum items")
            .setDesc("Maximum number of items to display per feed")
            .addSlider((slider) =>
                slider
                    .setLimits(10, 500, 10)
                    .setValue(this.plugin.settings.maxItems)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.maxItems = value;
                        await this.plugin.saveSettings();
                        const view = await this.plugin.getActiveDashboardView();
                        if (view) {
                            await this.app.workspace.revealLeaf(view.leaf);
                            view.render();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Page size for 'all articles'")
            .setDesc("Number of articles to load at a time in the 'all articles' view.")
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
            .setName("Page size for 'unread items'")
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
            .setName("Page size for 'read items'")
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
            .setName("Page size for 'saved items'")
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
            .setName("Page size for 'starred items'")
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
            .setName("Show cover images")
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
            .setName("Show summary")
            .setDesc("Display content summary in card view")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.display.showSummary)
                    .onChange(async (value) => {
                        this.plugin.settings.display.showSummary = value;
                        await this.plugin.saveSettings();
                        const view = await this.plugin.getActiveDashboardView();
                        if (view && this.plugin.settings.viewStyle === "card") {
                            await this.app.workspace.revealLeaf(view.leaf);
                            view.render();
                        }
                    })
            );

            new Setting(containerEl)
            .setName("Use domain favicons")
            .setDesc("Show domain-specific favicons instead of generic RSS icons for feeds")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.display.useDomainFavicons)
                    .onChange(async (value) => {
                        this.plugin.settings.display.useDomainFavicons = value;
                        await this.plugin.saveSettings();
                        const view = await this.plugin.getActiveDashboardView();
                        if (view?.sidebar) {
                            await this.app.workspace.revealLeaf(view.leaf);
                            view.sidebar.render();
                        }
                    })
            );

        new Setting(containerEl)
            .setName("Filter display style")
            .setDesc("Choose how to display the filter buttons in the sidebar")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("vertical", "Vertical list")
                    .addOption("inline", "Inline icons")
                    .setValue(this.plugin.settings.display.filterDisplayStyle)
                    .onChange(async (value: string) => {
                        this.plugin.settings.display.filterDisplayStyle = value as "vertical" | "inline";
                        await this.plugin.saveSettings();
                        const view = await this.plugin.getActiveDashboardView();
                        if (view?.sidebar) {
                            await this.app.workspace.revealLeaf(view.leaf);
                            view.sidebar.render();
                        }
                    })
            );

        

        new Setting(containerEl)
            .setName("Default filter")
            .setDesc("Choose which filter to show by default when opening the dashboard")
            .addDropdown((dropdown) =>
                dropdown
                    .addOption("all", "All items")
                    .addOption("starred", "Starred items")
                    .addOption("unread", "Unread items")
                    .addOption("read", "Read items")
                    .addOption("saved", "Saved items")
                    .addOption("videos", "Videos")
                    .addOption("podcasts", "Podcasts")
                    .setValue(this.plugin.settings.display.defaultFilter)
                    .onChange(async (value: string) => {
                        this.plugin.settings.display.defaultFilter = value as "all" | "starred" | "unread" | "read" | "saved" | "videos" | "podcasts";
                        
                        // If the new default filter is hidden, show a warning
                        const hiddenFilters = this.plugin.settings.display.hiddenFilters || [];
                        if (hiddenFilters.includes(value)) {
                            new Notice(`Warning: "${value}" filter is currently hidden. Consider showing it first.`);
                        }
                        
                        await this.plugin.saveSettings();
                        const view = await this.plugin.getActiveDashboardView();
                        if (view?.sidebar) {
                            await this.app.workspace.revealLeaf(view.leaf);
                            view.sidebar.render();
                        }
                    })
            );

        // Add separator
        containerEl.createEl("hr", { cls: "rss-dashboard-settings-separator" });

        // Filter visibility settings
        new Setting(containerEl).setName("Filter visibility").setHeading();
        containerEl.createEl("p", { 
            text: "Choose which filter items to show or hide in the sidebar:",
            cls: "rss-dashboard-settings-description"
        });



        const filterOptions = [
            { key: "starred", label: "Starred items", icon: "star" },
            { key: "unread", label: "Unread items", icon: "circle" },
            { key: "read", label: "Read items", icon: "check-circle" },
            { key: "saved", label: "Saved items", icon: "save" },
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
                                const view = await this.plugin.getActiveDashboardView();
                                if (view?.sidebar && 
                                    view.currentFolder === filter.key) {
                                    view.currentFolder = null;
                                }
                            }
                            await this.plugin.saveSettings();
                            const view = await this.plugin.getActiveDashboardView();
                            if (view?.sidebar) {
                                await this.app.workspace.revealLeaf(view.leaf);
                                view.sidebar.render();
                            }
                        })
                );
        });

    
        containerEl.createEl("p", { 
            text: "The 'all items' filter cannot be hidden as it's always required.",
            cls: "rss-dashboard-settings-note"
        });
    }

    private createMediaSettings(containerEl: HTMLElement): void {
        
        new Setting(containerEl)
            .setName("Auto-detect media type")
            .setDesc("Automatically detect if feeds are YouTube, podcasts, or regular articles")
            .addToggle((toggle) =>
                toggle
                    .setValue(this.plugin.settings.media.autoDetectMediaType)
                    .onChange(async (value) => {
                        this.plugin.settings.media.autoDetectMediaType = value;
                        await this.plugin.saveSettings();
                    })
            );
        
        
        new Setting(containerEl).setName("YouTube").setHeading();
        
        new Setting(containerEl)
            .setName("Default YouTube folder")
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
            .setName("Default YouTube tag")
            .setDesc("Default tag for YouTube videos")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.media.defaultYouTubeTag)
                    .onChange(async (value) => {
                        this.plugin.settings.media.defaultYouTubeTag = value;
                        await this.plugin.saveSettings();
                    })
            );
            
        
        new Setting(containerEl).setName("Podcast").setHeading();
        
        new Setting(containerEl)
            .setName("Default podcast folder")
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
            .setName("Default podcast tag")
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
            .setName("Add 'saved' tag")
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
            .setName("Save full content")
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
            .setName("Fetch timeout")
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
        
        
        new Setting(containerEl).setName("Article templates").setHeading();
        
        const templateContainer = containerEl.createDiv();
        
        new Setting(templateContainer)
            .setName("Default article template")
            .setDesc("Template for saved articles. Use variables like {{title}}, {{content}}, {{link}}, etc.");
            
        const templateInput = templateContainer.createEl("textarea", {
            attr: { rows: "10" },
            cls: "rss-dashboard-template-input"
        });
        templateInput.value = this.plugin.settings.articleSaving.defaultTemplate;
        templateInput.addEventListener("change", () => {
            void (async () => {
                this.plugin.settings.articleSaving.defaultTemplate = templateInput.value;
                await this.plugin.saveSettings();
            })();
        });
        
        templateContainer.appendChild(templateInput);
        
        containerEl.createEl("div", { 
            cls: "setting-item-description",
            text: "Available variables: {{title}}, {{content}}, {{link}}, {{date}}, {{isoDate}}, {{source}}, {{author}}, {{summary}}, {{tags}}, {{feedTitle}}, {{guid}}"
        });
    }

    private createImportExportTab(containerEl: HTMLElement): void {
       
        const dataSection = containerEl.createDiv();
        new Setting(dataSection).setName("Backup & restore (data.json)").setHeading();
        
        const dataBtnRow = dataSection.createDiv({ cls: "rss-dashboard-import-export-btn-row" });
        const exportBtn = dataBtnRow.createEl("button", { 
            text: "Export data.json",
            cls: "rss-dashboard-import-export-btn"
        });
        exportBtn.onclick = () => {
            const data = this.plugin.settings;
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.body.createEl("a", {
                attr: {
                    href: url,
                    download: "rss-dashboard-data.json"
                }
            });
            a.click();
            URL.revokeObjectURL(url);
        };
        
        const importBtn = dataBtnRow.createEl("button", { 
            text: "Import data.json",
            cls: "rss-dashboard-import-export-btn"
        });
        importBtn.onclick = () => {
            const input = document.body.createEl("input", {
                attr: {
                    type: "file",
                    accept: ".json,application/json"
                }
            });
            input.onchange = () => {
                void (async () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    try {
                        const data = JSON.parse(text) as Partial<RssDashboardSettings>;
                        this.plugin.settings = Object.assign({}, this.plugin.settings, data);
                        await this.plugin.saveSettings();
                        const view = await this.plugin.getActiveDashboardView();
                        if (view) {
                            await this.app.workspace.revealLeaf(view.leaf);
                            view.render();
                        }
                        new Notice("Data imported successfully!");
                    } catch {
                        new Notice("Invalid data.json file");
                    }
                })();
            };
            input.click();
        };

       
        const opmlSection = containerEl.createDiv();
        new Setting(opmlSection).setName("OPML").setHeading();
        
        const opmlBtnRow = opmlSection.createDiv({ cls: "rss-dashboard-import-export-btn-row" });
        const importOpmlBtn = opmlBtnRow.createEl("button", { 
            text: "Import opml",
            cls: "rss-dashboard-import-export-btn"
        });
        importOpmlBtn.onclick = () => this.plugin.importOpml();
        
        const exportOpmlBtn = opmlBtnRow.createEl("button", { 
            text: "Export opml",
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

            new Setting(tagsContainer)
                .setName(tag.name)
                .addColorPicker((colorPicker) =>
                    colorPicker.setValue(tag.color).onChange(async (value) => {
                        this.plugin.settings.availableTags[i].color = value;
                        await this.plugin.saveSettings();
                        const view = await this.plugin.getActiveDashboardView();
                        if (view) {
                            await this.app.workspace.revealLeaf(view.leaf);
                            view.render();
                        }
                    })
                )
                .addButton((button) =>
                    button
                        .setIcon("trash")
                        .setTooltip("Delete tag")
                        .onClick(async () => {
                            this.plugin.settings.availableTags.splice(i, 1);
                            await this.plugin.saveSettings();
                            this.display();
                        })
                );
        }

        
        new Setting(containerEl).setName("Add new tag").setHeading();

        const newTagContainer = containerEl.createDiv();

        const tagNameSetting = new Setting(newTagContainer)
            .setName("Tag name")
            .addText((text) => text.setPlaceholder("Enter tag name"));

        const tagColorSetting = new Setting(newTagContainer)
            .setName("Tag color")
            .addColorPicker((colorPicker) => colorPicker.setValue("#3498db"));

        new Setting(newTagContainer).addButton((button) =>
            button.setButtonText("Add tag").onClick(async () => {
                const nameInput = tagNameSetting.components[0] as unknown as { inputEl: HTMLInputElement };
                const name = nameInput.inputEl.value;
                const colorPicker = tagColorSetting.components[0] as unknown as { getValue: () => string };
                const color = colorPicker.getValue();

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
        containerEl.createEl("div", { 
            cls: "rss-dashboard-support-message",
            text: "If you enjoy using this plugin, consider supporting development! ❤️ " 
        });
        
        const btnRow = containerEl.createDiv({ cls: "rss-dashboard-support-btn-row" });
        
       
        const bmcBtn = btnRow.createEl("a", { 
            text: "Buy me a pizza 🍕", 
            href: "https://www.buymeacoffee.com/amatya_aditya", 
            cls: "rss-dashboard-support-btn rss-dashboard-bmc-btn" 
        });
        bmcBtn.target = "_blank";
        
     
        const kofiBtn = btnRow.createEl("a", { 
            text: "Ko-fi 💙", 
            href: "https://ko-fi.com/Y8Y41FV4WI", 
            cls: "rss-dashboard-support-btn rss-dashboard-kofi-btn" 
        });
        kofiBtn.target = "_blank";
        
    }
}
