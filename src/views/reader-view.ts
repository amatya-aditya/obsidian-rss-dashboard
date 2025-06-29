import { ItemView, WorkspaceLeaf, Notice, TFile, Menu, MenuItem, App } from "obsidian";
import { setIcon } from "obsidian";
import { FeedItem, Tag, RssDashboardSettings } from "../types/types";
import { MediaService } from "../services/media-service";
import { ArticleSaver } from "../services/article-saver";
import { WebViewerIntegration } from "../services/web-viewer-integration";
import { PodcastPlayer } from "./podcast-player";
import { VideoPlayer } from "./video-player";
import { requestUrl } from "obsidian";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";

export const RSS_READER_VIEW_TYPE = "rss-reader-view";

export class ReaderView extends ItemView {
    private currentItem: FeedItem | null = null;
    private readingContainer: HTMLElement;
    private articleSaver: ArticleSaver;
    private settings: RssDashboardSettings;
    private onArticleSave: (item: FeedItem) => void;
    private webViewerIntegration: WebViewerIntegration | null = null;
    private podcastPlayer: PodcastPlayer | null = null;
    private videoPlayer: VideoPlayer | null = null;
    private relatedItems: FeedItem[] = [];
    private currentFullContent?: string;
    private turndownService = new TurndownService();

    constructor(leaf: WorkspaceLeaf, settings: RssDashboardSettings, articleSaver: ArticleSaver, onArticleSave: (item: FeedItem) => void) {
        super(leaf);
        this.settings = settings;
        this.articleSaver = articleSaver;
        this.onArticleSave = onArticleSave;
        
        
        try {
            // @ts-ignore - Check if webviewer plugin exists
            if (this.app.plugins?.plugins?.["webpage-html-export"]) {
                this.webViewerIntegration = new WebViewerIntegration(this.app as any, settings.articleSaving);
            }
        } catch (error) {
            console.error("Error initializing web viewer integration:", error);
        }
    }

    getViewType(): string {
        return RSS_READER_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.currentItem ? this.currentItem.title : "RSS Reader";
    }

    getIcon(): string {
        if (this.currentItem) {
            if (this.currentItem.mediaType === 'video') {
                return "play-circle";
            } else if (this.currentItem.mediaType === 'podcast') {
                return "headphones";
            }
        }
        return "file-text";
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass("rss-reader-view");
        
        
        const header = this.contentEl.createDiv({ cls: "rss-reader-header" });
        
        
        const backButton = header.createDiv({ cls: "rss-reader-back-button" });
        setIcon(backButton, "arrow-left");
        backButton.addEventListener("click", () => {
            this.app.workspace.detachLeavesOfType(RSS_READER_VIEW_TYPE);
        });
        
        
        header.createDiv({ cls: "rss-reader-title", text: "RSS Reader" });
        
        
        const actions = header.createDiv({ cls: "rss-reader-actions" });
        
        
        const savedLabel = actions.createDiv({ 
            cls: "rss-reader-saved-label",
            text: "Saved"
        });
        
        
        const saveButton = actions.createDiv({ 
            cls: "rss-reader-action-button", 
            attr: { title: "Save Article" } 
        });
        
        setIcon(saveButton, "save");
        saveButton.addEventListener("click", async (e) => {
            if (this.currentItem) {
                this.showSaveOptions(e, this.currentItem);
            }
        });
        
        
        const browserButton = actions.createDiv({ 
            cls: "rss-reader-action-button", 
            attr: { title: "Open in Browser" } 
        });
        setIcon(browserButton, "lucide-globe-2");
        browserButton.addEventListener("click", () => {
            if (this.currentItem) {
                window.open(this.currentItem.link, "_blank");
            }
        });
        
        
        this.readingContainer = this.contentEl.createDiv({ cls: "rss-reader-content" });
    }

    
    private showSaveOptions(event: MouseEvent, item: FeedItem): void {
        const menu = new Menu();
        
        menu.addItem((menuItem: MenuItem) => {
            menuItem
                .setTitle("Save with Default Settings")
                .setIcon("save")
                .onClick(async () => {
                    const markdownContent = this.turndownService.turndown(this.currentFullContent || item.description || "");
                    const file = await this.articleSaver.saveArticle(item, undefined, undefined, markdownContent);
                    if (file) {
                        this.onArticleSave(item);
                        
                        this.updateSavedLabel(true);
                    }
                });
        });
        
        menu.addItem((menuItem: MenuItem) => {
            menuItem
                .setTitle("Save to Custom Folder...")
                .setIcon("folder")
                .onClick(() => {
                    this.showCustomSaveModal(item);
                });
        });
        
        menu.showAtMouseEvent(event);
    }
    
    
    private showCustomSaveModal(item: FeedItem): void {
        const modal = document.createElement("div");
        modal.className = "rss-dashboard-modal rss-dashboard-modal-container";
        
        const modalContent = document.createElement("div");
        modalContent.className = "rss-dashboard-modal-content";
        
        const modalTitle = document.createElement("h2");
        modalTitle.textContent = "Save Article";
        
        const folderLabel = document.createElement("label");
        folderLabel.textContent = "Save to Folder:";
        
        const folderInput = document.createElement("input");
        folderInput.type = "text";
        folderInput.placeholder = "Enter folder path";
        folderInput.value = this.settings.articleSaving.defaultFolder;
        
        const templateLabel = document.createElement("label");
        templateLabel.textContent = "Use Template:";
        
        const templateInput = document.createElement("textarea");
        templateInput.placeholder = "Enter template";
        templateInput.value = this.settings.articleSaving.defaultTemplate;
        templateInput.rows = 6;
        
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
            
            const markdownContent = this.turndownService.turndown(this.currentFullContent || item.description || "");
            const file = await this.articleSaver.saveArticle(item, folder, undefined, markdownContent);
            if (file) {
                this.onArticleSave(item);
                
                this.updateSavedLabel(true);
            }
            
            document.body.removeChild(modal);
        });
        
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveButton);
        
        modalContent.appendChild(modalTitle);
        modalContent.appendChild(folderLabel);
        modalContent.appendChild(folderInput);
        modalContent.appendChild(templateLabel);
        modalContent.appendChild(templateInput);
        modalContent.appendChild(buttonContainer);
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }

    
    async displayItem(item: FeedItem, relatedItems: FeedItem[] = []): Promise<void> {
        this.currentItem = item;
        this.relatedItems = relatedItems;

        
        this.updateSavedLabel(false);
        
        
        if (item.saved) {
            const fileExists = await this.checkSavedFileExists(item);
            if (!fileExists) {
                item.saved = false;
                
                
                if (item.tags) {
                    item.tags = item.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                }
                
                
                if (item.feedUrl) {
                    const feed = this.settings.feeds.find(f => f.url === item.feedUrl);
                    if (feed) {
                        const originalItem = feed.items.find(i => i.guid === item.guid);
                        if (originalItem) {
                            originalItem.saved = false;
                            if (originalItem.tags) {
                                originalItem.tags = originalItem.tags.filter(tag => tag.name.toLowerCase() !== "saved");
                            }
                        }
                    }
                }
            } else {
                
                this.updateSavedLabel(true);
            }
        }
        
        if (!this.readingContainer) {
            await this.onOpen();
        } else {
            this.readingContainer.empty();
        }
        
        
        const titleEl = this.contentEl.querySelector(".rss-reader-title");
        if (titleEl) {
            titleEl.textContent = item.title;
        }
        
        if (item.mediaType === 'video' && (item.videoId || MediaService.extractYouTubeVideoId(item.link) || item.videoUrl)) {
            if (!item.videoId && !item.videoUrl) {
                const vid = MediaService.extractYouTubeVideoId(item.link);
                if (vid) item.videoId = vid;
            }
            if (item.videoUrl) {
                this.displayVideoPodcast(item);
            } else {
            this.displayVideo(item);
            }
        } else if (item.mediaType === 'podcast') {
            if (!item.audioUrl && item.enclosure?.url) {
                item.audioUrl = item.enclosure.url;
            }
            if (!item.audioUrl) {
                const aud = MediaService.extractPodcastAudio(item.description);
                if (aud) item.audioUrl = aud;
            }
            this.displayPodcast(item);
        } else {
            
            const fullContent = await this.fetchFullArticleContent(item.link);
            this.currentFullContent = fullContent;
            this.displayArticle(item, fullContent);
        }
        
        
        if (!item.read) {
            item.read = true;
        }
    }
    
    
    private displayVideo(item: FeedItem): void {
        
        if (this.podcastPlayer) {
            this.podcastPlayer.destroy();
            this.podcastPlayer = null;
        }
        
        
        const container = this.readingContainer.createDiv({ 
            cls: "rss-reader-video-container enhanced" 
        });
        
        
        if (item.videoId) {
            this.videoPlayer = new VideoPlayer(container);
            this.videoPlayer.loadVideo(item);
            
            
            if (this.relatedItems.length > 0) {
                this.videoPlayer.setRelatedVideos(this.relatedItems);
            }
        } else {
            container.createDiv({
                cls: "rss-reader-error",
                text: "Video ID not found. Cannot play this video."
            });
            
            
            this.displayArticle(item);
        }
    }
    
    
    private displayPodcast(item: FeedItem): void {
        if (this.videoPlayer) {
            this.videoPlayer.destroy();
            this.videoPlayer = null;
        }
        
        const container = this.readingContainer.createDiv({ 
            cls: "rss-reader-podcast-container enhanced" 
        });
        
        
        let fullFeedEpisodes: FeedItem[] | undefined = undefined;
        if (item.feedUrl) {
            const feed = this.settings.feeds.find(f => f.url === item.feedUrl);
            if (feed) {
                fullFeedEpisodes = feed.items.filter(i => i.mediaType === 'podcast');
            }
        }
        
        if (item.audioUrl) {
            this.podcastPlayer = new PodcastPlayer(container);
            this.podcastPlayer.loadEpisode(item, fullFeedEpisodes);
        } else {
            const audioUrl = MediaService.extractPodcastAudio(item.description);
            if (audioUrl) {
                const podcastItem: FeedItem = {
                    ...item,
                    audioUrl: audioUrl
                };
                this.podcastPlayer = new PodcastPlayer(container);
                this.podcastPlayer.loadEpisode(podcastItem, fullFeedEpisodes);
            } else {
                container.createDiv({
                    cls: "rss-reader-error",
                    text: "Audio URL not found. Cannot play this podcast."
                });
                this.displayArticle(item);
            }
        }
    }
    
    
    private displayArticle(item: FeedItem, fullContent?: string): void {
        
        if (this.podcastPlayer) {
            this.podcastPlayer.destroy();
            this.podcastPlayer = null;
        }
        if (this.videoPlayer) {
            this.videoPlayer.destroy();
            this.videoPlayer = null;
        }
        
        
        if (this.webViewerIntegration) {
            this.webViewerIntegration
                .openInWebViewer(item.link, item.title)
                .then((success) => {
                    if (!success) {
                        
                        this.renderArticle(item, fullContent);
                    }
                })
                .catch(() => {
                    
                    this.renderArticle(item, fullContent);
                });
            
            return;
        }
        
        
        this.renderArticle(item, fullContent);
    }
    
    
    private renderArticle(item: FeedItem, fullContent?: string): void {
        
        const headerContainer = this.readingContainer.createDiv({ cls: "rss-reader-article-header" });
        
        headerContainer.createEl("h1", { 
            cls: "rss-reader-item-title",
            text: item.title 
        });
        
        
        const metaContainer = headerContainer.createDiv({ cls: "rss-reader-meta" });
        
        metaContainer.createDiv({ 
            cls: "rss-reader-feed-title",
            text: item.feedTitle 
        });
        
        metaContainer.createDiv({ 
            cls: "rss-reader-pub-date",
            text: new Date(item.pubDate).toLocaleString() 
        });
        
        
        if (item.tags && item.tags.length > 0) {
            const tagsContainer = headerContainer.createDiv({ cls: "rss-reader-tags" });
            
            for (const tag of item.tags) {
                const tagElement = tagsContainer.createDiv({ cls: "rss-reader-tag" });
                tagElement.textContent = tag.name;
                tagElement.style.setProperty('--tag-color', tag.color);
            }
        }
        
        
        if (this.settings.display.showCoverImage && (item.coverImage || (item.image && typeof item.image === "object" && (item.image as { url?: string }).url) || (typeof item.image === "string" ? item.image : ""))) {
            const imageContainer = this.readingContainer.createDiv({ cls: "rss-reader-cover-image" });
            imageContainer.createEl("img", {
                attr: {
                    src: (item.coverImage || (item.image && typeof item.image === "object" && (item.image as { url?: string }).url) || (typeof item.image === "string" ? item.image : "")) ?? "",
                    alt: item.title
                }
            });
        }
        
        const contentContainer = this.readingContainer.createDiv({ cls: "rss-reader-article-content" });

        
        const htmlString = fullContent || item.description || "";
        const processedHtmlString = this.convertRelativeUrlsInContent(htmlString, item.link);
        const parser = new DOMParser();
        const doc = parser.parseFromString(processedHtmlString, "text/html");

        
        function appendNodes(parent: HTMLElement, nodes: NodeListOf<ChildNode>) {
            nodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    parent.appendText(node.textContent || "");
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    
                    if ((node as HTMLElement).tagName === "I" && (node as HTMLElement).classList.contains("icon-class")) {
                        
                        
                    } else {
                        
                        const tag = (node as HTMLElement).tagName.toLowerCase() as keyof HTMLElementTagNameMap;
                        const el = parent.createEl(tag);
                        
                        Array.from((node as HTMLElement).attributes).forEach(attr => {
                            el.setAttr(attr.name, attr.value);
                        });
                        
                        appendNodes(el, node.childNodes);
                    }
                }
            });
        }

        appendNodes(contentContainer, doc.body.childNodes);

        
        contentContainer.querySelectorAll("img").forEach(img => {
            const src = img.getAttribute("src");
            if (src && src.startsWith("app://")) {
                img.setAttribute("src", src.replace("app://", "https://"));
            }
            img.classList.add("rss-reader-responsive-img");
        });

        
        contentContainer.querySelectorAll("source").forEach(source => {
            const srcset = source.getAttribute("srcset");
            if (srcset) {
                
                const processedSrcset = srcset.split(',').map((part: string) => {
                    const trimmedPart = part.trim();
                    
                    const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w)?$/);
                    if (urlMatch) {
                        const url = urlMatch[1];
                        const sizeDescriptor = urlMatch[2] || '';
                        
                        let absoluteUrl = url;
                        if (url.startsWith('app://')) {
                            absoluteUrl = url.replace('app://', 'https://');
                        } else if (url.startsWith('//')) {
                            absoluteUrl = 'https:' + url;
                        }
                        return absoluteUrl + sizeDescriptor;
                    }
                    return trimmedPart;
                }).join(', ');
                source.setAttribute("srcset", processedSrcset);
            }
        });

        
        contentContainer.querySelectorAll("a").forEach(link => {
            const href = link.getAttribute("href");
            if (href && href.startsWith("app://")) {
                link.setAttribute("href", href.replace("app://", "https://"));
            }
        });
        
        this.app.workspace.trigger("parse-math", contentContainer);
        
    
        
        
        const links = contentContainer.querySelectorAll("a");
        links.forEach((link) => {
            link.setAttribute("target", "_blank");
            link.setAttribute("rel", "noopener noreferrer");
        });
    }

    
    async fetchFullArticleContent(url: string): Promise<string> {
        try {
            const response = await requestUrl({ url });
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(response.text, "text/html");
            const reader = new Readability(doc);
            const article = reader.parse();
            const content = (article?.content as string) || "";
            
            return this.convertRelativeUrlsInContent(content, url);
        } catch (error) {
            console.error("Error fetching full article content:", error);
            return "";
        }
    }

    
    private convertHtmlToMarkdown(html: string): string {
        return this.turndownService.turndown(html);
    }

    
    private showMarkdownView(markdownContent: string, item: FeedItem): void {
        const modal = document.createElement("div");
        modal.className = "rss-reader-markdown-modal";
        
        const modalContent = document.createElement("div");
        modalContent.className = "rss-reader-markdown-content";
        
        const markdownDisplay = document.createElement("div");
        markdownDisplay.textContent = markdownContent;
        
        const saveButton = document.createElement("button");
        saveButton.textContent = "Save to Vault";
        saveButton.addEventListener("click", async () => {
            
            const markdownContent = this.turndownService.turndown(this.currentFullContent || item.description || "");
            console.log("Saving markdown content:", markdownContent);
            const file = await this.articleSaver.saveArticle(item, undefined, undefined, markdownContent);
            if (file) {
                this.onArticleSave(item);
            }
            document.body.removeChild(modal);
        });
        
        const closeButton = document.createElement("button");
        closeButton.textContent = "Close";
        closeButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });
        
        modalContent.appendChild(markdownDisplay);
        modalContent.appendChild(saveButton);
        modalContent.appendChild(closeButton);
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
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

    
    private updateSavedLabel(saved: boolean): void {
        const savedLabel = this.contentEl.querySelector(".rss-reader-saved-label") as HTMLElement;
        if (savedLabel) {
            if (saved) {
                savedLabel.classList.remove("hidden");
                savedLabel.classList.add("visible");
            } else {
                savedLabel.classList.remove("visible");
                savedLabel.classList.add("hidden");
            }
        }
    }
    
    
    private async checkSavedFileExists(item: FeedItem): Promise<boolean> {
        try {
            
            const folder = this.settings.articleSaving.defaultFolder || "RSS Articles";
            const filename = this.sanitizeFilename(item.title);
            const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
            
            
            return await this.app.vault.adapter.exists(filePath);
        } catch (error) {
            console.error(`Error checking if file exists for article "${item.title}":`, error);
            return false;
        }
    }
    
    
    private sanitizeFilename(name: string): string {
        return name
            .replace(/[\/\\:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 100);
    }

    
    private displayVideoPodcast(item: FeedItem): void {
        if (this.podcastPlayer) {
            this.podcastPlayer.destroy();
            this.podcastPlayer = null;
        }
        if (this.videoPlayer) {
            this.videoPlayer.destroy();
            this.videoPlayer = null;
        }
        const container = this.readingContainer.createDiv({
            cls: "rss-reader-video-podcast-container enhanced"
        });
        if (item.videoUrl) {
            const video = document.createElement("video");
            video.controls = true;
            video.classList.add("rss-reader-video");
            if (item.coverImage) video.poster = item.coverImage;
            const source = document.createElement("source");
            source.src = item.videoUrl!;
            source.type = "video/mp4";
            video.appendChild(source);
            video.appendChild(document.createTextNode("Your browser does not support the video tag."));
            container.appendChild(video);
        } else {
            container.createDiv({
                cls: "rss-reader-error",
                text: "Video URL not found. Cannot play this video podcast."
            });
            this.displayArticle(item);
        }
    }
}


