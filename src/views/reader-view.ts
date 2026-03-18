import {
  ItemView,
  WorkspaceLeaf,
  Menu,
  MenuItem,
  App,
  Setting,
  requireApiVersion,
} from "obsidian";
import { setIcon } from "obsidian";
import {
  RssDashboardSettings,
  FeedItem,
  ReaderFormatSettings,
  DEFAULT_SETTINGS,
  ArticleSavingSettings,
  Tag,
} from "../types/types";
import { HighlightService } from "../services/highlight-service";
import { ArticleSaver } from "../services/article-saver";
import { robustFetch, ensureUtf8Meta, setCssProps } from "../utils/platform-utils";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { WebViewerIntegration } from "../services/web-viewer-integration";
import { MediaService } from "../services/media-service";

interface RssDashboardPluginInterface {
  openTagsSettings(): void;
  manifest: { id: string };
}

interface ExtendedApp extends App {
  plugins: {
    getPlugin(id: string): RssDashboardPluginInterface | null;
  };
  setting: {
    open(): void;
    openTabById(id: string): void;
  };
}
import { PodcastPlayer } from "./podcast-player";
import { VideoPlayer } from "./video-player";
import { RSS_DASHBOARD_VIEW_TYPE } from "./dashboard-view";

export const RSS_READER_VIEW_TYPE = "rss-reader-view";

export class ReaderView extends ItemView {
  private currentItem: FeedItem | null = null;
  private readingContainer!: HTMLElement;
  private titleElement!: HTMLElement;
  private articleSaver: ArticleSaver;
  private settings: RssDashboardSettings;
  private onArticleSave: (item: FeedItem) => void;
  private onArticleUpdate: (
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void;
  private webViewerIntegration: WebViewerIntegration | null = null;
  private podcastPlayer: PodcastPlayer | null = null;
  private videoPlayer: VideoPlayer | null = null;
  private relatedItems: FeedItem[] = [];
  private currentFullContent?: string;
  private turndownService = new TurndownService();
  private readToggleButton: HTMLElement | null = null;
  private starToggleButton: HTMLElement | null = null;
  private returnLeaf: WorkspaceLeaf | null = null;
  private tagsDropdownPortal: HTMLElement | null = null;
  private tagsDropdownBackdrop: HTMLElement | null = null;
  private tagsDropdownOutsideHandler: ((event: MouseEvent) => void) | null =
    null;
  private tagsDropdownDocument: Document | null = null;
  private tagsDropdownViewportCleanup: (() => void) | null = null;

  private readerFormatPortal: HTMLElement | null = null;
  private readerFormatBackdrop: HTMLElement | null = null;
  private readerFormatOutsideHandler: ((event: MouseEvent) => void) | null =
    null;
  private readerFormatDocument: Document | null = null;
  private readerFormatViewportCleanup: (() => void) | null = null;
  private readerFormatSaveTimeout: number | null = null;

  public setReturnLeaf(leaf: WorkspaceLeaf | null): void {
    this.returnLeaf = leaf;
  }

  private async navigateBackToDashboard(): Promise<void> {
    const dashboardLeaves = this.app.workspace.getLeavesOfType(
      RSS_DASHBOARD_VIEW_TYPE,
    );
    const targetLeaf =
      this.returnLeaf && dashboardLeaves.includes(this.returnLeaf)
        ? this.returnLeaf
        : (dashboardLeaves[0] ?? null);

    if (targetLeaf) {
      this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
      await this.app.workspace.revealLeaf(targetLeaf);
    }

    this.leaf.detach();
  }

  public isPodcastPlaying(): boolean {
    if (!this.podcastPlayer) return false;
    const audioElement = (
      this.podcastPlayer as unknown as { audioElement?: HTMLAudioElement }
    ).audioElement;
    return (
      audioElement !== null &&
      audioElement !== undefined &&
      !audioElement.paused &&
      audioElement.currentTime > 0
    );
  }

  constructor(
    leaf: WorkspaceLeaf,
    settings: RssDashboardSettings,
    articleSaver: ArticleSaver,
    onArticleSave: (item: FeedItem) => void,
    onArticleUpdate: (
      item: FeedItem,
      updates: Partial<FeedItem>,
      shouldRerender?: boolean,
    ) => void,
  ) {
    super(leaf);
    this.settings = settings;
    this.articleSaver = articleSaver;
    this.onArticleSave = onArticleSave;
    this.onArticleUpdate = onArticleUpdate;

    try {
      const appWithPlugins = this.app as unknown as {
        plugins?: { plugins?: Record<string, unknown> };
      };
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
        this.webViewerIntegration = new WebViewerIntegration(
          this.app as unknown as ObsidianApp,
          settings.articleSaving,
        );
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
      if (this.currentItem.mediaType === "video") {
        return "play-circle";
      } else if (this.currentItem.mediaType === "podcast") {
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

    const handleBackClick = () => {
      void this.navigateBackToDashboard();
    };

    backButton.addEventListener("click", handleBackClick);

    this.titleElement = header.createDiv({
      cls: "rss-reader-title",
      text: "RSS reader",
    });

    this.currentItem = null;

    const actions = header.createDiv({ cls: "rss-reader-actions" });

    // Save button
    const saveButton = actions.createDiv({
      cls: "rss-reader-action-button",
      attr: { title: "Save article" },
    });

    setIcon(saveButton, "save");
    saveButton.addEventListener("click", (e) => {
      if (this.currentItem) {
        this.showSaveOptions(e, this.currentItem);
      }
    });

    // Read toggle button
    this.readToggleButton = actions.createDiv({
      cls: "rss-reader-action-button rss-reader-read-toggle",
      attr: { title: "Mark as read/unread" },
    });
    setIcon(this.readToggleButton, "circle");
    this.readToggleButton.addEventListener("click", () => {
      if (this.currentItem) {
        this.toggleReadStatus();
      }
    });

    // Star toggle button
    this.starToggleButton = actions.createDiv({
      cls: "rss-reader-action-button rss-reader-star-toggle",
      attr: { title: "Star/unstar article" },
    });
    setIcon(this.starToggleButton, "star-off");
    this.starToggleButton.addEventListener("click", () => {
      if (this.currentItem) {
        this.toggleStarStatus();
      }
    });

    // Tags button
    const tagsButton = actions.createDiv({
      cls: "rss-reader-action-button rss-reader-tags-button",
      attr: { title: "Manage tags" },
    });
    setIcon(tagsButton, "tag");
    tagsButton.addEventListener("click", (e) => {
      if (this.currentItem) {
        this.showTagsDropdown(e, this.currentItem);
      }
    });

    // Reader formatting button
    const readerFormatButton = actions.createDiv({
      cls: "rss-reader-action-button rss-reader-format-button",
      attr: { title: "Reader settings" },
    });
    setIcon(readerFormatButton, "type");
    readerFormatButton.addEventListener("click", (e) => {
      this.toggleReaderFormatDropdown(e as MouseEvent);
    });

    // Open in browser button
    const browserButton = actions.createDiv({
      cls: "rss-reader-action-button",
      attr: { title: "Open in Browser" },
    });
    setIcon(browserButton, "globe-2");
    browserButton.addEventListener("click", () => {
      if (this.currentItem) {
        window.open(this.currentItem.link, "_blank");
      }
    });

    this.readingContainer = this.contentEl.createDiv({
      cls: "rss-reader-content",
    });

    this.applyReaderFormat();
    return Promise.resolve();
  }

  private getCustomTemplateForArticle(item: FeedItem): string | undefined {
    const feed = this.settings.feeds.find((f) => f.url === item.feedUrl);
    if (feed?.customTemplate) {
      const articleSaving: ArticleSavingSettings = this.settings.articleSaving;
      const savedTemplates = articleSaving.savedTemplates ?? [];
      const templateObj = savedTemplates.find(
        (t) => t.id === feed.customTemplate,
      );
      if (templateObj) {
        return templateObj.template;
      }
    }
    return undefined;
  }

  private showSaveOptions(event: MouseEvent, item: FeedItem): void {
    const menu = new Menu();

    menu.addItem((menuItem: MenuItem) => {
      menuItem
        .setTitle("Save with default settings")
        .setIcon("save")
        .onClick(async () => {
          const markdownContent = this.turndownService.turndown(
            this.currentFullContent || item.description || "",
          );
          const customTemplate = this.getCustomTemplateForArticle(item);
          const file = await this.articleSaver.saveArticle(
            item,
            undefined,
            customTemplate,
            markdownContent,
          );
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
      cls: "rss-dashboard-modal rss-dashboard-modal-container",
    });

    const modalContent = modal.createDiv({
      cls: "rss-dashboard-modal-content",
    });

    new Setting(modalContent).setName("Save article").setHeading();

    const folderLabel = modalContent.createEl("label", {
      text: "Save to folder:",
    });

    const folderInput = modalContent.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Enter folder path",
        value: this.settings.articleSaving.defaultFolder || "",
      },
    });

    const templateLabel = modalContent.createEl("label", {
      text: "Use template:",
    });

    const templateInput = modalContent.createEl("textarea", {
      attr: {
        placeholder: "Enter template",
        rows: "6",
      },
    });
    // Pre-populate with feed's custom template if available, otherwise use default
    const feedTemplate = this.getCustomTemplateForArticle(item);
    templateInput.value =
      feedTemplate || this.settings.articleSaving.defaultTemplate || "";

    const buttonContainer = modalContent.createDiv({
      cls: "rss-dashboard-modal-buttons",
    });

    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
    });
    cancelButton.addEventListener("click", () => {
      document.body.removeChild(modal);
    });

    const saveButton = buttonContainer.createEl("button", {
      text: "Save",
      cls: "rss-dashboard-primary-button",
    });
    saveButton.addEventListener("click", () => {
      void (async () => {
        const folder = folderInput.value.trim();
        const template = templateInput.value.trim() || undefined;

        const markdownContent = this.turndownService.turndown(
          this.currentFullContent || item.description || "",
        );
        const file = await this.articleSaver.saveArticle(
          item,
          folder,
          template,
          markdownContent,
        );
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

  async displayItem(
    item: FeedItem,
    relatedItems: FeedItem[] = [],
  ): Promise<void> {
    if (this.readingContainer) {
      this.readingContainer.empty();
    }
    this.currentItem = item;
    this.relatedItems = relatedItems;

    if (this.titleElement) {
      this.titleElement.setText(item.title);
    }

    // Update toggle button states
    this.updateToggleButtons();

    if (item.saved) {
      const fileExists = this.checkSavedFileExists(item);
      if (!fileExists) {
        item.saved = false;
        if (item.tags) {
          item.tags = item.tags.filter(
            (tag) => tag.name.toLowerCase() !== "saved",
          );
        }
        if (item.feedUrl) {
          const feed = this.settings.feeds.find((f) => f.url === item.feedUrl);
          if (feed) {
            const originalItem = feed.items.find((i) => i.guid === item.guid);
            if (originalItem) {
              originalItem.saved = false;
              if (originalItem.tags) {
                originalItem.tags = originalItem.tags.filter(
                  (tag) => tag.name.toLowerCase() !== "saved",
                );
              }
            }
          }
        }
      }
    }

    if (item.mediaType === "video" && !item.videoId && item.link) {
      const vid = MediaService.extractYouTubeVideoId(item.link);
      if (vid) item.videoId = vid;
    }

    if (item.mediaType === "video" && item.videoId) {
      await this.displayVideo(item);
    } else if (item.mediaType === "video" && item.videoUrl) {
      await this.displayVideoPodcast(item);
    } else if (
      item.mediaType === "podcast" &&
      (item.audioUrl || MediaService.extractPodcastAudio(item.description))
    ) {
      if (!item.audioUrl) {
        const aud = MediaService.extractPodcastAudio(item.description);
        if (aud) item.audioUrl = aud;
      }
      await this.displayPodcast(item);
    } else {
      const fetchedContent = this.shouldSkipFullArticleFetch(item.link)
        ? ""
        : await this.fetchFullArticleContent(item.link);
      const fullContent = this.hasMeaningfulArticleContent(fetchedContent)
        ? fetchedContent
        : item.content || item.description || "";
      this.currentFullContent = fullContent;
      await this.displayArticle(item, fullContent);
    }
  }

  private async displayVideo(item: FeedItem): Promise<void> {
    if (this.podcastPlayer) {
      this.podcastPlayer.destroy();
      this.podcastPlayer = null;
    }
    const container = this.readingContainer.createDiv({
      cls: "rss-reader-video-container enhanced",
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
      const errorContainer = container.createDiv({
        cls: "rss-reader-error",
        text: "Video id not found. Cannot play this video.",
      });
      if (item.link) {
        const watchLink = errorContainer.createEl("a", {
          cls: "rss-reader-error-link",
          text: "Watch on YouTube",
          href: item.link,
        });
        watchLink.target = "_blank";
        watchLink.rel = "noopener noreferrer";
      }
      await this.displayArticle(item);
    }
  }

  private async displayPodcast(item: FeedItem): Promise<void> {
    if (this.videoPlayer) {
      this.videoPlayer.destroy();
      this.videoPlayer = null;
    }
    if (this.podcastPlayer) {
      this.podcastPlayer.destroy();
      this.podcastPlayer = null;
    }

    const container = this.readingContainer.createDiv({
      cls: "rss-reader-podcast-container enhanced",
    });

    let fullFeedEpisodes: FeedItem[] | undefined = undefined;
    if (item.feedUrl) {
      const feed = this.settings.feeds.find((f) => f.url === item.feedUrl);
      if (feed) {
        fullFeedEpisodes = feed.items.filter((i) => i.mediaType === "podcast");
      }
    }

    const onEpisodeSelected = (selectedEpisode: FeedItem) => {
      this.currentItem = selectedEpisode;
      if (this.titleElement) {
        this.titleElement.setText(selectedEpisode.title);
      }
      this.updateToggleButtons();
      this.closeTagsDropdownPortal();
      void this.syncDashboardSelectionFromPlayer(selectedEpisode);
    };

    if (item.audioUrl) {
      this.podcastPlayer = new PodcastPlayer(
        container,
        this.app,
        this.settings.media.podcastTheme,
        undefined,
        onEpisodeSelected,
      );
      this.podcastPlayer.loadEpisode(item, fullFeedEpisodes);
    } else {
      const audioUrl = MediaService.extractPodcastAudio(item.description);
      if (audioUrl) {
        const podcastItem: FeedItem = {
          ...item,
          audioUrl: audioUrl,
        };
        this.podcastPlayer = new PodcastPlayer(
          container,
          this.app,
          this.settings.media.podcastTheme,
          undefined,
          onEpisodeSelected,
        );
        this.podcastPlayer.loadEpisode(podcastItem, fullFeedEpisodes);
      } else {
        container.createDiv({
          cls: "rss-reader-error",
          text: "Audio url not found. Cannot play this podcast.",
        });
        await this.displayArticle(item);
      }
    }
  }

  updatePodcastTheme(theme: string): void {
    if (this.podcastPlayer) {
      this.podcastPlayer.updateTheme(theme);
    }
  }

  private async syncDashboardSelectionFromPlayer(article: FeedItem): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(RSS_DASHBOARD_VIEW_TYPE);
    for (const leaf of leaves) {
      if (requireApiVersion("1.7.2")) {
        await leaf.loadIfDeferred();
      }
      const view = leaf.view as unknown as {
        setSelectedArticleFromExternal?: (next: FeedItem) => void;
      };
      if (typeof view.setSelectedArticleFromExternal === "function") {
        view.setSelectedArticleFromExternal(article);
      }
    }
  }

  private async displayArticle(
    item: FeedItem,
    fullContent?: string,
  ): Promise<void> {
    if (this.podcastPlayer) {
      this.podcastPlayer.destroy();
      this.podcastPlayer = null;
    }
    if (this.videoPlayer) {
      this.videoPlayer.destroy();
      this.videoPlayer = null;
    }

    const shouldUseWebViewer =
      Boolean(this.settings.useWebViewer) &&
      Boolean(this.webViewerIntegration) &&
      !this.shouldBypassWebViewerForFeedContent(item, fullContent);

    if (shouldUseWebViewer && this.webViewerIntegration) {
      try {
        const success = await this.webViewerIntegration.openInWebViewer(
          item.link,
          item.title,
        );
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

  private shouldBypassWebViewerForFeedContent(
    item: FeedItem,
    fullContent?: string,
  ): boolean {
    if (!item.link) {
      return false;
    }

    const feedHtml = (
      fullContent ||
      item.content ||
      item.description ||
      ""
    ).trim();
    if (!feedHtml) {
      return false;
    }

    try {
      const host = new URL(item.link).hostname.toLowerCase();
      return this.isFeedContentPreferredHost(host);
    } catch {
      return false;
    }
  }

  private shouldSkipFullArticleFetch(url: string): boolean {
    if (!url) {
      return false;
    }

    try {
      const host = new URL(url).hostname.toLowerCase();
      return this.isFeedContentPreferredHost(host);
    } catch {
      return false;
    }
  }

  private isFeedContentPreferredHost(host: string): boolean {
    return (
      host === "kite.kagi.com" ||
      host === "news.kagi.com" ||
      host === "aeon.co" ||
      host.endsWith(".aeon.co") ||
      host === "substack.com" ||
      host.endsWith(".substack.com")
    );
  }

  private renderArticle(item: FeedItem, fullContent?: string): void {
    const headerContainer = this.readingContainer.createDiv({
      cls: "rss-reader-article-header",
    });

    const articleTitleEl = headerContainer.createEl("h1", {
      cls: "rss-reader-item-title",
    });
    if (
      this.settings.highlights?.enabled &&
      this.settings.highlights.highlightInTitles
    ) {
      const highlightService = new HighlightService(this.settings.highlights);
      highlightService.setHighlightedText(articleTitleEl, item.title);
    } else {
      articleTitleEl.setText(item.title);
    }

    const metaContainer = headerContainer.createDiv({
      cls: "rss-reader-meta",
    });

    metaContainer.createDiv({
      cls: "rss-reader-feed-title",
      text: item.feedTitle,
    });

    metaContainer.createDiv({
      cls: "rss-reader-pub-date",
      text: new Date(item.pubDate).toLocaleString(),
    });

    if (item.tags && item.tags.length > 0) {
      const tagsContainer = headerContainer.createDiv({
        cls: "rss-reader-tags",
      });

      for (const tag of item.tags) {
        const tagElement = tagsContainer.createDiv({
          cls: "rss-reader-tag",
        });
        tagElement.textContent = tag.name;
        tagElement.style.setProperty("--tag-color", tag.color);
      }
    }

    const heroSlot = this.readingContainer.createDiv({
      cls: "rss-reader-hero-slot",
    });

    const descriptionHtml = (item.description || "").trim();
    const mainHtml = (fullContent || item.content || "").trim();
    const fallbackHeroUrl =
      (item.coverImage || "").trim() ||
      (item.image || "").trim() ||
      (item.itunes?.image?.href || "").trim() ||
      undefined;

    if (descriptionHtml) {
      const descriptionCallout = this.readingContainer.createEl("details", {
        cls: "rss-reader-description-callout",
      });
      descriptionCallout.open = true;
      descriptionCallout.createEl("summary", { text: "Feed description" });
      const descriptionBody = descriptionCallout.createDiv({
        cls: "rss-reader-description rss-reader-description-body",
      });
      this.populateArticleHtml(
        descriptionBody,
        descriptionHtml,
        item.link,
        fallbackHeroUrl,
        item.title,
        heroSlot,
      );
    }

    const hasDistinctMainContent =
      mainHtml &&
      (!descriptionHtml || !this.isEquivalentHtml(mainHtml, descriptionHtml));

    if (hasDistinctMainContent || !descriptionHtml) {
      const contentContainer = this.readingContainer.createDiv({
        cls: "rss-reader-article-content",
      });
      const htmlToRender = hasDistinctMainContent
        ? mainHtml
        : descriptionHtml || mainHtml;
      this.populateArticleHtml(
        contentContainer,
        htmlToRender,
        item.link,
        fallbackHeroUrl,
        item.title,
        heroSlot,
      );
    }
  }

  private populateArticleHtml(
    container: HTMLElement,
    rawHtml: string,
    baseUrl: string,
    fallbackHeroUrl?: string,
    title?: string,
    heroSlot?: HTMLElement,
  ): void {
    if (!rawHtml) return;

    let html = rawHtml;
    // Basic sanitization/cleanup if needed (the app seems to trust feed HTML)
    
    // Resolve relative URLs
    if (baseUrl) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const base = new URL(baseUrl);

        doc.querySelectorAll('a').forEach(el => {
          const href = el.getAttribute('href');
          if (href) {
            try { el.href = new URL(href, base).toString(); } catch { /* ignore */ }
          }
        });

        doc.querySelectorAll('img').forEach(el => {
          const src = el.getAttribute('src');
          if (src) {
            try { el.src = new URL(src, base).toString(); } catch { /* ignore */ }
          }
        });

        html = doc.body.innerHTML;
      } catch {
        console.error("Failed to resolve relative URLs");
      }
    }

    // Attempt to extract and place hero image
    if (heroSlot && heroSlot.childElementCount === 0) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html; // eslint-disable-line @microsoft/sdl/no-inner-html
      const firstImg = tempDiv.querySelector('img');
      
      let heroUrl = fallbackHeroUrl;
      if (firstImg && firstImg.src) {
        // If the first image looks like a hero image (e.g. large)
        // For now just take the first meaningful image or fallback
        heroUrl = firstImg.src;
        // Optional: remove it from the body to avoid duplication
        // firstImg.remove();
        // html = tempDiv.innerHTML;
      }

      if (heroUrl) {
        heroSlot.createEl("img", {
          cls: "rss-reader-fallback-hero",
          attr: { src: heroUrl, alt: title || "Hero image" }
        });
      }
    }

    if (
      this.settings.highlights?.enabled &&
      this.settings.highlights.highlightInContent
    ) {
      const highlightService = new HighlightService(this.settings.highlights);
      highlightService.highlightElement(container);
    } else {
      container.innerHTML = html; // eslint-disable-line @microsoft/sdl/no-inner-html
    }

    // Add classes to images for styling
    container.querySelectorAll('img').forEach(img => {
      img.addClass('rss-reader-responsive-img');
    });
  }

  private isEquivalentHtml(html1: string, html2: string): boolean {
    const clean = (h: string) => h.replace(/\s+/g, ' ').toLowerCase().trim();
    return clean(html1) === clean(html2);
  }

  private hasMeaningfulArticleContent(html: string | null): boolean {
    if (!html) return false;
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent || "";
    return text.trim().length > 200;
  }

  private async fetchFullArticleContent(url: string): Promise<string> {
    try {
      const html = await robustFetch(url);
      if (!html) return "";
      
      const doc = new DOMParser().parseFromString(html, 'text/html');
      ensureUtf8Meta(html);
      
      const reader = new Readability(doc);
      const article = reader.parse();
      
      return article?.content || "";
    } catch (e) {
      console.error("Failed to fetch full article", e);
      return "";
    }
  }

  private toggleReadStatus(): void {
    if (!this.currentItem) return;
    const nextRead = !this.currentItem.read;
    this.onArticleUpdate(this.currentItem, { read: nextRead });
    this.updateToggleButtons();
  }

  private toggleStarStatus(): void {
    if (!this.currentItem) return;
    const nextStarred = !this.currentItem.starred;
    this.onArticleUpdate(this.currentItem, { starred: nextStarred });
    this.updateToggleButtons();
  }

  private updateSavedLabel(saved: boolean): void {
    if (!this.currentItem) return;
    this.onArticleUpdate(this.currentItem, { saved });
  }

  private showTagsDropdown(evt: MouseEvent, item: FeedItem): void {
    const menu = new Menu();
    
    const availableTags = this.settings.availableTags || [];
    const itemTags = item.tags || [];

    availableTags.forEach(tag => {
      const isSelected = itemTags.some(t => t.name === tag.name);
      menu.addItem((menuItem: MenuItem) => {
        menuItem
          .setTitle(tag.name)
          .setIcon(isSelected ? "check" : "tag")
          .onClick(() => {
            this.toggleTag(item, tag, !isSelected);
          });
      });
    });

    menu.addSeparator();
    menu.addItem((menuItem: MenuItem) => {
      menuItem
        .setTitle("Manage tags...")
        .setIcon("settings")
        .onClick(() => {
          // Open settings to the Tags tab
          const extendedApp = this.app as ExtendedApp;
          const plugin = extendedApp.plugins.getPlugin("obsidian-rss-dashboard");
          if (plugin && typeof plugin.openTagsSettings === "function") {
            plugin.openTagsSettings();
          } else {
            // Fallback for older versions or if method is missing
            extendedApp.setting?.open();
            extendedApp.setting?.openTabById("obsidian-rss-dashboard");
          }
        });
    });

    menu.showAtMouseEvent(evt);
  }

  private closeTagsDropdownPortal(): void {
    // This seems to be for a custom dropdown UI that might be partially implemented or legacy
    if (this.tagsDropdownPortal) {
      this.tagsDropdownPortal.remove();
      this.tagsDropdownPortal = null;
    }
  }

  private resolveReaderFontFamily(
    fontFamily: ReaderFormatSettings["fontFamily"],
  ): string {
    switch (fontFamily) {
      case "serif":
        return 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
      case "sans":
        return 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      case "mono":
        return 'var(--font-monospace), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
      case "default":
      default:
        return "inherit";
    }
  }

  private getReaderFormat(): ReaderFormatSettings {
    if (!this.settings.readerFormat) {
      this.settings.readerFormat = { ...DEFAULT_SETTINGS.readerFormat };
      return this.settings.readerFormat;
    }

    const format = this.settings.readerFormat as Partial<ReaderFormatSettings> & { wordsPerLine?: number };
    const defaults = DEFAULT_SETTINGS.readerFormat;

    // Migrate wordsPerLine to paragraphWidth if it exists
    if (format.paragraphWidth === undefined) {
      if (format.wordsPerLine !== undefined) {
        format.paragraphWidth = format.wordsPerLine > 0 ? 75 : 100;
        delete format.wordsPerLine;
      } else {
        format.paragraphWidth = defaults.paragraphWidth;
      }
    }

    if (format.textAlign === undefined) format.textAlign = defaults.textAlign;
    if (format.fontScalePct === undefined)
      format.fontScalePct = defaults.fontScalePct;
    if (format.lineHeightPct === undefined)
      format.lineHeightPct = defaults.lineHeightPct;
    if (format.fontFamily === undefined)
      format.fontFamily = defaults.fontFamily;
    if (format.paragraphSpacing === undefined) {
      format.paragraphSpacing = defaults.paragraphSpacing;
    }

    return format as ReaderFormatSettings;
  }

  private applyReaderFormat(): void {
    const format = this.getReaderFormat();
    const paragraphWidth = format.paragraphWidth || 100;
    
    let maxWidth = "none";
    if (paragraphWidth === 100) {
      maxWidth = "calc(100% - 4px)";
    } else {
      maxWidth = `${paragraphWidth}%`;
    }

    setCssProps(this.contentEl, {
      "--rss-reader-font-scale": String(format.fontScalePct / 100),
      "--rss-reader-line-height": String(format.lineHeightPct / 100),
      "--rss-reader-max-width": maxWidth,
      "--rss-reader-font-family": this.resolveReaderFontFamily(
        format.fontFamily,
      ),
    });

    this.contentEl.dataset.rssReaderAlign = format.textAlign;
    this.contentEl.dataset.rssReaderFont = format.fontFamily;
    this.contentEl.dataset.rssReaderParagraph = format.paragraphSpacing;
  }

  private toggleReaderFormatDropdown(event: MouseEvent): void {
    event.stopPropagation();
    const anchor = event.currentTarget;
    if (!(anchor instanceof HTMLElement)) {
      return;
    }

    if (this.readerFormatPortal) {
      this.closeReaderFormatPortal(true);
      return;
    }

    this.createReaderFormatDropdownPortal(anchor);
  }

  private createReaderFormatDropdownPortal(anchor: HTMLElement): void {
    this.closeReaderFormatPortal(false);

    const format = this.getReaderFormat();
    const targetDocument = anchor.ownerDocument;
    const targetBody = targetDocument.body;
    const targetWindow = targetDocument.defaultView || window;
    const isMobile = targetWindow.matchMedia("(max-width: 768px)").matches;

    if (isMobile) {
      this.readerFormatBackdrop = targetBody.createDiv({
        cls: "rss-reader-format-sheet-backdrop",
      });
    }

    const portalDropdown = targetBody.createDiv({
      cls: "rss-dashboard-tags-dropdown-content-portal rss-reader-format-dropdown-portal",
    });

    if (isMobile) {
      portalDropdown.addClass("rss-reader-format-mobile-sheet");
    }

    const controlsContainer = portalDropdown.createDiv({
      cls: "rss-reader-format-controls",
    });

    new Setting(controlsContainer).setName("Reader settings").setHeading();

    let alignDropdown: { setValue: (value: string) => void } | null = null;
    new Setting(controlsContainer)
      .setName("Alignment")
      .addDropdown((dropdown) => {
        alignDropdown = dropdown;
        dropdown
          .addOption("justify", "Justify")
          .addOption("left", "Left")
          .setValue(format.textAlign)
          .onChange((value) => {
            format.textAlign = value as ReaderFormatSettings["textAlign"];
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          });
      });

    new Setting(controlsContainer)
      .setName("Paragraph width")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("100", "100%")
          .addOption("75", "75%")
          .addOption("50", "50%")
          .addOption("25", "25%")
          .setValue(String(format.paragraphWidth))
          .onChange((value) => {
            format.paragraphWidth = parseInt(value);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          });
      });

    let fontSizeDropdown: { setValue: (value: string) => void } | null = null;
    new Setting(controlsContainer)
      .setName("Font size")
      .addDropdown((dropdown) => {
        fontSizeDropdown = dropdown;
        dropdown
          .addOption("80", "80%")
          .addOption("90", "90%")
          .addOption("100", "100%")
          .addOption("110", "110%")
          .addOption("120", "120%")
          .addOption("130", "130%")
          .addOption("150", "150%")
          .addOption("175", "175%")
          .addOption("200", "200%")
          .setValue(String(format.fontScalePct))
          .onChange((value) => {
            format.fontScalePct = parseInt(value);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          });
      });

    let lineHeightDropdown: { setValue: (value: string) => void } | null = null;
    new Setting(controlsContainer)
      .setName("Line height")
      .addDropdown((dropdown) => {
        lineHeightDropdown = dropdown;
        dropdown
          .addOption("100", "100%")
          .addOption("110", "110%")
          .addOption("120", "120%")
          .addOption("130", "130%")
          .addOption("140", "140%")
          .addOption("150", "150%")
          .addOption("160", "160%")
          .addOption("180", "180%")
          .addOption("200", "200%")
          .setValue(String(format.lineHeightPct))
          .onChange((value) => {
            format.lineHeightPct = parseInt(value);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          });
      });

    let fontDropdown: { setValue: (value: string) => void } | null = null;
    new Setting(controlsContainer).setName("Font").addDropdown((dropdown) => {
      fontDropdown = dropdown;
      dropdown
        .addOption("default", "Theme default")
        .addOption("serif", "Serif")
        .addOption("sans", "Sans")
        .addOption("mono", "Mono")
        .setValue(format.fontFamily)
        .onChange((value) => {
          format.fontFamily = value as ReaderFormatSettings["fontFamily"];
          this.applyReaderFormat();
          this.scheduleReaderFormatSave();
        });
    });

    let paragraphDropdown: { setValue: (value: string) => void } | null = null;
    new Setting(controlsContainer)
      .setName("Paragraph spacing")
      .addDropdown((dropdown) => {
        paragraphDropdown = dropdown;
        dropdown
          .addOption("default", "Theme default")
          .addOption("tight", "Tight")
          .addOption("normal", "Normal")
          .addOption("loose", "Loose")
          .setValue(format.paragraphSpacing)
          .onChange((value) => {
            format.paragraphSpacing =
              value as ReaderFormatSettings["paragraphSpacing"];
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          });
      });

    new Setting(controlsContainer).addButton((btn) => {
      btn.setButtonText("Reset").onClick((evt: MouseEvent) => {
        Object.assign(format, DEFAULT_SETTINGS.readerFormat);

        alignDropdown?.setValue(format.textAlign);
        // Paragraph width dropdown reset if we kept its reference, but here we'll just re-render or hope it updates
        fontSizeDropdown?.setValue(String(format.fontScalePct));
        lineHeightDropdown?.setValue(String(format.lineHeightPct));
        fontDropdown?.setValue(format.fontFamily);
        paragraphDropdown?.setValue(format.paragraphSpacing);

        this.applyReaderFormat();
        this.scheduleReaderFormatSave();
        this.closeReaderFormatPortal(true);
        this.toggleReaderFormatDropdown(evt); // Re-open to refresh
      });
    });

    if (isMobile) {
      new Setting(controlsContainer).addButton((btn) => {
        btn.setButtonText("Done");
        // Prefer Obsidian CTA styling; fall back to class if older API.
        const maybeCta = btn as unknown as { setCta?: () => void };
        maybeCta.setCta?.();
        btn.buttonEl.addClass("mod-cta");
        btn.buttonEl.addClass("rss-reader-format-done-cta");
        btn.onClick((e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.closeReaderFormatPortal(true);
        });
      });
    }

    this.readerFormatPortal = portalDropdown;
    this.readerFormatDocument = targetDocument;

    if (isMobile) {
      const syncMobileViewportHeight = () => {
        const vvp = targetWindow.visualViewport;
        const viewportHeight = vvp?.height ?? targetWindow.innerHeight;
        const computed = targetWindow.getComputedStyle(portalDropdown);
        const bottomOffset = Number.parseFloat(computed.bottom || "0") || 0;
        const maxHeight = Math.min(
          Math.floor(viewportHeight * 0.8),
          Math.max(220, Math.floor(viewportHeight - bottomOffset - 8))
        );
        portalDropdown.style.setProperty(
          "max-height",
          `${maxHeight}px`,
          "important",
        );
      };
      syncMobileViewportHeight();

      const visualViewport = targetWindow.visualViewport;
      if (visualViewport) {
        visualViewport.addEventListener("resize", syncMobileViewportHeight);
        visualViewport.addEventListener("scroll", syncMobileViewportHeight);
        this.readerFormatViewportCleanup = () => {
          visualViewport.removeEventListener(
            "resize",
            syncMobileViewportHeight,
          );
          visualViewport.removeEventListener(
            "scroll",
            syncMobileViewportHeight,
          );
        };
      } else {
        targetWindow.addEventListener("resize", syncMobileViewportHeight);
        this.readerFormatViewportCleanup = () => {
          targetWindow.removeEventListener("resize", syncMobileViewportHeight);
        };
      }

      this.readerFormatBackdrop?.addEventListener("click", () => {
        this.closeReaderFormatPortal(true);
      });

      return;
    }

    const rect = anchor.getBoundingClientRect();
    const dropdownRect = portalDropdown.getBoundingClientRect();
    const appContainer =
      this.contentEl.closest(".workspace-leaf-content") || targetBody;
    const appContainerRect = appContainer.getBoundingClientRect();

    let left = rect.right;
    let top = rect.top;

    if (left + dropdownRect.width > appContainerRect.right) {
      left = rect.left - dropdownRect.width;
    }

    if (left < appContainerRect.left) {
      left = appContainerRect.left;
    }

    if (top + dropdownRect.height > targetWindow.innerHeight) {
      top = targetWindow.innerHeight - dropdownRect.height - 5;
    }

    portalDropdown.style.left = `${left}px`;
    portalDropdown.style.top = `${top}px`;

    targetWindow.setTimeout(() => {
      const outsideHandler = (ev: MouseEvent) => {
        if (
          this.readerFormatPortal &&
          !this.readerFormatPortal.contains(ev.target as Node) &&
          !anchor.contains(ev.target as Node)
        ) {
          this.closeReaderFormatPortal(true);
        }
      };
      this.readerFormatOutsideHandler = outsideHandler;
      targetDocument.addEventListener("mousedown", outsideHandler);
    }, 0);
  }

  private closeReaderFormatPortal(flushSave: boolean): void {
    if (this.readerFormatBackdrop) {
      this.readerFormatBackdrop.remove();
      this.readerFormatBackdrop = null;
    }

    if (this.readerFormatPortal) {
      this.readerFormatPortal.remove();
      this.readerFormatPortal = null;
    }

    if (this.readerFormatOutsideHandler && this.readerFormatDocument) {
      this.readerFormatDocument.removeEventListener(
        "mousedown",
        this.readerFormatOutsideHandler,
      );
    }

    if (this.readerFormatViewportCleanup) {
      this.readerFormatViewportCleanup();
      this.readerFormatViewportCleanup = null;
    }

    this.readerFormatOutsideHandler = null;
    this.readerFormatDocument = null;

    if (flushSave) {
      void this.flushReaderFormatSave();
    }
  }

  private scheduleReaderFormatSave(): void {
    if (this.readerFormatSaveTimeout !== null) {
      window.clearTimeout(this.readerFormatSaveTimeout);
    }

    this.readerFormatSaveTimeout = window.setTimeout(() => {
      void this.flushReaderFormatSave();
    }, 300);
  }

  private getRssDashboardPluginForSettingsSave(): {
    saveSettings: () => Promise<void>;
  } | null {
    try {
      const appWithPlugins = this.app as unknown as {
        plugins?: {
          getPlugin?: (id: string) => unknown;
          plugins?: Record<string, unknown>;
        };
      };

      const plugins = appWithPlugins.plugins;
      if (!plugins) {
        return null;
      }

      const pluginByGetter =
        typeof plugins.getPlugin === "function"
          ? plugins.getPlugin("rss-dashboard")
          : null;
      const pluginByRegistry = plugins.plugins?.["rss-dashboard"];

      const plugin = (pluginByGetter || pluginByRegistry) as
        | { saveSettings?: unknown }
        | undefined;
      if (plugin && typeof plugin.saveSettings === "function") {
        return plugin as { saveSettings: () => Promise<void> };
      }
    } catch {
      return null;
    }

    return null;
  }

  private async flushReaderFormatSave(): Promise<void> {
    if (this.readerFormatSaveTimeout !== null) {
      window.clearTimeout(this.readerFormatSaveTimeout);
      this.readerFormatSaveTimeout = null;
    }

    const plugin = this.getRssDashboardPluginForSettingsSave();
    if (!plugin) {
      return;
    }

    try {
      await plugin.saveSettings();
    } catch {
      // Ignore save errors; formatting still applies for this session.
    }
  }

  private toggleTag(item: FeedItem, tag: Tag, add: boolean): void {
    if (!item.tags) {
      item.tags = [];
    }

    if (add) {
      if (!item.tags.some((t) => t.name === tag.name)) {
        item.tags.push({ ...tag });
      }
    } else {
      item.tags = item.tags.filter((t) => t.name !== tag.name);
    }

    // Notify parent to persist the change
    this.onArticleUpdate(item, { tags: [...item.tags] }, false);

    if (
      this.podcastPlayer &&
      this.currentItem?.guid === item.guid &&
      this.currentItem.mediaType === "podcast"
    ) {
      this.podcastPlayer.refreshTags();
      this.podcastPlayer.refreshPlaylistTags(item.guid);
    }
  }

  private updateToggleButtons(): void {
    if (!this.currentItem) return;

    // Update read toggle
    if (this.readToggleButton) {
      setIcon(
        this.readToggleButton,
        this.currentItem.read ? "check-circle" : "circle",
      );
      this.readToggleButton.classList.toggle("read", this.currentItem.read);
      this.readToggleButton.classList.toggle("unread", !this.currentItem.read);
      this.readToggleButton.setAttr(
        "title",
        this.currentItem.read ? "Mark as unread" : "Mark as read",
      );
    }

    // Update star toggle
    if (this.starToggleButton) {
      setIcon(
        this.starToggleButton,
        this.currentItem.starred ? "star" : "star-off",
      );
      this.starToggleButton.classList.toggle(
        "starred",
        this.currentItem.starred,
      );
      this.starToggleButton.classList.toggle(
        "unstarred",
        !this.currentItem.starred,
      );
      this.starToggleButton.setAttr(
        "title",
        this.currentItem.starred ? "Remove from starred" : "Add to starred",
      );
    }
  }

  private resetTitle(): void {
    if (this.titleElement) {
      this.titleElement.setText("RSS reader");
    }
  }

  private checkSavedFileExists(item: FeedItem): boolean {
    try {
      const folder =
        this.settings.articleSaving.defaultFolder || "RSS articles";
      const filename = this.sanitizeFilename(item.title);
      const filePath = folder ? `${folder}/${filename}.md` : `${filename}.md`;

      return this.app.vault.getAbstractFileByPath(filePath) !== null;
    } catch {
      return false;
    }
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[/\\:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
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
      cls: "rss-reader-video-podcast-container enhanced",
    });

    if (item.videoUrl) {
      const video = container.createEl("video", {
        cls: "rss-reader-video",
        attr: {
          controls: "true",
          ...(item.coverImage ? { poster: item.coverImage } : {}),
        },
      });
      video.createEl("source", {
        attr: {
          src: item.videoUrl,
          type: "video/mp4",
        },
      });
      video.appendText("Your browser does not support the video tag.");
    } else {
      container.createDiv({
        cls: "rss-reader-error",
        text: "Video url not found. Cannot play this video podcast.",
      });
      await this.displayArticle(item);
      return;
    }

    const infoSection = container.createDiv({ cls: "rss-video-info" });
    const titleSetting = new Setting(infoSection)
      .setName(item.title)
      .setHeading();
    titleSetting.settingEl.addClass("rss-video-title");
    const metaRow = infoSection.createDiv({ cls: "rss-video-meta-row" });
    metaRow.createDiv({ text: item.feedTitle, cls: "rss-video-channel" });
    metaRow.createDiv({
      text: new Date(item.pubDate).toLocaleDateString(),
      cls: "rss-video-date",
    });

    const relatedContainer = container.createDiv({
      cls: "rss-video-related",
    });
    relatedContainer.createEl("h4", { text: "From the same channel" });

    const relatedVideos = (
      this.settings.feeds.find((f) => f.url === item.feedUrl)?.items || []
    )
      .filter((i) => i.mediaType === "video" && i.guid !== item.guid)
      .slice(0, 6);

    if (relatedVideos.length > 0) {
      const relatedList = relatedContainer.createDiv({
        cls: "rss-video-related-list rss-video-related-grid",
      });
      relatedVideos.forEach((video) => {
        const videoItem = relatedList.createDiv({
          cls: "rss-video-related-item rss-video-related-card",
        });
        if (video.coverImage) {
          const thumbnail = videoItem.createDiv({
            cls: "rss-video-related-thumbnail",
          });
          thumbnail.createEl("img", {
            attr: {
              src: video.coverImage,
              alt: video.title,
            },
          });
        }
        const videoInfo = videoItem.createDiv({
          cls: "rss-video-related-info",
        });
        videoInfo.createDiv({
          cls: "rss-video-related-title",
          text: video.title,
        });
        videoInfo.createDiv({
          cls: "rss-video-related-date",
          text: new Date(video.pubDate).toLocaleDateString(),
        });
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
