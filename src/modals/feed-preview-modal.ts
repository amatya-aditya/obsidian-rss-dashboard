import { Modal, App, setIcon, Setting } from "obsidian";
import { FeedMetadata } from "../types/discover-types";
import { fetchFeedXml } from "../services/feed-parser";

interface PreviewArticle {
    title: string;
    link: string;
    description: string;
    pubDate: string;
    author?: string;
    image?: string;
}

export class FeedPreviewModal extends Modal {
    private feed: FeedMetadata;
    private articles: PreviewArticle[] = [];
    private isLoading = true;
    private error: string | null = null;

    constructor(app: App, feed: FeedMetadata) {
        super(app);
        this.feed = feed;
    }

    onOpen() {
        const { contentEl } = this;
        this.modalEl.addClasses(["rss-dashboard-modal", "rss-dashboard-modal-container", "feed-preview-modal"]);
        contentEl.empty();
        
        this.renderHeader(contentEl);
        this.loadFeedPreview();
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv({ cls: "feed-preview-header" });
        
        const titleSection = header.createDiv({ cls: "feed-preview-title-section" });
        
        
        const logoContainer = titleSection.createDiv({ cls: 'feed-preview-logo-container' });
        if (this.feed.imageUrl) {
            logoContainer.createEl('img', { cls: 'feed-preview-logo', attr: { src: this.feed.imageUrl } });
        } else {
            logoContainer.createDiv({ cls: 'feed-preview-initials', text: this.getInitials(this.feed.title) });
        }

        const titleInfo = titleSection.createDiv({ cls: 'feed-preview-title-info' });
        const titleSetting = new Setting(titleInfo).setName(this.feed.title).setHeading();
        titleSetting.settingEl.addClass("feed-preview-title");
        titleInfo.createEl("p", { text: this.feed.url, cls: "feed-preview-url" });
        
        if (this.feed.summary) {
            titleInfo.createEl("p", { text: this.feed.summary, cls: "feed-preview-summary" });
        }

        
        const metaContainer = header.createDiv({ cls: "feed-preview-meta" });
        
        if (this.feed.type) {
            const typeEl = metaContainer.createDiv({ cls: "feed-preview-type" });
            typeEl.textContent = this.feed.type;
        }

        if (this.feed.domain.length > 0) {
            const categories = metaContainer.createDiv({ cls: "feed-preview-categories" });
            this.feed.domain.forEach(category => {
                const categoryEl = categories.createDiv({ cls: "feed-preview-category", text: category });
                categoryEl.style.setProperty('--tag-color', this.getTagColor(category));
            });
        }

        if (this.feed.tags.length > 0) {
            const tags = metaContainer.createDiv({ cls: "feed-preview-tags" });
            this.feed.tags.forEach(tag => {
                const tagEl = tags.createDiv({ cls: "feed-preview-tag", text: tag });
                tagEl.style.setProperty('--tag-color', this.getTagColor(tag));
            });
        }
    }

    private async loadFeedPreview(): Promise<void> {
        try {
            this.isLoading = true;
            this.error = null;

            const xmlString = await fetchFeedXml(this.feed.url);
            this.articles = this.parseFeedXml(xmlString);
            
            this.renderContent();
        } catch (error) {
            
            this.error = error instanceof Error ? error.message : 'Unknown error occurred';
            this.renderError();
        } finally {
            this.isLoading = false;
        }
    }

    private parseFeedXml(xmlString: string): PreviewArticle[] {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(xmlString, "text/xml");
            
            const articles: PreviewArticle[] = [];
            
            
            const items = doc.querySelectorAll('item');
            if (items.length > 0) {
                items.forEach((item, index) => {
                    if (index >= 10) return; 
                    
                    const title = item.querySelector('title')?.textContent?.trim() || '';
                    const link = item.querySelector('link')?.textContent?.trim() || '';
                    const description = item.querySelector('description')?.textContent?.trim() || '';
                    const pubDate = item.querySelector('pubDate')?.textContent?.trim() || '';
                    const author = item.querySelector('author')?.textContent?.trim() || 
                                 item.querySelector('dc\\:creator')?.textContent?.trim() || '';
                    
                    
                    let image = '';
                    const content = item.querySelector('content\\:encoded')?.textContent || description;
                    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
                    if (imgMatch) {
                        image = imgMatch[1];
                    } else {
                        
                        const mediaContent = item.querySelector('media\\:content');
                        if (mediaContent) {
                            const mediaUrl = mediaContent.getAttribute('url');
                            if (mediaUrl) {
                                image = mediaUrl;
                            }
                        } else {
                            const enclosure = item.querySelector('enclosure[type^="image"]');
                            if (enclosure) {
                                image = enclosure.getAttribute('url') || '';
                            }
                        }
                    }

                    articles.push({
                        title,
                        link,
                        description: this.sanitizeText(description),
                        pubDate,
                        author,
                        image
                    });
                });
            } else {
                
                const entries = doc.querySelectorAll('entry');
                entries.forEach((entry, index) => {
                    if (index >= 10) return; 
                    
                    const title = entry.querySelector('title')?.textContent?.trim() || '';
                    const link = entry.querySelector('link')?.getAttribute('href') || '';
                    const description = entry.querySelector('summary')?.textContent?.trim() || 
                                      entry.querySelector('content')?.textContent?.trim() || '';
                    const pubDate = entry.querySelector('published')?.textContent?.trim() || 
                                   entry.querySelector('updated')?.textContent?.trim() || '';
                    const author = entry.querySelector('author > name')?.textContent?.trim() || '';

                    articles.push({
                        title,
                        link,
                        description: this.sanitizeText(description),
                        pubDate,
                        author
                    });
                });
            }

            return articles;
        } catch (error) {
            
            return [];
        }
    }

    private sanitizeText(text: string): string {
        if (!text) return '';
        
        return text
            .replace(/<[^>]*>/g, '') 
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&#x27;/g, "'")
            .replace(/&#x2F;/g, '/')
            .replace(/\s+/g, ' ') 
            .trim();
    }

    private renderError(): void {
        const container = this.contentEl;
        const errorEl = container.createDiv({ cls: "feed-preview-error" });
        setIcon(errorEl, "alert-triangle");
        errorEl.appendText(` Error: ${this.error}`);
        
        const retryBtn = errorEl.createEl("button", { cls: "mod-cta" });
        retryBtn.textContent = "Retry";
        retryBtn.addEventListener("click", () => this.loadFeedPreview());
    }

    private renderContent(): void {
        const container = this.contentEl;
        
        if (this.articles.length === 0) {
            const emptyEl = container.createDiv({ cls: "feed-preview-empty" });
            setIcon(emptyEl, "rss");
            emptyEl.appendText(" No articles found in this feed");
            return;
        }

        const contentSection = container.createDiv({ cls: "feed-preview-content" });
        
        const header = contentSection.createDiv({ cls: "feed-preview-articles-header" });
        const headerSetting = new Setting(header).setName(`Latest ${this.articles.length} articles`).setHeading();
        headerSetting.settingEl.addClass("feed-preview-articles-title");
        
        const grid = contentSection.createDiv({ cls: "feed-preview-grid" });
        
        this.articles.forEach(article => {
            this.renderArticleCard(grid, article);
        });
    }

    private renderArticleCard(container: HTMLElement, article: PreviewArticle): void {
        const card = container.createDiv({ cls: "feed-preview-article-card" });
        
        if (article.image) {
            const imageContainer = card.createDiv({ cls: "feed-preview-article-image-container" });
            const img = imageContainer.createEl('img', { 
                cls: 'feed-preview-article-image',
                attr: { src: article.image }
            });
            img.addEventListener('error', () => {
                imageContainer.remove();
            });
        }

        const content = card.createDiv({ cls: "feed-preview-article-content" });
        
        const title = content.createEl("h4", { 
            text: article.title, 
            cls: "feed-preview-article-title" 
        });
        title.addEventListener('click', () => {
            window.open(article.link, '_blank');
        });

        if (article.description) {
            content.createDiv({ 
                text: article.description.length > 150 
                    ? article.description.substring(0, 150) + '...' 
                    : article.description,
                cls: "feed-preview-article-description" 
            });
        }

        const meta = content.createDiv({ cls: "feed-preview-article-meta" });
        
        if (article.author) {
            const author = meta.createDiv({ cls: "feed-preview-article-author" });
            setIcon(author, "user");
            author.appendText(` ${article.author}`);
        }

        if (article.pubDate) {
            const date = meta.createDiv({ cls: "feed-preview-article-date" });
            setIcon(date, "calendar");
            const pubDate = new Date(article.pubDate);
            const formattedDate = pubDate.toLocaleDateString();
            date.appendText(` ${formattedDate}`);
        }

        
        
        
        
        
        
        
        
        
     }

    private getInitials(title: string): string {
        const words = title.split(' ');
        if (words.length > 1) {
            return (words[0][0] + words[1][0]).toUpperCase();
        } else if (words.length === 1 && words[0].length > 1) {
            return (words[0][0] + words[0][1]).toUpperCase();
        } else if (words.length === 1 && words[0].length === 1) {
            return words[0][0].toUpperCase();
        }
        return 'NA';
    }

    private getTagColor(tag: string): string {
        let hash = 0;
        if (tag.length === 0) return 'hsl(0, 0%, 80%)';
        for (let i = 0; i < tag.length; i++) {
            hash = tag.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash;
        }
        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 60%, 75%)`;
    }

    onClose() {
        this.contentEl.empty();
    }
} 
