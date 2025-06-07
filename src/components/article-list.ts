import { Notice, Menu, MenuItem, setIcon } from "obsidian";
import { FeedItem, RssDashboardSettings } from "../types";


const MAX_VISIBLE_TAGS = 5;

interface ArticleListCallbacks {
    onArticleClick: (article: FeedItem) => void;
    onToggleViewStyle: (style: "list" | "card") => void;
    onRefreshFeeds: () => void;
    onCardSizeChange: (property: "width" | "height", value: number) => void;
    onArticleUpdate: (article: FeedItem, updates: Partial<FeedItem>, shouldRerender?: boolean) => void;
    onArticleSave: (article: FeedItem) => void;
}

export class ArticleList {
    private container: HTMLElement;
    private settings: RssDashboardSettings;
    private title: string;
    private articles: FeedItem[];
    private selectedArticle: FeedItem | null;
    private callbacks: ArticleListCallbacks;
    
    constructor(
        container: HTMLElement,
        settings: RssDashboardSettings,
        title: string,
        articles: FeedItem[],
        selectedArticle: FeedItem | null,
        callbacks: ArticleListCallbacks
    ) {
        this.container = container;
        this.settings = settings;
        this.title = title;
        this.articles = articles;
        this.selectedArticle = selectedArticle;
        this.callbacks = callbacks;
    }
    
    render(): void {
        
        const articlesList = this.container.querySelector('.rss-dashboard-articles-list');
        const scrollPosition = articlesList?.scrollTop;
        
        this.container.empty();
        
        this.renderHeader();
        this.renderArticles();
        
        
        if (articlesList && scrollPosition !== undefined) {
            requestAnimationFrame(() => {
                articlesList.scrollTop = scrollPosition;
            });
        }
    }
    
    private renderHeader(): void {
        const articlesHeader = this.container.createDiv({
            cls: "rss-dashboard-articles-header",
        });

        articlesHeader.createDiv({
            cls: "rss-dashboard-articles-title",
            text: this.title,
        });

     
        this.renderSearch(articlesHeader);

        const articleControls = articlesHeader.createDiv({
            cls: "rss-dashboard-article-controls",
        });

      
        const viewStyleToggle = articleControls.createDiv({
            cls: "rss-dashboard-view-toggle",
        });

        const listViewButton = viewStyleToggle.createEl("button", {
            cls: "rss-dashboard-list-view-button" +
                (this.settings.viewStyle === "list" ? " active" : ""),
            text: "List",
        });
        
        listViewButton.addEventListener("click", () => {
            this.callbacks.onToggleViewStyle("list");
        });

        const cardViewButton = viewStyleToggle.createEl("button", {
            cls: "rss-dashboard-card-view-button" +
                (this.settings.viewStyle === "card" ? " active" : ""),
            text: "Card",
        });
        
        cardViewButton.addEventListener("click", () => {
            this.callbacks.onToggleViewStyle("card");
        });

       
        const dashboardRefreshButton = articleControls.createEl("button", {
            cls: "rss-dashboard-refresh-button",
            text: "Refresh",
        });
        
        dashboardRefreshButton.addEventListener("click", () => {
            this.callbacks.onRefreshFeeds();
        });

       
        if (this.settings.viewStyle === "card") {
            const sizeControls = articleControls.createDiv({
                cls: "rss-dashboard-size-controls",
            });

         
            const widthControls = sizeControls.createDiv({
                cls: "rss-dashboard-width-controls",
            });

            const decreaseWidth = widthControls.createEl("button", {
                cls: "rss-dashboard-decrease-width",
                text: "W-",
            });
            
            decreaseWidth.addEventListener("click", () => {
                if (this.settings.cardWidth > 300) {
                    this.callbacks.onCardSizeChange("width", this.settings.cardWidth - 20);
                }
            });

            const increaseWidth = widthControls.createEl("button", {
                cls: "rss-dashboard-increase-width",
                text: "W+",
            });
            
            increaseWidth.addEventListener("click", () => {
                if (this.settings.cardWidth < 500) {
                    this.callbacks.onCardSizeChange("width", this.settings.cardWidth + 20);
                }
            });

   
            const heightControls = sizeControls.createDiv({
                cls: "rss-dashboard-height-controls",
            });

            const decreaseHeight = heightControls.createEl("button", {
                cls: "rss-dashboard-decrease-height",
                text: "H-",
            });
            
            decreaseHeight.addEventListener("click", () => {
                if (this.settings.cardHeight > 360) {
                    this.callbacks.onCardSizeChange("height", this.settings.cardHeight - 20);
                }
            });

            const increaseHeight = heightControls.createEl("button", {
                cls: "rss-dashboard-increase-height",
                text: "H+",
            });
            
            increaseHeight.addEventListener("click", () => {
                if (this.settings.cardHeight < 500) {
                    this.callbacks.onCardSizeChange("height", this.settings.cardHeight + 20);
                }
            });
        }
    }
    
    private renderSearch(parent: HTMLElement): void {
        const searchContainer = parent.createDiv({
            cls: "rss-dashboard-search-container",
        });
        
        const searchInput = searchContainer.createEl("input", {
            cls: "rss-dashboard-search-input",
            attr: {
                type: "text",
                placeholder: "Search articles...",
                autocomplete: "off",
                spellcheck: "false"
            },
        });

       
        searchInput.addEventListener("focus", () => {
            searchInput.select();
        });

    
        let searchTimeout: NodeJS.Timeout;
        
     
        searchInput.addEventListener("input", (e) => {
            const query = ((e.target as HTMLInputElement)?.value || "").toLowerCase().trim();
            
   
            if (searchTimeout) {
                clearTimeout(searchTimeout);
            }

         
            searchTimeout = setTimeout(() => {
              
                const articleElements = this.container.querySelectorAll(
                    ".rss-dashboard-article-item, .rss-dashboard-article-card"
                );
                
                articleElements.forEach((el) => {
                    const titleEl = el.querySelector(".rss-dashboard-article-title");
                    const title = titleEl?.textContent?.toLowerCase() || "";
                    
                    if (query && !title.includes(query)) {
                        (el as HTMLElement).style.display = "none";
                    } else {
                        (el as HTMLElement).style.display = "";
                    }
                });
            }, 150); 
        });
    }
    
    private renderArticles(): void {
      
        const articlesList = this.container.createDiv({
            cls: `rss-dashboard-articles-list rss-dashboard-${this.settings.viewStyle}-view`,
        });


        if (this.settings.viewStyle === "card") {
            articlesList.style.setProperty(
                "--card-width",
                `${this.settings.cardWidth}px`
            );
            articlesList.style.setProperty(
                "--card-height",
                `${this.settings.cardHeight}px`
            );
        }
        
        
        if (this.articles.length === 0) {
            const emptyState = articlesList.createDiv({
                cls: "rss-dashboard-empty-state",
            });
            const iconDiv = emptyState.createDiv();
            setIcon(iconDiv, "rss");
            iconDiv.style.width = "48px";
            iconDiv.style.height = "48px";
            emptyState.createEl("h3", { text: "No articles found" });
            emptyState.createEl("p", { text: "Try refreshing your feeds or adding new ones." });
            return;
        }

  
        const prevScroll = this.container.scrollTop;

       
        if (this.settings.viewStyle === "list") {
            this.renderListView(articlesList, this.articles);
        } else {
            this.renderCardView(articlesList);
        }

    
        if (this.container) this.container.scrollTop = prevScroll;
    }
    
    private renderListView(container: HTMLElement, articles: FeedItem[]): void {
        for (const article of articles) {
            const articleEl = container.createDiv({
                cls: "rss-dashboard-article-item" +
                    (article.read ? " read" : " unread") +
                    (article.starred ? " starred" : " unstarred") +
                    (article.saved ? " saved" : "") +
                    (article.mediaType === 'video' ? " video" : "") +
                    (article.mediaType === 'podcast' ? " podcast" : ""),
                attr: { id: `article-${article.guid}` }
            });

            const contentEl = articleEl.createDiv('rss-dashboard-article-content');

            
            const firstRow = contentEl.createDiv('rss-dashboard-list-row-1');

            
            const titleDiv = firstRow.createDiv({
                cls: "rss-dashboard-article-title rss-dashboard-list-title",
                text: article.title
            });

            
            const metaEl = firstRow.createDiv('rss-dashboard-article-meta');
            metaEl.createSpan({ text: '|' });
            metaEl.createSpan('rss-dashboard-article-source').setText(article.feedTitle);
            metaEl.createSpan({ text: '|' });
            metaEl.createSpan('rss-dashboard-article-date').setText(
                new Date(article.pubDate).toLocaleDateString()
            );

            
            const secondRow = contentEl.createDiv('rss-dashboard-list-row-2');

            
            const actionToolbar = secondRow.createDiv('rss-dashboard-action-toolbar rss-dashboard-list-toolbar');

            
            const saveButton = actionToolbar.createDiv({
                cls: `rss-dashboard-save-toggle ${article.saved ? "saved" : ""}`,
            });
            setIcon(saveButton, "lucide-save");
            if (!saveButton.querySelector('svg')) {
                saveButton.textContent = '💾';
            }
            saveButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (article.saved) {
                    new Notice("Article already saved. Look in your notes.");
                } else {
                    if (this.callbacks.onArticleSave) {
                        await this.callbacks.onArticleSave(article);
                        saveButton.classList.add("saved");
                        setIcon(saveButton, "lucide-save");
                        if (!saveButton.querySelector('svg')) {
                            saveButton.textContent = '💾';
                        }
                    }
                }
            });

            
            const readToggle = actionToolbar.createDiv({
                cls: `rss-dashboard-read-toggle ${article.read ? "read" : "unread"}`,
            });
            setIcon(readToggle, article.read ? "check-circle" : "circle");
            readToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.callbacks.onArticleUpdate(article, { read: !article.read }, false);
                readToggle.classList.toggle("read", !readToggle.classList.contains("read"));
                readToggle.classList.toggle("unread", !readToggle.classList.contains("unread"));
                setIcon(readToggle, article.read ? "check-circle" : "circle");
            });

            
            const starToggle = actionToolbar.createDiv({
                cls: `rss-dashboard-star-toggle ${article.starred ? "starred" : "unstarred"}`,
            });
            const starIcon = document.createElement('span');
            starIcon.className = 'rss-dashboard-star-icon';
            starToggle.appendChild(starIcon);
            setIcon(starIcon, article.starred ? "lucide-star" : "lucide-star-off");
            if (!starIcon.querySelector('svg')) {
                starIcon.textContent = article.starred ? '★' : '☆';
            }
            starToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.callbacks.onArticleUpdate(article, { starred: !article.starred }, false);
                starToggle.classList.toggle("starred", !starToggle.classList.contains("starred"));
                starToggle.classList.toggle("unstarred", !starToggle.classList.contains("unstarred"));
                const iconEl = starToggle.querySelector('.rss-dashboard-star-icon');
                if (iconEl) {
                    setIcon(iconEl as HTMLElement, article.starred ? "lucide-star" : "lucide-star-off");
                    if (!iconEl.querySelector('svg')) {
                        iconEl.textContent = article.starred ? '★' : '☆';
                    }
                }
            });

            
            const tagsDropdown = actionToolbar.createDiv({
                cls: "rss-dashboard-tags-dropdown",
            });
            const tagsToggle = tagsDropdown.createDiv({
                cls: "rss-dashboard-tags-toggle",
            });
            setIcon(tagsToggle, "tag");
            tagsToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.createPortalDropdown(tagsToggle, article, (tag, checked) => {
                    if (!article.tags) article.tags = [];
                    if (checked) {
                        if (!article.tags.some((t) => t.name === tag.name)) {
                            article.tags.push({ ...tag });
                        }
                    } else {
                        article.tags = article.tags.filter((t) => t.name !== tag.name);
                    }
                    
                    let tagsContainer = secondRow.querySelector('.rss-dashboard-article-tags');
                    if (!tagsContainer) {
                        tagsContainer = secondRow.createDiv('rss-dashboard-article-tags');
                    } else {
                        tagsContainer.innerHTML = '';
                    }
                    article.tags.forEach(tag => {
                        const tagEl = document.createElement('div');
                        tagEl.className = 'rss-dashboard-article-tag';
                        tagEl.textContent = tag.name;
                        tagEl.style.backgroundColor = tag.color;
                        // @ts-ignore
			tagsContainer.appendChild(tagEl);
                    });
                    this.callbacks.onArticleUpdate(article, { tags: article.tags }, false);
                });
            });

            
            let tagsEl: HTMLElement | null = null;
            if (article.tags && article.tags.length > 0) {
                tagsEl = secondRow.createDiv('rss-dashboard-article-tags');
                article.tags.forEach(tag => {
                    const tagEl = tagsEl!.createDiv({
                        cls: 'rss-dashboard-article-tag',
                        text: tag.name,
                    });
                    tagEl.style.backgroundColor = tag.color;
                });
            }

            
            articleEl.addEventListener("click", () => {
                this.callbacks.onArticleClick(article);
            });
            articleEl.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                this.showArticleContextMenu(e, article);
            });
        }
    }
    
    private renderCardView(container: HTMLElement): void {
        for (const article of this.articles) {
            const articleEl = container.createDiv({
                cls: "rss-dashboard-article-card" +
                    (article === this.selectedArticle ? " active" : "") +
                    (article.read ? " read" : " unread") +
                    (article.saved ? " saved" : "") +
                    (article.mediaType === 'video' ? " rss-dashboard-youtube-article" : "") +
                    (article.mediaType === 'podcast' ? " rss-dashboard-podcast-article" : ""),
                attr: { id: `article-${article.guid}` }
            });

            const cardContent = articleEl.createDiv({
                cls: "rss-dashboard-card-content",
            });

            
            cardContent.createDiv({
                cls: "rss-dashboard-article-title",
                text: article.title,
            });

            
            const articleMeta = cardContent.createDiv({
                cls: "rss-dashboard-article-meta",
            });
            
            const feedContainer = articleMeta.createDiv({
                cls: "rss-dashboard-article-feed-container",
            });
            
            if (article.mediaType === 'video') {
                setIcon(feedContainer, "video");
            } else if (article.mediaType === 'podcast') {
                setIcon(feedContainer, "podcast");
            }
            feedContainer.createDiv({
                cls: "rss-dashboard-article-feed",
                text: article.feedTitle,
            });

            
            let coverImgSrc = article.coverImage;
            if (!coverImgSrc && article.content) {
                const extracted = extractFirstImageSrc(article.content);
                if (extracted) coverImgSrc = extracted;
            }
            if (!coverImgSrc && article.summary) {
                const extracted = extractFirstImageSrc(article.summary);
                if (extracted) coverImgSrc = extracted;
            }

            if (coverImgSrc) {
                
                const coverContainer = cardContent.createDiv({
                    cls: "rss-dashboard-cover-container" + (article.summary ? " has-summary" : ""),
                });
                const coverImg = coverContainer.createEl("img", {
                    cls: "rss-dashboard-cover-image",
                    attr: {
                        src: coverImgSrc,
                        alt: article.title,
                    },
                });
                coverImg.onerror = () => {
                    coverContainer.remove();
                };
                
                if (article.summary) {
                    const summaryOverlay = coverContainer.createDiv({
                        cls: "rss-dashboard-summary-overlay",
                    });
                    summaryOverlay.textContent = article.summary;
                }
            } else if (article.summary) {
                
                const summaryOnlyContainer = cardContent.createDiv({
                    cls: "rss-dashboard-cover-summary-only",
                });
                summaryOnlyContainer.textContent = article.summary;
            }

            
            if (article.tags && article.tags.length > 0) {
                const tagsContainer = cardContent.createDiv({
                    cls: "rss-dashboard-article-tags",
                });
                const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
                tagsToShow.forEach(tag => {
                    const tagEl = tagsContainer.createDiv({
                        cls: "rss-dashboard-article-tag",
                        text: tag.name,
                    });
                    tagEl.style.backgroundColor = tag.color;
                });
                if (article.tags.length > MAX_VISIBLE_TAGS) {
                    const overflowTag = tagsContainer.createDiv({
                        cls: "rss-dashboard-tag-overflow",
                        text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
                    });
                    overflowTag.title = article.tags.slice(MAX_VISIBLE_TAGS).map(t => t.name).join(", ");
                }
            }

            
            const actionToolbar = cardContent.createDiv({
                cls: "rss-dashboard-action-toolbar",
            });
            
            const saveButton = actionToolbar.createDiv({
                cls: `rss-dashboard-save-toggle ${article.saved ? "saved" : ""}`,
            });
            setIcon(saveButton, "lucide-save");
            if (!saveButton.querySelector('svg')) {
                saveButton.textContent = '💾';
            }
            saveButton.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (article.saved) {
                    new Notice("Article already saved. Look in your notes.");
                } else {
                    if (this.callbacks.onArticleSave) {
                        await this.callbacks.onArticleSave(article);
                        saveButton.classList.add("saved");
                        setIcon(saveButton, "lucide-save");
                        if (!saveButton.querySelector('svg')) {
                            saveButton.textContent = '💾';
                        }
                    }
                }
            });
            
            const readToggle = actionToolbar.createDiv({
                cls: `rss-dashboard-read-toggle ${article.read ? "read" : "unread"}`,
            });
            setIcon(readToggle, article.read ? "check-circle" : "circle");
            readToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.callbacks.onArticleUpdate(article, { read: !article.read }, false);
                readToggle.classList.toggle("read", !readToggle.classList.contains("read"));
                readToggle.classList.toggle("unread", !readToggle.classList.contains("unread"));
                setIcon(readToggle, article.read ? "check-circle" : "circle");
            });
            
            const starToggle = actionToolbar.createDiv({
                cls: `rss-dashboard-star-toggle ${article.starred ? "starred" : "unstarred"}`,
            });
            const starIcon = document.createElement('span');
            starIcon.className = 'rss-dashboard-star-icon';
            starToggle.appendChild(starIcon);
            setIcon(starIcon, article.starred ? "lucide-star" : "lucide-star-off");
            if (!starIcon.querySelector('svg')) {
                starIcon.textContent = article.starred ? '★' : '☆';
            }
            starToggle.addEventListener("click", (e) => {
                e.stopPropagation();
                this.callbacks.onArticleUpdate(article, { starred: !article.starred }, false);
                starToggle.classList.toggle("starred", !starToggle.classList.contains("starred"));
                starToggle.classList.toggle("unstarred", !starToggle.classList.contains("unstarred"));
                const iconEl = starToggle.querySelector('.rss-dashboard-star-icon');
                if (iconEl) {
                    setIcon(iconEl as HTMLElement, article.starred ? "lucide-star" : "lucide-star-off");
                    if (!iconEl.querySelector('svg')) {
                        iconEl.textContent = article.starred ? '★' : '☆';
                    }
                }
            });
            
            const tagsDropdown = actionToolbar.createDiv({
                cls: "rss-dashboard-tags-dropdown",
            });
            const tagsToggle = tagsDropdown.createDiv({
                cls: "rss-dashboard-tags-toggle",
            });
            setIcon(tagsToggle, "tag");

            tagsToggle.addEventListener("click", (e) => {
                    e.stopPropagation();
                this.createPortalDropdown(tagsToggle, article, (tag, checked) => {
                    if (!article.tags) article.tags = [];
                    if (checked) {
                        if (!article.tags.some((t) => t.name === tag.name)) {
                            article.tags.push({ ...tag });
                        }
                    } else {
                        article.tags = article.tags.filter((t) => t.name !== tag.name);
                    }
                    
                    
                    const articleEl = document.getElementById(`article-${article.guid}`);
                    if (articleEl) {
                        let tagsContainer = articleEl.querySelector('.rss-dashboard-article-tags');
                        if (!tagsContainer) {
                            const cardContent = articleEl.querySelector('.rss-dashboard-card-content') || articleEl;
                            const actionToolbar = cardContent.querySelector('.rss-dashboard-action-toolbar');
                            tagsContainer = document.createElement('div');
                            tagsContainer.className = 'rss-dashboard-article-tags';
                            cardContent.insertBefore(tagsContainer, actionToolbar);
                        } else {
                            tagsContainer.innerHTML = '';
                        }
                        
                        const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
                        tagsToShow.forEach(tag => {
                            const tagEl = document.createElement('div');
                            tagEl.className = 'rss-dashboard-article-tag';
                            tagEl.textContent = tag.name;
                            tagEl.style.background = tag.color || 'var(--interactive-accent)';
                            // @ts-ignore
			tagsContainer.appendChild(tagEl);
                        });
                        
                        if (article.tags.length > MAX_VISIBLE_TAGS) {
                            const overflowTag = document.createElement('div');
                            overflowTag.className = 'rss-dashboard-tag-overflow';
                            overflowTag.textContent = `+${article.tags.length - MAX_VISIBLE_TAGS}`;
                            overflowTag.title = article.tags.slice(MAX_VISIBLE_TAGS).map(t => t.name).join(', ');
                            tagsContainer.appendChild(overflowTag);
                        }
                    }
                    
                    
                    const index = this.articles.findIndex(a => a.guid === article.guid);
                    if (index !== -1) {
                        this.articles[index] = { ...article };
                    }
                    
                    
                    this.callbacks.onArticleUpdate(article, { tags: article.tags }, false);
                });
            });

            
            const dateEl = actionToolbar.createDiv({
                cls: "rss-dashboard-article-date",
                text: new Date(article.pubDate).toLocaleDateString(),
            });
            dateEl.style.marginLeft = "auto";

            articleEl.addEventListener("click", () => {
                this.callbacks.onArticleClick(article);
            });
            
            articleEl.addEventListener("contextmenu", (e) => {
                e.preventDefault();
                this.showArticleContextMenu(e, article);
            });
        }
    }
    
    /**
     * Show context menu for an article
     */
    private showArticleContextMenu(event: MouseEvent, article: FeedItem): void {
        const menu = new Menu();
        
        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Open in Browser")
                .setIcon("external-link")
                .onClick(() => {
                    window.open(article.link, "_blank");
                });
        });
        
        menu.addItem((item: MenuItem) => {
            item.setTitle("Open in Split View")
                .setIcon("layout-split")
                .onClick(() => {
                    this.callbacks.onArticleClick(article);
                });
        });
        
        
        menu.addItem((item: MenuItem) => {
            item.setTitle(article.read ? "Mark as Unread" : "Mark as Read")
                .setIcon(article.read ? "circle" : "check-circle")
                .onClick(() => {
                    this.callbacks.onArticleUpdate(article, { read: !article.read }, false);
                });
        });
        
        menu.addItem((item: MenuItem) => {
            item.setTitle(article.starred ? "Remove Star" : "Star")
                .setIcon("star")
                .onClick(() => {
                    this.callbacks.onArticleUpdate(article, { starred: !article.starred }, false);
                });
        });
        
        
        if (!article.saved) {
            menu.addItem((item: MenuItem) => {
                item.setTitle("Save to Notes")
                    .setIcon("save")
                    .onClick(() => {
                        this.callbacks.onArticleSave(article);
                    });
            });
        }
        
        menu.showAtMouseEvent(event);
    }

    
    private createPortalDropdown(
        toggleElement: HTMLElement,
        article: FeedItem,
        onTagChange: (tag: any, checked: boolean) => void
    ): void {
        
        document.querySelectorAll(".rss-dashboard-tags-dropdown-content-portal").forEach((el) => {
            (el as HTMLElement).parentNode?.removeChild(el);
        });

        
        const portalDropdown = document.createElement("div");
        portalDropdown.className = "rss-dashboard-tags-dropdown-content rss-dashboard-tags-dropdown-content-portal";

        
        for (const tag of this.settings.availableTags) {
            const tagItem = document.createElement("div");
            tagItem.className = "rss-dashboard-tag-item";
            const hasTag = article.tags?.some((t) => t.name === tag.name) || false;
            
            const tagCheckbox = document.createElement("input");
            tagCheckbox.className = "rss-dashboard-tag-checkbox";
            tagCheckbox.type = "checkbox";
            tagCheckbox.checked = hasTag;
            
            const tagLabel = document.createElement("div");
            tagLabel.className = "rss-dashboard-tag-label";
            tagLabel.textContent = tag.name;
            tagLabel.style.backgroundColor = tag.color;

            tagCheckbox.addEventListener("change", (e) => {
                e.stopPropagation();
                onTagChange(tag, (e.target as HTMLInputElement).checked);
            });

            tagItem.appendChild(tagCheckbox);
            tagItem.appendChild(tagLabel);
            portalDropdown.appendChild(tagItem);
        }

        
        document.body.appendChild(portalDropdown);
        const rect = toggleElement.getBoundingClientRect();
        const dropdownRect = portalDropdown.getBoundingClientRect();
        
        let anchorLeft = rect.left + window.scrollX;
        let anchorTop = rect.bottom + window.scrollY;
        let alignRight = false;
        let alignAbove = false;

        
        if (anchorLeft + dropdownRect.width > window.innerWidth - 8) {
            alignRight = true;
            anchorLeft = Math.max(8, rect.right + window.scrollX);
        }
        if (anchorTop + dropdownRect.height > window.innerHeight - 8) {
            alignAbove = true;
        }

        
        portalDropdown.classList.add(
            alignRight ? "dropdown-align-right" : "dropdown-align-left",
            alignAbove ? "dropdown-align-above" : "dropdown-align-below"
        );

        
        portalDropdown.style.setProperty(
            "--dropdown-anchor-top",
            `${alignAbove ? rect.top + window.scrollY - dropdownRect.height : anchorTop}px`
        );
        portalDropdown.style.setProperty(
            "--dropdown-anchor-left",
            `${alignRight ? rect.right + window.scrollX : anchorLeft}px`
        );
        portalDropdown.style.setProperty("--dropdown-anchor-width", `${rect.width}px`);

        
        setTimeout(() => {
            const handleClickOutside = (ev: MouseEvent) => {
                if (portalDropdown && !portalDropdown.contains(ev.target as Node)) {
                    portalDropdown.remove();
                    document.removeEventListener("mousedown", handleClickOutside);
                }
            };
            document.addEventListener("mousedown", handleClickOutside);
        }, 0);
    }
}

function extractFirstImageSrc(html: string): string | null {
    const div = document.createElement("div");
    div.innerHTML = html;
    const img = div.querySelector("img");
    return img ? img.getAttribute("src") : null;
}
