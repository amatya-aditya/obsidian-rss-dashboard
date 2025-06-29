import { TFile, Vault, Notice, requestUrl } from "obsidian";
import { FeedItem, ArticleSavingSettings } from "../types/types";
import TurndownService from "turndown";
import { Readability } from "@mozilla/readability";

// @ts-ignore
export class ArticleSaver {
    private vault: Vault;
    private settings: ArticleSavingSettings;
    private turndownService: TurndownService;
    
    constructor(vault: Vault, settings: ArticleSavingSettings) {
        this.vault = vault;
        this.settings = settings;
        this.turndownService = new TurndownService();

        // @ts-ignore
        this.turndownService.addRule('math', {
            filter: function (node: any) {
                return node.nodeName === 'SPAN' && node.classList.contains('math');
            },
            replacement: function (content: string, node: any) {
                return node.textContent || '';
            }
        });
    }
    
   
    private cleanHtml(html: string): string {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            
            
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
        } catch (e) {
            console.error("Error cleaning HTML:", e);
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
        
        let sanitized = name
            .replace(/[\/\\:*?"<>|]/g, '') 
            .replace(/\s+/g, ' ') 
            .trim(); 

        
        const words = sanitized.split(' ');
        const shortened = words.slice(0, 5).join(' ');
        return shortened.substring(0, 50);
    }
    
    
    private applyTemplate(item: FeedItem, template: string): string {
        
        const cleanContent = this.cleanHtml(item.description);
        
        
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
            .replace(/{{content}}/g, cleanContent)
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
                
                if (!(await this.vault.adapter.exists(currentPath))) {
                   
                    await this.vault.createFolder(currentPath);
                }
            } catch (error) {
                console.error(`Error creating folder ${currentPath}:`, error);
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
                console.warn("Empty response from URL:", url);
                
                
                if (url.includes('journals.sagepub.com') && url.includes('/doi/full/')) {
                    const abstractUrl = url.replace('/doi/full/', '/doi/abs/');
                    console.log(`Trying abstract URL as fallback: ${abstractUrl}`);
                    
                    try {
                        response = await requestUrl({ 
                            url: abstractUrl,
                            headers
                        });
                        
                        if (!response.text) {
                            console.warn("Empty response from abstract URL as well:", abstractUrl);
                            return "";
                        }
                    } catch (fallbackError) {
                        console.error("Error fetching abstract URL:", fallbackError);
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
                console.warn("Error page detected for URL:", url);
                
                
                if (url.includes('journals.sagepub.com') && url.includes('/doi/full/')) {
                    const abstractUrl = url.replace('/doi/full/', '/doi/abs/');
                    console.log(`Trying abstract URL as fallback due to error page: ${abstractUrl}`);
                    
                    try {
                        const fallbackResponse = await requestUrl({ 
                            url: abstractUrl,
                            headers
                        });
                        
                        if (fallbackResponse.text) {
                            const fallbackDoc = parser.parseFromString(fallbackResponse.text, "text/html");
                            const fallbackPageText = fallbackDoc.body.textContent?.toLowerCase() || '';
                            
                            if (!errorIndicators.some(indicator => fallbackPageText.includes(indicator))) {
                                console.log("Successfully fetched content from abstract URL");
                                return this.extractContentFromDocument(fallbackDoc, abstractUrl);
                            }
                        }
                    } catch (fallbackError) {
                        console.error("Error fetching abstract URL as fallback:", fallbackError);
                    }
                }
                
                return "";
            }
            
            return this.extractContentFromDocument(doc, url);
        } catch (error) {
            console.error("Error fetching full article content:", error);
            return "";
        }
    }
    
    private extractContentFromDocument(doc: Document, url: string): string {
        if (typeof Readability !== 'undefined') {
            const reader = new Readability(doc);
            const article = reader.parse();
            const content = (article?.content as string) || "";
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
                (match, attributes, src) => {
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
                (match, attributes, srcset) => {
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
                (match, attributes, href) => {
                    const absoluteHref = this.convertToAbsoluteUrl(href, baseUrl);
                    return `<a${attributes}href="${absoluteHref}"`;
                }
            );
            return content;
        } catch (error) {
            console.warn(`Failed to convert relative URLs in content with base "${baseUrl}":`, error);
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
        } catch (error) {
            console.warn(`Failed to convert relative URL "${relativeUrl}" to absolute URL with base "${baseUrl}":`, error);
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
            console.error("Error saving article with full content:", error);
            new Notice(`Error saving article with full content: ${error.message}`);
            
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
           
            
            
            if (await this.vault.adapter.exists(filePath)) {
           
                await this.vault.adapter.remove(filePath);
            }
            
            
            let content = '';
            
            if (rawContent) {
                
                if (this.settings.includeFrontmatter) {
                    content += this.generateFrontmatter(item);
                }
                content += rawContent;
            } else {
                
                const template = customTemplate || this.settings.defaultTemplate || 
                    "# {{title}}\n\n{{content}}\n\n[Source]({{link}})";
                content += this.applyTemplate(item, template);
            }
            
            
            const file = await this.vault.create(filePath, content);
           
            
            
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
            console.error("Error saving article:", error);
            new Notice(`Error saving article: ${error.message}`);
            return null;
        }
    }

    
    async fixSavedFilePaths(articles: FeedItem[]): Promise<void> {
        for (const article of articles) {
            if (article.saved && article.savedFilePath) {
                const oldPath = article.savedFilePath;
                const normalizedPath = this.normalizePath(oldPath);
                
                
                if (oldPath !== normalizedPath) {
                  
                    
                    
                    if (await this.vault.adapter.exists(normalizedPath)) {
                        article.savedFilePath = normalizedPath;
                       
                    } else {
                        
                        if (await this.vault.adapter.exists(oldPath)) {
                            
                            try {
                                const file = this.vault.getAbstractFileByPath(oldPath);
                                if (file instanceof TFile) {
                                    
                                    const normalizedFolder = this.normalizePath(this.settings.defaultFolder || '');
                                    const filename = this.sanitizeFilename(article.title);
                                    const newPath = normalizedFolder && normalizedFolder.trim() !== '' ? `${normalizedFolder}/${filename}.md` : `${filename}.md`;
                                    
                                    
                                    await this.vault.adapter.rename(oldPath, newPath);
                                    article.savedFilePath = newPath;
                                    
                                }
                            } catch (error) {
                                console.error(`Error moving file from ${oldPath} to normalized path:`, error);
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

    
    async verifySavedArticle(article: FeedItem): Promise<boolean> {
        if (!article.saved || !article.savedFilePath) {
            return false;
        }
        
        try {
            const exists = await this.vault.adapter.exists(article.savedFilePath);
            if (!exists) {
                
                article.saved = false;
                article.savedFilePath = undefined;
                
                
                if (article.tags) {
                    article.tags = article.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                }
                
                
                return false;
            }
            return true;
        } catch (error) {
            console.error("Error verifying saved article:", error);
            return false;
        }
    }
    
    
    async verifyAllSavedArticles(articles: FeedItem[]): Promise<void> {
        const verificationPromises = articles
            .filter(article => article.saved)
            .map(article => this.verifySavedArticle(article));
        
        await Promise.all(verificationPromises);
    }
}