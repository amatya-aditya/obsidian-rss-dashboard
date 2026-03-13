import { TFile, App, Notice } from "obsidian";
import { FeedItem, ArticleSavingSettings } from "../types/types";
import TurndownService from "turndown";
import { Readability } from "@mozilla/readability";
import { ensureUtf8Meta, robustFetch } from '../utils/platform-utils';

export class ArticleSaver {
    private app: App;
    private settings: ArticleSavingSettings;
    private turndownService: TurndownService;
    
    constructor(app: App, settings: ArticleSavingSettings) {
        this.app = app;
        this.settings = settings;
        this.turndownService = new TurndownService();

        this.turndownService.addRule('math', {
            filter: function (node: Node) {
                return node.nodeName === 'SPAN' && (node as Element).classList.contains('math');
            },
            replacement: function (content: string, node: Node) {
                return node.textContent || '';
            }
        });
    }
    
   
    private cleanHtml(html: string): string {
        try {
            
            const htmlWithMeta = ensureUtf8Meta(html);
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlWithMeta, "text/html");
            
            
            const elementsToRemove = doc.querySelectorAll(
                "script, style, iframe, .ad, .ads, .advertisement, " +
                "div[class*='ad-'], div[id*='ad-'], div[class*='ads-'], div[id*='ads-']"
            );
            elementsToRemove.forEach(el => el.remove());
            
            
            const svgElements = doc.querySelectorAll("svg");
            svgElements.forEach(el => el.remove());
            
            
            const imgElements = doc.querySelectorAll("img");
            imgElements.forEach(img => {
                const src = img.getAttribute("src");
                if (src && !src.startsWith("http") && !src.startsWith("data:")) {
                    
                    if (src.startsWith("/")) {
                        
                        const baseUrl = new URL(location.href);
                        img.setAttribute("src", `${baseUrl.origin}${src}`);
                    }
                }
                
                
                if (!img.hasAttribute("alt")) {
                    img.setAttribute("alt", "Image");
                }
            });
            
            
            const linkElements = doc.querySelectorAll("a");
            linkElements.forEach(link => {
                link.setAttribute("target", "_blank");
                link.setAttribute("rel", "noopener noreferrer");
            });
            
            
            const tableElements = doc.querySelectorAll("table");
            tableElements.forEach(table => {
                table.classList.add("markdown-compatible-table");
            });
            
            return new XMLSerializer().serializeToString(doc.body);
        } catch {
            
            return html;
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
---`;
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
            .replace(/{{source}}/g, item.feedTitle.replace(/"/g, '\\"'))
            .replace(/{{link}}/g, item.link)
            .replace(/{{author}}/g, (item.author || '').replace(/"/g, '\\"'))
            .replace(/{{feedTitle}}/g, item.feedTitle.replace(/"/g, '\\"'))
            .replace(/{{guid}}/g, item.guid.replace(/"/g, '\\"'));
        
        
        if (item.mediaType === 'video' && item.videoId) {
            frontmatter = frontmatter.replace("---\n", `---\nmediaType: video\nvideoId: "${item.videoId}"\n`);
        } else if (item.mediaType === 'podcast' && item.audioUrl) {
            frontmatter = frontmatter.replace("---\n", `---\nmediaType: podcast\naudioUrl: "${item.audioUrl}"\n`);
        }
        
        
        return frontmatter + '\n';
    }
    
    
    private sanitizeFilename(name: string): string {
        
        const sanitized = name
            .replace(/[/\\:*?"<>|]/g, '') 
            .replace(/\s+/g, ' ') 
            .trim(); 

        
        const words = sanitized.split(' ');
        const shortened = words.slice(0, 5).join(' ');
        return shortened.substring(0, 50);
    }
    
    
    private applyTemplate(item: FeedItem, template: string, rawContent?: string): string {
        
        const content = rawContent || this.cleanHtml(item.description);
        
        
        const formattedDate = new Date(item.pubDate).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long', 
            day: 'numeric'
        });
        
        
        let tagsString = "";
        if (item.tags && item.tags.length > 0) {
            tagsString = item.tags.map(tag => tag.name).join(", ");
        }
        
        
        if (this.settings.addSavedTag && !tagsString.toLowerCase().includes("saved")) {
            tagsString = tagsString ? `${tagsString}, saved` : "saved";
        }
        
        
        return template
            .replace(/{{title}}/g, item.title)
            .replace(/{{date}}/g, formattedDate)
            .replace(/{{isoDate}}/g, new Date(item.pubDate).toISOString())
            .replace(/{{link}}/g, item.link)
            .replace(/{{author}}/g, item.author || '')
            .replace(/{{source}}/g, item.feedTitle)
            .replace(/{{feedTitle}}/g, item.feedTitle)
            .replace(/{{summary}}/g, item.summary || '')
            .replace(/{{content}}/g, content)
            .replace(/{{tags}}/g, tagsString)
            .replace(/{{guid}}/g, item.guid);
    }
    
    
    private normalizePath(path: string): string {
        if (!path || path.trim() === '') {
            return '';
        }
        
        
        return path.replace(/^\/+|\/+$/g, '');
    }


    private async ensureFolderExists(folderPath: string): Promise<void> {
        if (!folderPath || folderPath.trim() === '') {
            return;
        }

        const cleanPath = this.normalizePath(folderPath);
        if (!cleanPath) {
            return;
        }

        try {
            if (this.app.vault.getAbstractFileByPath(cleanPath) === null) {
                await this.app.vault.createFolder(cleanPath);
            }
        } catch {
            throw new Error(`Failed to create folder: ${cleanPath}`);
        }
    }
    
    
    async fetchFullArticleContent(url: string): Promise<string> {
        try {
            
            const headers: Record<string, string> = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "DNT": "1",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1"
            };

            const parser = new DOMParser();
            const text = await robustFetch(url, { headers });
            
            if (!text) {
                if (url.includes('journals.sagepub.com') && url.includes('/doi/full/')) {
                    const abstractUrl = url.replace('/doi/full/', '/doi/abs/');
                    try {
                        const fallbackText = await robustFetch(abstractUrl, { headers });
                        if (!fallbackText) return "";
                        const fallbackDoc = parser.parseFromString(fallbackText, "text/html");
                        return this.extractContentFromDocument(fallbackDoc, abstractUrl);
                    } catch {
                        return "";
                    }
                } else {
                    return "";
                }
            }
            
            const doc = parser.parseFromString(text, "text/html");
            
            const errorIndicators = [
                'access denied',
                'forbidden',
                'not found',
                'page not found',
                '404',
                '403',
                '401'
            ];
            
            const pageText = doc.body.textContent?.toLowerCase() || '';
            if (errorIndicators.some(indicator => pageText.includes(indicator))) {
                if (url.includes('journals.sagepub.com') && url.includes('/doi/full/')) {
                    const abstractUrl = url.replace('/doi/full/', '/doi/abs/');
                    try {
                        const fallbackText = await robustFetch(abstractUrl, { headers });
                        if (fallbackText) {
                            const fallbackDoc = parser.parseFromString(fallbackText, "text/html");
                            const fallbackPageText = fallbackDoc.body.textContent?.toLowerCase() || '';
                            
                            if (!errorIndicators.some(indicator => fallbackPageText.includes(indicator))) {
                                return this.extractContentFromDocument(fallbackDoc, abstractUrl);
                            }
                        }
                    } catch {
                        // Fallback attempt failed
                    }
                }
                
                return "";
            }
            
            return this.extractContentFromDocument(doc, url);
        } catch {
            
            return "";
        }
    }
    
    private extractContentFromDocument(doc: Document, url: string): string {
        if (typeof Readability !== 'undefined') {
            const article = new Readability(doc).parse();
            const content = article?.content || "";
            
            return this.convertRelativeUrlsInContent(content, url);
        } else {
            
            const mainContent = doc.querySelector('main, article, .content, .post-content, .entry-content, .article-content, .full-text');
            if (mainContent) {
                return this.convertRelativeUrlsInContent(new XMLSerializer().serializeToString(mainContent), url);
            } else {
                
                const contentSelectors = [
                    '.article-body',
                    '.article-text',
                    '.fulltext',
                    '.full-text',
                    '.content-body',
                    '.main-content',
                    'section[role="main"]',
                    '.article'
                ];
                
                for (const selector of contentSelectors) {
                    const element = doc.querySelector(selector);
                    if (element) {
                        return this.convertRelativeUrlsInContent(new XMLSerializer().serializeToString(element), url);
                    }
                }
                
                
                return this.convertRelativeUrlsInContent(new XMLSerializer().serializeToString(doc.body), url);
            }
        }
    }
    
    
    private convertRelativeUrlsInContent(content: string, baseUrl: string): string {
        if (!content || !baseUrl) return content;
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(content, "text/html");

            // Update <img> tags
            doc.querySelectorAll("img").forEach((img) => {
                let src = img.getAttribute("src");
                
                // Substack specific: extract original image from data-attrs JSON if present
                const dataAttrs = img.getAttribute("data-attrs");
                if (dataAttrs) {
                    try {
                        const attrs = JSON.parse(dataAttrs) as { src?: string };
                        if (attrs.src && typeof attrs.src === "string") {
                            src = attrs.src;
                        }
                    } catch (_) {
                        // Not a Substack image or malformed JSON
                    }
                }

                if (src) {
                    img.setAttribute("src", this.convertToAbsoluteUrl(src.trim(), baseUrl));
                }

                // Handle srcset on <img>
                const srcset = img.getAttribute("srcset");
                if (srcset) {
                    img.setAttribute("srcset", this.processSrcset(srcset, baseUrl));
                }

                // Handle common lazy loading attributes
                ["data-src", "data-srcset", "data-original", "data-delayed-url"].forEach(attrName => {
                    const val = img.getAttribute(attrName);
                    if (val) {
                        if (attrName.includes("srcset")) {
                            img.setAttribute(attrName, this.processSrcset(val, baseUrl));
                        } else {
                            img.setAttribute(attrName, this.convertToAbsoluteUrl(val.trim(), baseUrl));
                        }
                    }
                });
            });

            // Update <source> tags
            doc.querySelectorAll("source").forEach((source) => {
                const srcset = source.getAttribute("srcset");
                if (srcset) {
                    source.setAttribute("srcset", this.processSrcset(srcset, baseUrl));
                }

                const dataSrcset = source.getAttribute("data-srcset");
                if (dataSrcset) {
                    source.setAttribute("data-srcset", this.processSrcset(dataSrcset, baseUrl));
                }
            });

            // Update <a> tags
            doc.querySelectorAll("a").forEach((a) => {
                const href = a.getAttribute("href");
                if (href) {
                    a.setAttribute("href", this.convertToAbsoluteUrl(href, baseUrl));
                }
            });

            // Update <iframe> tags
            doc.querySelectorAll("iframe").forEach((iframe) => {
                const src = iframe.getAttribute("src");
                if (src) {
                    iframe.setAttribute("src", this.convertToAbsoluteUrl(src, baseUrl));
                }
            });

            return doc.body.innerHTML;
        } catch (e) {
            console.error("[RSS Dashboard] Failed to convert relative URLs in ArticleSaver:", e);
            return content;
        }
    }

    
    private convertToAbsoluteUrl(relativeUrl: string, baseUrl: string): string {
        if (!relativeUrl || !baseUrl) return relativeUrl;
        
        
        if (relativeUrl.startsWith('app://')) {
            return relativeUrl.replace('app://', 'https://');
        }
        
        
        if (relativeUrl.startsWith('//')) {
            return 'https:' + relativeUrl;
        }
        
        
        if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
            return relativeUrl;
        }
        
        try {
            
            const base = new URL(baseUrl);
            
            
            if (relativeUrl.startsWith('/')) {
                return `${base.protocol}//${base.host}${relativeUrl}`;
            }
            
            
            return new URL(relativeUrl, base).href;
        } catch {
            
            return relativeUrl;
        }
    }

    private processSrcset(srcset: string, baseUrl: string): string {
        if (!srcset) return "";
        
        // Substack and other CDNs use commas in URLs. 
        // Standard srcset splits by comma followed by whitespace.
        // However, some feeds have dense srcset without spaces.
        // We split by commas that are:
        // 1. Followed by whitespace OR
        // 2. Followed by http/https/double-slash (start of next URL)
        return srcset
            .split(/,\s+|,(?=https?:|\/\/)/) 
            .map((part) => {
                const trimmedPart = part.trim();
                // Match the URL and optional descriptor
                const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w|\s+\d+x)?$/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    const sizeDescriptor = urlMatch[2] || "";
                    return this.convertToAbsoluteUrl(url.trim(), baseUrl) + sizeDescriptor;
                }
                return trimmedPart;
            })
            .join(", ");
    }
    
    
    async saveArticleWithFullContent(
        item: FeedItem, 
        customFolder?: string, 
        customTemplate?: string
    ): Promise<TFile | null> {
        try {
            
            const loadingNotice = new Notice("Fetching full article content...", 0);
            
            
            const fullContent = await this.fetchFullArticleContent(item.link);
            
            if (!fullContent) {
                loadingNotice.hide();
                new Notice("Could not fetch full content. Saving with available content.");
                return await this.saveArticle(item, customFolder, customTemplate);
            }
            
            
            const markdownContent = this.turndownService.turndown(fullContent);
            
            loadingNotice.hide();
            
            
            return await this.saveArticle(item, customFolder, customTemplate, markdownContent);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Error saving article with full content: ${message}`);
            
            return await this.saveArticle(item, customFolder, customTemplate);
        }
    }
    
    
    async saveArticle(
        item: FeedItem, 
        customFolder?: string, 
        customTemplate?: string,
        rawContent?: string
    ): Promise<TFile | null> {
        try {
            
            let folder = customFolder || this.settings.defaultFolder || '';
            
            
            folder = this.normalizePath(folder);
            
          
            
            
            if (folder && folder.trim() !== '') {
                await this.ensureFolderExists(folder);
            }
            
            
            const filename = this.sanitizeFilename(item.title);
            const filePath = folder && folder.trim() !== '' ? `${folder}/${filename}.md` : `${filename}.md`;
           
            
            
            const existingFile = this.app.vault.getAbstractFileByPath(filePath);
            if (existingFile !== null) {
           
                await this.app.fileManager.trashFile(existingFile);
            }
            
            
            let content = '';
            
            
            const template = customTemplate || this.settings.defaultTemplate || 
                "# {{title}}\n\n{{content}}\n\n[Source]({{link}})";
            
            
            const templateHasFrontmatter = template.trim().startsWith("---");
            
            
            if (this.settings.includeFrontmatter && !templateHasFrontmatter) {
                
                content += this.generateFrontmatter(item);
            }
            
            
            content += this.applyTemplate(item, template, rawContent);
            
            
            const file = await this.app.vault.create(filePath, content);
           
            
            
            item.saved = true;
            item.savedFilePath = filePath;
            
            
            if (this.settings.addSavedTag && (!item.tags || !item.tags.some(t => t.name.toLowerCase() === "saved"))) {
                const savedTag = { name: "saved", color: "#3498db" };
                if (!item.tags) {
                    item.tags = [savedTag];
                } else {
                    item.tags.push(savedTag);
                }
            }
            
            new Notice(`Article saved: ${filename}`);
            return file;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Error saving article: ${message}`);
            return null;
        }
    }

    
    async fixSavedFilePaths(articles: FeedItem[]): Promise<void> {
        for (const article of articles) {
            if (article.saved && article.savedFilePath) {
                const oldPath = article.savedFilePath;
                const normalizedPath = this.normalizePath(oldPath);
                
                
                if (oldPath !== normalizedPath) {
                  
                    
                    
                    if (this.app.vault.getAbstractFileByPath(normalizedPath) !== null) {
                        article.savedFilePath = normalizedPath;
                       
                    } else {
                        
                        const file = this.app.vault.getAbstractFileByPath(oldPath);
                        if (file instanceof TFile) {
                            
                            try {
                                const normalizedFolder = this.normalizePath(this.settings.defaultFolder || '');
                                const filename = this.sanitizeFilename(article.title);
                                const newName = `${filename}.md`;

                                const newPath =
                                    normalizedFolder && normalizedFolder.trim() !== ''
                                        ? `${normalizedFolder}/${newName}`
                                        : newName;

                                await this.app.fileManager.renameFile(file, newPath);
                                article.savedFilePath = newPath;
                            } catch {
                                article.saved = false;
                                article.savedFilePath = undefined;
                                if (article.tags) {
                                    article.tags = article.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                                }
                            }
                        } else {
                            article.saved = false;
                            article.savedFilePath = undefined;
                            
                            
                            if (article.tags) {
                                article.tags = article.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                            }
                        }
                    }
                }
            }
        }
    }

    
    verifySavedArticle(article: FeedItem): boolean {
        if (!article.saved || !article.savedFilePath) {
            return false;
        }
        
        try {
            const file = this.app.vault.getAbstractFileByPath(article.savedFilePath);
            if (file === null) {
                
                article.saved = false;
                article.savedFilePath = undefined;
                
                
                if (article.tags) {
                    article.tags = article.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                }
                
                
                return false;
            }
            return true;
        } catch {
            
            return false;
        }
    }
    
    
    verifyAllSavedArticles(articles: FeedItem[]): void {
        articles
            .filter(article => article.saved)
            .forEach(article => this.verifySavedArticle(article));
    }
}
