import { App, Notice, TFile, setIcon } from "obsidian";
import { FeedItem, ArticleSavingSettings } from "../types/types";

interface WebViewerPlugin {
    openWebpage(url: string, title: string): Promise<void>;
}

interface ObsidianPlugins {
    plugins: {
        [key: string]: any;
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
        
        const webViewerPlugin = this.app.plugins.plugins["webpage-html-export"] as WebViewerPlugin | undefined;
        
        if (webViewerPlugin) {
            try {
                await webViewerPlugin.openWebpage(url, title);
                
                
                setTimeout(() => {
                    this.addCustomSaveButton();
                }, 1000);
                
                return true;
            } catch (error) {
                console.error("Error opening URL in web viewer:", error);
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
            controlBar = document.createElement("div");
            controlBar.className = "webpage-control-bar";
            webViewerContainer.prepend(controlBar);
        }
        
        
        const saveButton = document.createElement("button");
        saveButton.className = "rss-custom-save-button";
        const iconSpan = document.createElement("span");
        setIcon(iconSpan, "save");
        iconSpan.addClass("rss-custom-save-button-icon");
        const labelSpan = document.createElement("span");
        labelSpan.textContent = "Save with Template";
        saveButton.appendChild(iconSpan);
        saveButton.appendChild(labelSpan);
        
        
        saveButton.title = "Save with custom template";
        
        
        saveButton.addEventListener("click", () => {
            this.showSaveDialog();
        });
        
        
        controlBar.appendChild(saveButton);
    }
    
    
    private showSaveDialog(): void {
        
        // @ts-ignore - Accessing internal API
        const webViewerPlugin = this.app.plugins.plugins["webpage-html-export"];
        if (!webViewerPlugin) return;
        
        // @ts-ignore - Accessing internal API
        const title = webViewerPlugin.currentTitle || "Untitled";
        // @ts-ignore - Accessing internal API
        const url = webViewerPlugin.currentUrl || "";
        // @ts-ignore - Accessing internal API
        const content = webViewerPlugin.cleanedHtml || "";
        
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal";
        
        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";
        
        const modalTitle = document.createElement("h2");
        modalTitle.textContent = "Save with Template";
        
        const folderLabel = document.createElement("label");
        folderLabel.textContent = "Save to Folder:";
        
        const folderInput = document.createElement("input");
        folderInput.type = "text";
        folderInput.placeholder = "Enter folder path";
        folderInput.value = this.settings.defaultFolder || "RSS Articles/";
        folderInput.autocomplete = "off";
        folderInput.spellcheck = false;
        folderInput.addEventListener("focus", () => folderInput.select());
        
        const templateLabel = document.createElement("label");
        templateLabel.textContent = "Use Template:";
        
        const templateInput = document.createElement("textarea");
        templateInput.placeholder = "Enter template";
        templateInput.value = this.settings.defaultTemplate || "---\ntitle: {{title}}\n---\n\n# {{title}}\n\n#rss #{{feedTitle}}\n\n{{content}}";
        templateInput.rows = 6;
        templateInput.autocomplete = "off";
        templateInput.spellcheck = false;
        templateInput.addEventListener("focus", () => templateInput.select());
        
        const includeFrontmatterCheck = document.createElement("div");
        includeFrontmatterCheck.className = "rss-dashboard-checkbox";
        
        const frontmatterCheckbox = document.createElement("input");
        frontmatterCheckbox.type = "checkbox";
        frontmatterCheckbox.id = "include-frontmatter";
        frontmatterCheckbox.checked = this.settings.includeFrontmatter !== false; 
        
        const frontmatterLabel = document.createElement("label");
        frontmatterLabel.htmlFor = "include-frontmatter";
        frontmatterLabel.textContent = "Include Frontmatter";
        
        includeFrontmatterCheck.appendChild(frontmatterCheckbox);
        includeFrontmatterCheck.appendChild(frontmatterLabel);
        
        const buttonContainer = document.createElement("div");
        buttonContainer.className = "rss-dashboard-modal-buttons";
        
        const cancelButton = document.createElement("button");
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });
        
        const saveButton = document.createElement("button");
        saveButton.textContent = "Save";
        saveButton.className = "rss-dashboard-primary-button";
        saveButton.addEventListener("click", async () => {
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
                    feedTitle: "Web Viewer",
                    feedUrl: "",
                    coverImage: "",
                    read: true,
                    starred: false,
                    tags: [],
                    saved: false
                }, folder, template, includeFrontmatter);
                
                document.body.removeChild(modal);
            } catch (error) {
                console.error("Error saving article:", error);
                new Notice(`Error saving article: ${error.message}`);
            }
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
        
        modalContent.appendChild(modalTitle);
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
        try {
            
            if (folder) {
                await this.ensureFolderExists(folder);
            }
            
            
            const filename = this.sanitizeFilename(item.title);
            const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
            
            
            if (await this.app.vault.adapter.exists(filePath)) {
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
        } catch (error) {
            console.error("Error saving article:", error);
            throw error;
        }
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
            .replace(/{{source}}/g, (item.feedTitle || "Web Viewer").replace(/"/g, '\\"'))
            .replace(/{{link}}/g, item.link)
            .replace(/{{author}}/g, (item.author || '').replace(/"/g, '\\"'))
            .replace(/{{feedTitle}}/g, (item.feedTitle || "Web Viewer").replace(/"/g, '\\"'))
            .replace(/{{guid}}/g, item.guid.replace(/"/g, '\\"'));
            
        return frontmatter;
    }
    
    
    private sanitizeFilename(name: string): string {
        return name
            .replace(/[\/\\:*?"<>|]/g, '_')
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
            .replace(/{{source}}/g, item.feedTitle || 'Web Viewer')
            .replace(/{{summary}}/g, item.summary || '')
            .replace(/{{content}}/g, item.description);
    }
    
   
    private async ensureFolderExists(folderPath: string): Promise<void> {
        const folders = folderPath.split('/').filter(p => p.length > 0);
        let currentPath = '';
        
        for (const folder of folders) {
            currentPath += folder;
            
            
            if (!(await this.app.vault.adapter.exists(currentPath))) {
                await this.app.vault.createFolder(currentPath);
            }
            
            currentPath += '/';
        }
    }
}
