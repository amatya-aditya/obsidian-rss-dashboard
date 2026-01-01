import { TFile, App, Notice, requestUrl } from "obsidian";
import { FeedItem, ArticleSavingSettings } from "../types/types";
import TurndownService from "turndown";
import { Readability } from "@mozilla/readability";
import { ensureUtf8Meta } from '../utils/platform-utils';

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
        
        const folders = cleanPath.split('/').filter(p => p.length > 0);
        let currentPath = '';
        
        for (const folder of folders) {
            currentPath += folder;
            
            try {
                
                if (this.app.vault.getAbstractFileByPath(currentPath) === null) {
                   
                    await this.app.vault.createFolder(currentPath);
                }
            } catch {
                
                throw new Error(`Failed to create folder: ${currentPath}`);
            }
            
            currentPath += '/';
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

            let response = await requestUrl({ 
                url,
                headers
            });
            
            
            if (!response.text) {
                
                
                
                if (url.includes('journals.sagepub.com') && url.includes('/doi/full/')) {
                    const abstractUrl = url.replace('/doi/full/', '/doi/abs/');
                    
                    
                    try {
                        response = await requestUrl({ 
                            url: abstractUrl,
                            headers
                        });
                        
                        if (!response.text) {
                            
                            return "";
                        }
                    } catch {
                        
                        return "";
                    }
                } else {
                    return "";
                }
            }
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.text, "text/html");
            
            
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
                        const fallbackResponse = await requestUrl({ 
                            url: abstractUrl,
                            headers
                        });
                        
                        if (fallbackResponse.text) {
                            const fallbackDoc = parser.parseFromString(fallbackResponse.text, "text/html");
                            const fallbackPageText = fallbackDoc.body.textContent?.toLowerCase() || '';
                            
                            if (!errorIndicators.some(indicator => fallbackPageText.includes(indicator))) {
                                
                                return this.extractContentFromDocument(fallbackDoc, abstractUrl);
                            }
                        }
                    } catch {
                        // Fallback attempt failed, continue with empty content
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
            
            return this.convertRelativeUrlsInContent(ensureUtf8Meta(content), url);
        } else {
            
            const mainContent = doc.querySelector('main, article, .content, .post-content, .entry-content, .article-content, .full-text');
            if (mainContent) {
                return this.convertRelativeUrlsInContent(ensureUtf8Meta(new XMLSerializer().serializeToString(mainContent)), url);
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
                        return this.convertRelativeUrlsInContent(ensureUtf8Meta(new XMLSerializer().serializeToString(element)), url);
                    }
                }
                
                
                return this.convertRelativeUrlsInContent(ensureUtf8Meta(new XMLSerializer().serializeToString(doc.body)), url);
            }
        }
    }
    
    
    private convertRelativeUrlsInContent(content: string, baseUrl: string): string {
        if (!content || !baseUrl) return content;
        try {
            
            const baseHost = (() => {
                try {
                    return new URL(baseUrl).host;
                } catch {
                    return "";
                }
            })();

            content = content.replace(
                /app:\/\//g,
                'https://'
            );

            
            content = content.replace(
                /<img([^>]+)src=["']([^"']+)["']/gi,
                (match: string, attributes: string, src: string) => {
                    try {
                        const srcUrl = new URL(src, baseUrl);
                        if (srcUrl.host !== baseHost) {
                            srcUrl.host = baseHost;
                            srcUrl.protocol = "https:";
                            return `<img${attributes}src="${srcUrl.toString()}"`;
                        }
                        return `<img${attributes}src="${srcUrl.toString()}"`;
                    } catch {
                        return `<img${attributes}src="${src}"`;
                    }
                }
            );

            content = content.replace(
                /<source([^>]+)srcset=["']([^"']+)["']/gi,
                (match: string, attributes: string, srcset: string) => {
                    const processedSrcset = srcset.split(',').map((part: string) => {
                        const trimmedPart = part.trim();
                        const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w)?$/);
                        if (urlMatch) {
                            const url = urlMatch[1];
                            const sizeDescriptor = urlMatch[2] || '';
                            const absoluteUrl = this.convertToAbsoluteUrl(url, baseUrl);
                            return absoluteUrl + sizeDescriptor;
                        }
                        return trimmedPart;
                    }).join(', ');
                    return `<source${attributes}srcset="${processedSrcset}"`;
                }
            );

            content = content.replace(
                /<a([^>]+)href=["']([^"']+)["']/gi,
                (match: string, attributes: string, href: string) => {
                    const absoluteHref = this.convertToAbsoluteUrl(href, baseUrl);
                    return `<a${attributes}href="${absoluteHref}"`;
                }
            );
            return content;
        } catch {
            
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
                                
                                
                                await this.app.vault.rename(file, newName);
                                const newPath =
                                    normalizedFolder && normalizedFolder.trim() !== ''
                                        ? `${normalizedFolder}/${newName}`
                                        : newName;
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
