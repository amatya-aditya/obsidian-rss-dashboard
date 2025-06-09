import { Modal, App, Setting } from "obsidian";
import type RssDashboardPlugin from "../../main";

export class RssDashboardSettingsModal extends Modal {
    plugin: RssDashboardPlugin;

    constructor(app: App, plugin: RssDashboardPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass("rss-dashboard-modal-container");
        let firstInput: HTMLInputElement | HTMLTextAreaElement | null = null;
        
        new Setting(contentEl)
            .setName("View Style")
            .setDesc("Choose between list or card view for articles.")
            .addDropdown(drop =>
                drop
                    .addOption("list", "List")
                    .addOption("card", "Card")
                    .setValue(this.plugin.settings.viewStyle)
                    .onChange(async (value) => {
                        this.plugin.settings.viewStyle = value as any;
                        await this.plugin.saveSettings();
                    })
            );
        
        new Setting(contentEl)
            .setName("Refresh Interval (minutes)")
            .setDesc("How often to refresh feeds.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                if (!firstInput) firstInput = text.inputEl;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(this.plugin.settings.refreshInterval.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num)) {
                            this.plugin.settings.refreshInterval = num;
                            await this.plugin.saveSettings();
                        }
                    });
            });
        
        new Setting(contentEl)
            .setName("Max Items")
            .setDesc("Maximum number of articles to display.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(this.plugin.settings.maxItems.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num)) {
                            this.plugin.settings.maxItems = num;
                            await this.plugin.saveSettings();
                        }
                    });
            });
        
        new Setting(contentEl)
            .setName("Card Width (px)")
            .setDesc("Width of article cards in card view.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(this.plugin.settings.cardWidth.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num)) {
                            this.plugin.settings.cardWidth = num;
                            await this.plugin.saveSettings();
                        }
                    });
            });
        
        new Setting(contentEl)
            .setName("Card Height (px)")
            .setDesc("Height of article cards in card view.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(this.plugin.settings.cardHeight.toString())
                    .onChange(async (value) => {
                        const num = parseInt(value);
                        if (!isNaN(num)) {
                            this.plugin.settings.cardHeight = num;
                            await this.plugin.saveSettings();
                        }
                    });
            });
        
        new Setting(contentEl)
            .setName("Sidebar Collapsed by Default")
            .setDesc("Collapse the sidebar when opening the dashboard.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.sidebarCollapsed)
                    .onChange(async (value) => {
                        this.plugin.settings.sidebarCollapsed = value;
                        await this.plugin.saveSettings();
                    })
            );
        
        new Setting(contentEl)
            .setName("Dashboard View Location")
            .setDesc("Where to open the dashboard view.")
            .addDropdown(drop =>
                drop
                    .addOption("main", "Main")
                    .addOption("left-sidebar", "Left Sidebar")
                    .addOption("right-sidebar", "Right Sidebar")
                    .setValue(this.plugin.settings.viewLocation)
                    .onChange(async (value) => {
                        this.plugin.settings.viewLocation = value as any;
                        await this.plugin.saveSettings();
                    })
            );
        
        new Setting(contentEl)
            .setName("Reader View Location")
            .setDesc("Where to open the article reader view.")
            .addDropdown(drop =>
                drop
                    .addOption("main", "Main")
                    .addOption("left-sidebar", "Left Sidebar")
                    .addOption("right-sidebar", "Right Sidebar")
                    .setValue(this.plugin.settings.readerViewLocation)
                    .onChange(async (value) => {
                        this.plugin.settings.readerViewLocation = value as any;
                        await this.plugin.saveSettings();
                    })
            );
            
        
        new Setting(contentEl)
            .setName("Use Web Viewer")
            .setDesc("Open articles in the built-in web viewer.")
            .addToggle(toggle =>
                toggle
                    .setValue(this.plugin.settings.useWebViewer)
                    .onChange(async (value) => {
                        this.plugin.settings.useWebViewer = value;
                        await this.plugin.saveSettings();
                    })
            );
        
        contentEl.createEl("h3", { text: "Media Settings" });
        const media = this.plugin.settings.media;
        new Setting(contentEl)
            .setName("Default YouTube Folder")
            .setDesc("Folder for YouTube feeds.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(media.defaultYouTubeFolder)
                    .onChange(async (value) => {
                        media.defaultYouTubeFolder = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(contentEl)
            .setName("Default YouTube Tag")
            .setDesc("Tag for YouTube feeds.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(media.defaultYouTubeTag)
                    .onChange(async (value) => {
                        media.defaultYouTubeTag = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(contentEl)
            .setName("Default Podcast Folder")
            .setDesc("Folder for Podcast feeds.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(media.defaultPodcastFolder)
                    .onChange(async (value) => {
                        media.defaultPodcastFolder = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(contentEl)
            .setName("Default Podcast Tag")
            .setDesc("Tag for Podcast feeds.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(media.defaultPodcastTag)
                    .onChange(async (value) => {
                        media.defaultPodcastTag = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(contentEl)
            .setName("Auto-detect Media Type")
            .setDesc("Automatically detect media type for feeds.")
            .addToggle(toggle =>
                toggle
                    .setValue(media.autoDetectMediaType)
                    .onChange(async (value) => {
                        media.autoDetectMediaType = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(contentEl)
            .setName("Open in Split View")
            .setDesc("Open articles in split view by default.")
            .addToggle(toggle =>
                toggle
                    .setValue(media.openInSplitView)
                    .onChange(async (value) => {
                        media.openInSplitView = value;
                        await this.plugin.saveSettings();
                    })
            );
        
        contentEl.createEl("h3", { text: "Article Saving Settings" });
        const articleSaving = this.plugin.settings.articleSaving;
        new Setting(contentEl)
            .setName("Default Template")
            .setDesc("Template for saving articles.")
            .addTextArea(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(articleSaving.defaultTemplate)
                    .onChange(async (value) => {
                        articleSaving.defaultTemplate = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(contentEl)
            .setName("Default Folder")
            .setDesc("Folder to save articles in.")
            .addText(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(articleSaving.defaultFolder)
                    .onChange(async (value) => {
                        articleSaving.defaultFolder = value;
                        await this.plugin.saveSettings();
                    });
            });
        new Setting(contentEl)
            .setName("Add Saved Tag")
            .setDesc("Add a tag to saved articles.")
            .addToggle(toggle =>
                toggle
                    .setValue(articleSaving.addSavedTag)
                    .onChange(async (value) => {
                        articleSaving.addSavedTag = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(contentEl)
            .setName("Include Frontmatter")
            .setDesc("Include frontmatter in saved articles.")
            .addToggle(toggle =>
                toggle
                    .setValue(articleSaving.includeFrontmatter)
                    .onChange(async (value) => {
                        articleSaving.includeFrontmatter = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(contentEl)
            .setName("Frontmatter Template")
            .setDesc("Template for frontmatter in saved articles.")
            .addTextArea(text => {
                text.inputEl.autocomplete = "off";
                text.inputEl.spellcheck = false;
                text.inputEl.addEventListener("focus", () => text.inputEl.select());
                text.setValue(articleSaving.frontmatterTemplate)
                    .onChange(async (value) => {
                        articleSaving.frontmatterTemplate = value;
                        await this.plugin.saveSettings();
                    });
            });
        
        contentEl.createEl("h3", { text: "Display Settings" });
        const display = this.plugin.settings.display;
        new Setting(contentEl)
            .setName("Show Cover Image")
            .setDesc("Show cover images in article cards.")
            .addToggle(toggle =>
                toggle
                    .setValue(display.showCoverImage)
                    .onChange(async (value) => {
                        display.showCoverImage = value;
                        await this.plugin.saveSettings();
                    })
            );
        new Setting(contentEl)
            .setName("Show Summary")
            .setDesc("Show article summaries in cards and lists.")
            .addToggle(toggle =>
                toggle
                    .setValue(display.showSummary)
                    .onChange(async (value) => {
                        display.showSummary = value;
                        await this.plugin.saveSettings();
                    })
            );
        
        setTimeout(() => {
            if (firstInput) {
                firstInput.focus();
                firstInput.select();
            }
        }, 0);
    }

    onClose() {
        this.contentEl.empty();
    }
} 