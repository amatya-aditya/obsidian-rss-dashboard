import { ItemView, WorkspaceLeaf, Menu, MenuItem, App, Setting } from "obsidian";
import { setIcon } from "obsidian";
import { FeedItem, RssDashboardSettings } from "../types/types";
import { MediaService } from "../services/media-service";
import { ArticleSaver } from "../services/article-saver";
import { WebViewerIntegration } from "../services/web-viewer-integration";
import { PodcastPlayer } from "./podcast-player";
import { VideoPlayer } from "./video-player";
import { requestUrl } from "obsidian";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { ensureUtf8Meta } from '../utils/platform-utils';

export const RSS_READER_VIEW_TYPE = "rss-reader-view";

export class ReaderView extends ItemView {
    private currentItem: FeedItem | null = null;
    private readingContainer!: HTMLElement;
    private titleElement!: HTMLElement;
    private articleSaver: ArticleSaver;
    private settings: RssDashboardSettings;
    private onArticleSave: (item: FeedItem) => void;
    private webViewerIntegration: WebViewerIntegration | null = null;
    private podcastPlayer: PodcastPlayer | null = null;
    private videoPlayer: VideoPlayer | null = null;
    private relatedItems: FeedItem[] = [];
    private currentFullContent?: string;
    private turndownService = new TurndownService();
    
    public isPodcastPlaying(): boolean {
        if (!this.podcastPlayer) return false;
        const audioElement = (this.podcastPlayer as unknown as { audioElement?: HTMLAudioElement }).audioElement;
        return audioElement !== null && audioElement !== undefined && 
               !audioElement.paused && 
               audioElement.currentTime > 0;
    }

    constructor(leaf: WorkspaceLeaf, settings: RssDashboardSettings, articleSaver: ArticleSaver, onArticleSave: (item: FeedItem) => void) {
        super(leaf);
        this.settings = settings;
        this.articleSaver = articleSaver;
        this.onArticleSave = onArticleSave;
        
        
        try {
            const appWithPlugins = this.app as unknown as { plugins?: { plugins?: Record<string, unknown> } };
            const plugins = appWithPlugins.plugins?.plugins;
            if (plugins && "webpage-html-export" in plugins) {
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
                this.webViewerIntegration = new WebViewerIntegration(this.app as unknown as ObsidianApp, settings.articleSaving);
            }
        } catch {
            // Web viewer integration not available
        }
    }

    getViewType(): string {
        return RSS_READER_VIEW_TYPE;
    }

    getDisplayText(): string {
        return this.currentItem ? this.currentItem.title : "RSS reader";
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

    onOpen(): Promise<void> {
        this.contentEl.empty();
        this.contentEl.addClass("rss-reader-view");
        
        
        const header = this.contentEl.createDiv({ cls: "rss-reader-header" });
        
        
        const backButton = header.createDiv({ cls: "rss-reader-back-button" });
        setIcon(backButton, "arrow-left");
        backButton.addEventListener("click", () => {
            this.app.workspace.detachLeavesOfType(RSS_READER_VIEW_TYPE);
        });
        
        
        this.titleElement = header.createDiv({ cls: "rss-reader-title", text: "RSS reader" });
        
        
        this.currentItem = null;
        
        
        const actions = header.createDiv({ cls: "rss-reader-actions" });
        
        
        actions.createDiv({ 
            cls: "rss-reader-saved-label",
            text: "Saved"
        });
        
        
        const saveButton = actions.createDiv({ 
            cls: "rss-reader-action-button", 
            attr: { title: "Save article" } 
        });
        
        setIcon(saveButton, "save");
        saveButton.addEventListener("click", (e) => {
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
        return Promise.resolve();
    }

    
    private showSaveOptions(event: MouseEvent, item: FeedItem): void {
        const menu = new Menu();
        
        menu.addItem((menuItem: MenuItem) => {
            menuItem
                .setTitle("Save with default settings")
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
                .setTitle("Save to custom folder...")
                .setIcon("folder")
                .onClick(() => {
                    this.showCustomSaveModal(item);
                });
        });
        
        menu.showAtMouseEvent(event);
    }
    
    
    private showCustomSaveModal(item: FeedItem): void {
        const modal = document.body.createDiv({
            cls: "rss-dashboard-modal rss-dashboard-modal-container"
        });
        
        const modalContent = modal.createDiv({
            cls: "rss-dashboard-modal-content"
        });
        
        new Setting(modalContent).setName("Save article").setHeading();
        
        const folderLabel = modalContent.createEl("label", {
            text: "Save to folder:"
        });
        
        const folderInput = modalContent.createEl("input", {
            attr: {
                type: "text",
                placeholder: "Enter folder path",
                value: this.settings.articleSaving.defaultFolder || ""
            }
        });
        
        const templateLabel = modalContent.createEl("label", {
            text: "Use template:"
        });
        
        const templateInput = modalContent.createEl("textarea", {
            attr: {
                placeholder: "Enter template",
                rows: "6"
            }
        });
        templateInput.value = this.settings.articleSaving.defaultTemplate || "";
        
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
            
            const markdownContent = this.turndownService.turndown(this.currentFullContent || item.description || "");
            const file = await this.articleSaver.saveArticle(item, folder, undefined, markdownContent);
            if (file) {
                this.onArticleSave(item);
                
                this.updateSavedLabel(true);
            }
            
            document.body.removeChild(modal);
            })();
        });
        
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(saveButton);
        
        modalContent.appendChild(folderLabel);
        modalContent.appendChild(folderInput);
        modalContent.appendChild(templateLabel);
        modalContent.appendChild(templateInput);
        modalContent.appendChild(buttonContainer);
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
    }

    
    async displayItem(item: FeedItem, relatedItems: FeedItem[] = []): Promise<void> {
        if (this.readingContainer) {
            this.readingContainer.empty();
        }
        this.currentItem = item;
        this.relatedItems = relatedItems;

       
        if (this.titleElement) {
            this.titleElement.setText(item.title);
        }

        this.updateSavedLabel(false);

        if (item.saved) {
            const fileExists = this.checkSavedFileExists(item);
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
            }
        }

        if (item.mediaType === 'video' && !item.videoId && item.link) {
            const vid = MediaService.extractYouTubeVideoId(item.link);
            if (vid) item.videoId = vid;
        }

        if (item.mediaType === 'video' && item.videoId) {
            await this.displayVideo(item);
        } else if (item.mediaType === 'video' && item.videoUrl) {
            await this.displayVideoPodcast(item);
        } else if (item.mediaType === 'podcast' && (item.audioUrl || MediaService.extractPodcastAudio(item.description))) {
            if (!item.audioUrl) {
                const aud = MediaService.extractPodcastAudio(item.description);
                if (aud) item.audioUrl = aud;
            }
            await this.displayPodcast(item);
        } else {
            const fullContent = await this.fetchFullArticleContent(item.link);
            this.currentFullContent = fullContent;
            await this.displayArticle(item, fullContent);
        }

        if (!item.read) {
            item.read = true;
        }
    }
    
    
    private async displayVideo(item: FeedItem): Promise<void> {
        if (this.podcastPlayer) {
            this.podcastPlayer.destroy();
            this.podcastPlayer = null;
        }
        const container = this.readingContainer.createDiv({ 
            cls: "rss-reader-video-container enhanced" 
        });
        if (item.videoId) {
            this.videoPlayer = new VideoPlayer(container, (selectedVideo) => {
                void this.displayItem(selectedVideo, this.relatedItems);
            });
            this.videoPlayer.loadVideo(item);
            if (this.relatedItems.length > 0) {
                this.videoPlayer.setRelatedVideos(this.relatedItems);
            }
        } else {
            container.createDiv({
                cls: "rss-reader-error",
                text: "Video id not found. Cannot play this video."
            });
            await this.displayArticle(item);
        }
    }
    
    
    private async displayPodcast(item: FeedItem): Promise<void> {
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
            this.podcastPlayer = new PodcastPlayer(container, this.app);
            this.podcastPlayer.loadEpisode(item, fullFeedEpisodes);
        } else {
            const audioUrl = MediaService.extractPodcastAudio(item.description);
            if (audioUrl) {
                const podcastItem: FeedItem = {
                    ...item,
                    audioUrl: audioUrl
                };
                this.podcastPlayer = new PodcastPlayer(container, this.app);
                this.podcastPlayer.loadEpisode(podcastItem, fullFeedEpisodes);
            } else {
                container.createDiv({
                    cls: "rss-reader-error",
                    text: "Audio url not found. Cannot play this podcast."
                });
                await this.displayArticle(item);
            }
        }
    }
    
    
    private async displayArticle(item: FeedItem, fullContent?: string): Promise<void> {
        
        if (this.podcastPlayer) {
            this.podcastPlayer.destroy();
            this.podcastPlayer = null;
        }
        if (this.videoPlayer) {
            this.videoPlayer.destroy();
            this.videoPlayer = null;
        }
        
        
        if (this.webViewerIntegration) {
            try {
                const success = await this.webViewerIntegration.openInWebViewer(item.link, item.title);
                if (!success) {
                    
                    this.renderArticle(item, fullContent);
                }
            } catch {
                
                this.renderArticle(item, fullContent);
            }
            
            return;
        }
        
        
        this.renderArticle(item, fullContent);
    }
    
    
    private renderArticle(item: FeedItem, fullContent?: string): void {
        
        const headerContainer = this.readingContainer.createDiv({ cls: "rss-reader-article-header" });
        
        const titleSetting = new Setting(headerContainer).setName(item.title).setHeading();
        titleSetting.settingEl.addClass("rss-reader-item-title");
        
        
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
            const coverImg = imageContainer.createEl("img", {
                attr: {
                    src: (item.coverImage || (item.image && typeof item.image === "object" && (item.image as { url?: string }).url) || (typeof item.image === "string" ? item.image : "")) ?? "",
                    alt: item.title
                }
            });
            coverImg.addEventListener('error', function() {
                this.remove();
            });
        }
        
        const contentContainer = this.readingContainer.createDiv({ cls: "rss-reader-article-content" });

        
        const htmlString = ensureUtf8Meta(fullContent || item.description || "");
        const processedHtmlString = this.convertRelativeUrlsInContent(htmlString, item.link);
        const parser = new DOMParser();
        const doc = parser.parseFromString(processedHtmlString, "text/html");

        
        function appendNodes(parent: HTMLElement, nodes: NodeListOf<ChildNode>) {
            nodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    parent.appendText(node.textContent || "");
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as HTMLElement;
                    // Skip icon elements that shouldn't be rendered
                    const isIconElement = element.tagName === "I" && element.classList.contains("icon-class");
                    if (!isIconElement) {
                        const tag = element.tagName.toLowerCase() as keyof HTMLElementTagNameMap;
                        const el = parent.createEl(tag);
                        
                        Array.from(element.attributes).forEach(attr => {
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
            
            img.addEventListener('error', function() {
                this.remove();
            });
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
            const content = article?.content || "";
            
            return this.convertRelativeUrlsInContent(content, url);
        } catch {
            
            return "";
        }
    }

    
    private convertHtmlToMarkdown(html: string): string {
        return this.turndownService.turndown(html);
    }

    
    private showMarkdownView(markdownContent: string, item: FeedItem): void {
        const modal = document.body.createDiv({
            cls: "rss-reader-markdown-modal"
        });
        
        const modalContent = modal.createDiv({
            cls: "rss-reader-markdown-content"
        });
        
        modalContent.createDiv({
            text: markdownContent
        });
        
        const saveButton = modalContent.createEl("button", {
            text: "Save to vault"
        });
        saveButton.addEventListener("click", () => {
            void (async () => {
            const markdownContent = this.turndownService.turndown(this.currentFullContent || item.description || "");
            
            const file = await this.articleSaver.saveArticle(item, undefined, undefined, markdownContent);
            if (file) {
                this.onArticleSave(item);
            }
            document.body.removeChild(modal);
            })();
        });
        
        const closeButton = modalContent.createEl("button", {
            text: "Close"
        });
        closeButton.addEventListener("click", () => {
            document.body.removeChild(modal);
        });
        document.body.appendChild(modal);
    }

    onClose(): Promise<void> {
        this.contentEl.empty();
        return Promise.resolve();
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

    private resetTitle(): void {
        if (this.titleElement) {
            this.titleElement.setText("RSS reader");
        }
    }
    
    
    private checkSavedFileExists(item: FeedItem): boolean {
        try {
            
            const folder = this.settings.articleSaving.defaultFolder || "RSS articles";
            const filename = this.sanitizeFilename(item.title);
            const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;
            
            
            return this.app.vault.getAbstractFileByPath(filePath) !== null;
        } catch {
            
            return false;
        }
    }
    
    
    private sanitizeFilename(name: string): string {
        return name
            .replace(/[/\\:*?"<>|]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .substring(0, 100);
    }

    
    private async displayVideoPodcast(item: FeedItem): Promise<void> {
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
            const video = container.createEl("video", {
                cls: "rss-reader-video",
                attr: {
                    controls: "true",
                    ...(item.coverImage ? { poster: item.coverImage } : {})
                }
            });
            video.createEl("source", {
                attr: {
                    src: item.videoUrl,
                    type: "video/mp4"
                }
            });
            video.appendText("Your browser does not support the video tag.");
        } else {
            container.createDiv({
                cls: "rss-reader-error",
                text: "Video url not found. Cannot play this video podcast."
            });
            await this.displayArticle(item);
            return;
        }

        const infoSection = container.createDiv({ cls: "rss-video-info" });
        const titleSetting = new Setting(infoSection).setName(item.title).setHeading();
        titleSetting.settingEl.addClass("rss-video-title");
        const metaRow = infoSection.createDiv({ cls: "rss-video-meta-row" });
        metaRow.createDiv({ text: item.feedTitle, cls: "rss-video-channel" });
        metaRow.createDiv({ text: new Date(item.pubDate).toLocaleDateString(), cls: "rss-video-date" });

        const relatedContainer = container.createDiv({ cls: "rss-video-related" });
        relatedContainer.createEl("h4", { text: "From the same channel" });

        const relatedVideos = (this.settings.feeds.find(f => f.url === item.feedUrl)?.items || [])
            .filter(i => i.mediaType === "video" && i.guid !== item.guid)
            .slice(0, 6);

        if (relatedVideos.length > 0) {
            const relatedList = relatedContainer.createDiv({ cls: "rss-video-related-list rss-video-related-grid" });
            relatedVideos.forEach(video => {
                const videoItem = relatedList.createDiv({ cls: "rss-video-related-item rss-video-related-card" });
                if (video.coverImage) {
                    const thumbnail = videoItem.createDiv({ cls: "rss-video-related-thumbnail" });
                    thumbnail.createEl("img", {
                        attr: {
                            src: video.coverImage,
                            alt: video.title,
                        },
                    });
                }
                const videoInfo = videoItem.createDiv({ cls: "rss-video-related-info" });
                videoInfo.createDiv({ cls: "rss-video-related-title", text: video.title });
                videoInfo.createDiv({ cls: "rss-video-related-date", text: new Date(video.pubDate).toLocaleDateString() });
                videoItem.addEventListener("click", () => {
                    void this.displayItem(video, relatedVideos);
                });
            });
        } else {
            relatedContainer.createDiv({
                cls: "rss-video-related-empty",
                text: "No related videos found",
            });
        }
    }
}


