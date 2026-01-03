import { App, Notice, TFile, setIcon, Setting } from "obsidian";
import { FeedItem, ArticleSavingSettings } from "../types/types";

interface WebViewerPlugin {
    openWebpage?(url: string, title: string): Promise<void>;
    currentTitle?: string;
    currentUrl?: string;
    cleanedHtml?: string;
}

interface ObsidianPlugins {
    plugins: {
        [key: string]: unknown;
        "webpage-html-export"?: WebViewerPlugin;
    };
}

interface ObsidianApp extends App {
    plugins: ObsidianPlugins;
}

export class WebViewerIntegration {
    private app: ObsidianApp;
    private settings: ArticleSavingSettings;
    
    constructor(app: ObsidianApp, settings: ArticleSavingSettings) {
        this.app = app;
        this.settings = settings;
    }
    
    
    async openInWebViewer(url: string, title: string): Promise<boolean> {
        
        const webViewerPlugin = this.app.plugins.plugins["webpage-html-export"];
        
        if (webViewerPlugin?.openWebpage) {
            try {
                await webViewerPlugin.openWebpage(url, title);
                
                
                window.setTimeout(() => {
                    this.addCustomSaveButton();
                }, 1000);
                
                return true;
            } catch (error) {
                
                new Notice(`Error opening URL in web viewer: ${error instanceof Error ? error.message : 'Unknown error'}`);
                return false;
            }
        }
        
        return false;
    }
    
    
    private addCustomSaveButton(): void {
        
        const webViewerContainer = document.querySelector(".webpage-container");
        if (!webViewerContainer) return;
        
        
        if (webViewerContainer.querySelector(".rss-custom-save-button")) return;
        
        
        let controlBar = webViewerContainer.querySelector(".webpage-control-bar");
        if (!controlBar) {
            controlBar = webViewerContainer.createDiv({
                cls: "webpage-control-bar"
            });
            webViewerContainer.prepend(controlBar);
        }
        
        
        const saveButton = controlBar.createEl("button", {
            cls: "rss-custom-save-button"
        });
        const iconSpan = saveButton.createSpan({
            cls: "rss-custom-save-button-icon"
        });
        setIcon(iconSpan, "save");
        saveButton.createSpan({
            text: "Save with template"
        });
        
        
        saveButton.title = "Save with custom template";
        
        
        saveButton.addEventListener("click", () => {
            this.showSaveDialog();
        });
        
        
        controlBar.appendChild(saveButton);
    }
    
    
    private showSaveDialog(): void {
        
        const webViewerPlugin = this.app.plugins.plugins["webpage-html-export"];
        if (!webViewerPlugin) return;
        
        const title = webViewerPlugin.currentTitle || "Untitled";
        const url = webViewerPlugin.currentUrl || "";
        const content = webViewerPlugin.cleanedHtml || "";
        
        const modal = document.body.createDiv({
            cls: "rss-dashboard-modal"
        });
        
        const modalContent = modal.createDiv({
            cls: "rss-dashboard-modal-content"
        });
        
        new Setting(modalContent).setName("Save with template").setHeading();
        
        const folderLabel = modalContent.createEl("label", {
            text: "Save to folder:"
        });
        
        const folderInput = modalContent.createEl("input", {
            attr: {
                type: "text",
                placeholder: "Enter folder path",
                value: this.settings.defaultFolder || "RSS articles/",
                autocomplete: "off"
            }
        });
        folderInput.spellcheck = false;
        folderInput.addEventListener("focus", () => folderInput.select());
        
        const templateLabel = modalContent.createEl("label", {
            text: "Use template:"
        });
        
        const templateInput = modalContent.createEl("textarea", {
            attr: {
                placeholder: "Enter template",
                rows: "6",
                autocomplete: "off"
            }
        });
        templateInput.spellcheck = false;
        templateInput.value = this.settings.defaultTemplate || "---\ntitle: {{title}}\n---\n\n# {{title}}\n\n#rss #{{feedTitle}}\n\n{{content}}";
        templateInput.addEventListener("focus", () => templateInput.select());
        
        const includeFrontmatterCheck = modalContent.createDiv({
            cls: "rss-dashboard-checkbox"
        });
        
        const frontmatterCheckbox = includeFrontmatterCheck.createEl("input", {
            attr: {
                type: "checkbox",
                id: "include-frontmatter"
            }
        });
        frontmatterCheckbox.checked = this.settings.includeFrontmatter !== false;
        
        includeFrontmatterCheck.createEl("label", {
            attr: { htmlFor: "include-frontmatter" },
            text: "Include frontmatter"
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
        
        const saveButton = buttonContainer.createEl("button", {
            text: "Save",
            cls: "rss-dashboard-primary-button"
        });
        saveButton.addEventListener("click", () => {
            void (async () => {
            const folder = folderInput.value.trim();
            const template = templateInput.value.trim();
            const includeFrontmatter = frontmatterCheckbox.checked;
            
            try {
                await this.saveArticle({
                    title,
                    link: url,
                    description: content,
                    pubDate: new Date().toUTCString(),
                    guid: url,
                    feedTitle: "Web viewer",
                    feedUrl: "",
                    coverImage: "",
                    read: true,
                    starred: false,
                    tags: [],
                    saved: false
                }, folder, template, includeFrontmatter);
                
                document.body.removeChild(modal);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Error saving article: ${message}`);
            }
            })();
        });
        
        
        folderInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                templateInput.focus();
            } else if (e.key === "Escape") {
                document.body.removeChild(modal);
            }
        });
        templateInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                saveButton.click();
                e.preventDefault();
            } else if (e.key === "Escape") {
                document.body.removeChild(modal);
            }
        });
        
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveButton);
        
        modalContent.appendChild(folderLabel);
        modalContent.appendChild(folderInput);
        modalContent.appendChild(templateLabel);
        modalContent.appendChild(templateInput);
        modalContent.appendChild(includeFrontmatterCheck);
        modalContent.appendChild(buttonContainer);
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        
        requestAnimationFrame(() => {
            folderInput.focus();
            folderInput.select();
        });
    }
    
    
    private async saveArticle(
        item: FeedItem,
        folder: string,
        template: string,
        includeFrontmatter: boolean
    ): Promise<TFile | null> {
        if (folder) {
            await this.ensureFolderExists(folder);
        }
            
            
            const filename = this.sanitizeFilename(item.title);
            const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
            
            
            if (this.app.vault.getAbstractFileByPath(filePath) !== null) {
                new Notice(`File already exists: ${filename}`);
                return null;
            }
            
            
            let content = '';
            
            
            if (includeFrontmatter) {
                content += this.generateFrontmatter(item);
            }
            
            
            content += this.applyTemplate(item, template);
            
            
            const file = await this.app.vault.create(filePath, content);
            
            new Notice(`Article saved: ${filename}`);
            
            
            
        
        return file;
    }
    
    
    private generateFrontmatter(item: FeedItem): string {
        
        let frontmatter = this.settings.frontmatterTemplate;
        
        if (!frontmatter) {
            frontmatter = `---
title: "{{title}}"
date: {{date}}
tags: [{{tags}}]
source: "{{source}}"
link: {{link}}
author: "{{author}}"
feedTitle: "{{feedTitle}}"
guid: "{{guid}}"
---
`;
        }
        
        let tagsString = "";
        if (item.tags && item.tags.length > 0) {
            tagsString = item.tags.map(tag => tag.name).join(", ");
        }
        
        
        if (this.settings.addSavedTag && !tagsString.toLowerCase().includes("saved")) {
            tagsString = tagsString ? `${tagsString}, saved` : "saved";
        }
        
        
        frontmatter = frontmatter
            .replace(/{{title}}/g, item.title.replace(/"/g, '\\"'))
            .replace(/{{date}}/g, new Date().toISOString())
            .replace(/{{tags}}/g, tagsString)
            .replace(/{{source}}/g, (item.feedTitle || "Web viewer").replace(/"/g, '\\"'))
            .replace(/{{link}}/g, item.link)
            .replace(/{{author}}/g, (item.author || '').replace(/"/g, '\\"'))
            .replace(/{{feedTitle}}/g, (item.feedTitle || "Web viewer").replace(/"/g, '\\"'))
            .replace(/{{guid}}/g, item.guid.replace(/"/g, '\\"'));
            
        return frontmatter;
    }
    
    
    private sanitizeFilename(name: string): string {
        return name
            .replace(/[/\\:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 100); 
    }
    
    
    private applyTemplate(item: FeedItem, template: string): string {
        
        const formattedDate = new Date().toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long', 
            day: 'numeric'
        });
        
        
        return template
            .replace(/{{title}}/g, item.title)
            .replace(/{{date}}/g, formattedDate)
            .replace(/{{isoDate}}/g, new Date().toISOString())
            .replace(/{{link}}/g, item.link)
            .replace(/{{author}}/g, item.author || '')
            .replace(/{{source}}/g, item.feedTitle || 'Web viewer')
            .replace(/{{summary}}/g, item.summary || '')
            .replace(/{{content}}/g, item.description);
    }
    

    private async ensureFolderExists(folderPath: string): Promise<void> {
        if (!folderPath || folderPath.trim() === '') {
            return;
        }

        if (this.app.vault.getAbstractFileByPath(folderPath) === null) {
            await this.app.vault.createFolder(folderPath);
        }
    }
}
