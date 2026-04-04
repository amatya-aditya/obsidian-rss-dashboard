import {
  ItemView,
  WorkspaceLeaf,
  Menu,
  MenuItem,
  App,
  Setting,
  requireApiVersion,
  TFile,
  Notice,
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
import { setCssProps } from "../utils/platform-utils";
import { fetchWithProxyFallback } from "../utils/fetch-helpers";
import TurndownService from "turndown";
import { WebViewerIntegration } from "../services/web-viewer-integration";
import { MediaService } from "../services/media-service";
import { createTagsDropdownPortal } from "../utils/tags-dropdown-portal";
import { resolveItemExternalUrl } from "../utils/item-url-utils";
import { resolvePodcastOpenDestinations } from "../utils/podcast-open-destinations";
import { resolveApplePodcastsShowUrl } from "../services/apple-podcasts-service";
import { createReaderFormatPortal } from "../utils/reader-format-portal";
import { PodcastPlayer } from "./podcast-player";
import { VideoPlayer } from "./video-player";
import { RSS_DASHBOARD_VIEW_TYPE } from "./dashboard-view";
import { VaultFolderSuggest } from "../components/folder-suggest";

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
  private currentDisplayTitle?: string;
  private currentReaderTitle?: string;
  private currentContentIsFullArticle = false;
  private turndownService = new TurndownService();
  private readToggleButton: HTMLElement | null = null;
  private starToggleButton: HTMLElement | null = null;
  private saveButton: HTMLElement | null = null;
  private returnLeaf: WorkspaceLeaf | null = null;
  private tagsDropdownCleanup: (() => void) | null = null;

  private readerFormatPortal: { close: (flushSave: boolean) => void } | null =
    null;
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

    this.closeTagsDropdown();
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
    return this.currentItem
      ? this.currentReaderTitle ||
          this.currentDisplayTitle ||
          this.currentItem.title
      : "RSS reader";
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

  private getEffectiveReaderTitle(): string {
    if (!this.currentItem) {
      return "RSS reader";
    }

    return (
      this.currentReaderTitle ||
      this.currentDisplayTitle ||
      this.currentItem.title
    );
  }

  private syncReaderTitle(): void {
    if (this.titleElement) {
      this.titleElement.setText(this.getEffectiveReaderTitle());
    }

    (
      this.leaf as WorkspaceLeaf & {
        updateHeader?: () => void;
      }
    ).updateHeader?.();
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
    this.saveButton = actions.createDiv({
      cls: "rss-reader-action-button",
      attr: { title: "Save article" },
    });

    setIcon(this.saveButton, "save");
    this.saveButton.addEventListener("click", (e) => {
      if (this.currentItem && this.currentItem.saved) {
        const file = this.app.vault.getAbstractFileByPath(
          this.currentItem.savedFilePath || "",
        );
        if (file instanceof TFile) {
          void this.leaf.openFile(file);
          return;
        }
      }
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

    // Tags button (same portal menu as dashboard cards)
    const tagsDropdown = actions.createDiv({
      cls: "rss-dashboard-tags-dropdown",
    });
    const tagsButton = tagsDropdown.createDiv({
      cls: "rss-dashboard-tags-toggle clickable-icon",
      attr: {
        title: "Manage tags",
        role: "button",
        tabindex: "0",
        "aria-label": "Manage tags",
      },
    });
    setIcon(tagsButton, "tag");
    const toggleTagsMenu = (e: Event) => {
      e.stopPropagation();
      if (!this.currentItem) {
        return;
      }
      this.toggleTagsDropdown(tagsButton);
    };
    tagsButton.addEventListener("click", toggleTagsMenu);
    tagsButton.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleTagsMenu(e);
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
	    setIcon(browserButton, "external-link");
	    browserButton.addEventListener("click", (e) => {
	      const item = this.currentItem;
	      if (!item) return;

	      if (item.mediaType === "podcast") {
	        const feedMatch =
	          this.settings.feeds.find((f) => f.url === item.feedUrl) || null;
	        const feed = feedMatch || { url: item.feedUrl, siteUrl: undefined };
	        const destinations = resolvePodcastOpenDestinations(item, feed, {
	          includeApplePodcasts: Boolean(
	            this.settings.media.enableApplePodcastsOpen,
	          ),
	        });

	        if (destinations.length === 0) {
	          new Notice("No link available for this podcast.");
	          return;
	        }

	        const menu = new Menu();
		        for (const destination of destinations) {
		          menu.addItem((menuItem: MenuItem) => {
		            menuItem.setTitle(destination.title);
		            menuItem.setIcon("external-link");

		            if (destination.url) {
		              const dom = (menuItem as unknown as { dom?: HTMLElement }).dom;
		              dom?.setAttribute("title", destination.url);
		            }

		            if (destination.id === "apple_podcasts") {
		              menuItem.onClick(() => {
		                void (async () => {
	                  if (!feedMatch?.url || !feedMatch.title) {
	                    new Notice(
	                      "Could not find this show in apple podcasts.",
	                    );
	                    return;
	                  }
	                  const appleUrl = await resolveApplePodcastsShowUrl(
	                    feedMatch.url,
	                    feedMatch.title,
	                  );
	                  if (!appleUrl) {
	                    new Notice(
	                      "Could not find this show in apple podcasts.",
	                    );
	                    return;
	                  }
	                  window.open(appleUrl, "_blank");
	                })();
	              });
	              return;
	            }

	            const url = destination.url;
	            if (url) {
	              menuItem.onClick(() => window.open(url, "_blank"));
	            } else {
	              menuItem.setDisabled(true);
	            }
	          });
	        }

	        menu.showAtMouseEvent(e as MouseEvent);
	        return;
	      }

	      const url = resolveItemExternalUrl(item);
	      if (!url) return;
	      window.open(url, "_blank");
	    });

    this.readingContainer = this.contentEl.createDiv({
      cls: "rss-reader-content",
    });

    this.applyReaderFormat();
    return Promise.resolve();
  }

  async onClose(): Promise<void> {
    this.closeTagsDropdown();

    if (this.readerFormatPortal) {
      this.readerFormatPortal.close(true);
      this.readerFormatPortal = null;
    }

    if (this.readerFormatSaveTimeout !== null) {
      window.clearTimeout(this.readerFormatSaveTimeout);
      this.readerFormatSaveTimeout = null;
    }

    if (this.podcastPlayer) {
      this.podcastPlayer.destroy();
      this.podcastPlayer = null;
    }

    if (this.videoPlayer) {
      this.videoPlayer.destroy();
      this.videoPlayer = null;
    }

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
    const displayTitle = this.currentDisplayTitle;

    menu.addItem((menuItem: MenuItem) => {
      menuItem
        .setTitle("Save with default settings")
        .setIcon("save")
        .onClick(async () => {
          const htmlToSave =
            this.currentFullContent && this.currentContentIsFullArticle
              ? this.stripNavigationChromeFromHtml(
                  this.stripTopHeadlineFromHtml(this.currentFullContent),
                )
              : this.currentFullContent || item.description || "";
          const markdownContent = this.turndownService.turndown(htmlToSave);
          const saveItem = displayTitle ? { ...item, title: displayTitle } : item;
          const customTemplate = this.getCustomTemplateForArticle(item);
          const file = await this.articleSaver.saveArticle(
            saveItem,
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
    const displayTitle = this.currentDisplayTitle;
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

    const folderInputContainer = modalContent.createDiv({
      cls: "rss-dashboard-folder-input-container",
    });

    const folderInput = folderInputContainer.createEl("input", {
      attr: {
        type: "text",
        placeholder: "Enter folder path",
        value: this.settings.articleSaving.defaultFolder || "",
      },
    });

    const clearIcon = folderInputContainer.createDiv({
      cls: "clickable-icon rss-dashboard-clear-icon",
      attr: {
        "aria-label": "Clear input",
        role: "button",
        tabindex: "0",
      },
    });
    setIcon(clearIcon, "x");
    const clearAction = () => {
      folderInput.value = "";
      folderInput.focus();
    };
    clearIcon.addEventListener("click", clearAction);
    clearIcon.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        clearAction();
      }
    });

    new VaultFolderSuggest(this.app, folderInput);

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

        const htmlToSave =
          this.currentFullContent && this.currentContentIsFullArticle
            ? this.stripNavigationChromeFromHtml(
                this.stripTopHeadlineFromHtml(this.currentFullContent),
              )
            : this.currentFullContent || item.description || "";
        const markdownContent = this.turndownService.turndown(htmlToSave);
        const saveItem = displayTitle ? { ...item, title: displayTitle } : item;
        const file = await this.articleSaver.saveArticle(
          saveItem,
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
    modalContent.appendChild(folderInputContainer);
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
    this.closeTagsDropdown();
    if (this.readingContainer) {
      this.readingContainer.empty();
    }
    this.currentItem = item;
    this.relatedItems = relatedItems;
    this.currentDisplayTitle = undefined;
    this.currentReaderTitle = this.isTweetLikeItem(item)
      ? this.formatNitterReaderTitle(item)
      : undefined;
    this.currentContentIsFullArticle = false;
    this.syncReaderTitle();

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
      const fetchedContent = this.shouldSkipFullArticleFetch(item)
        ? ""
        : await this.fetchFullArticleContent(item.link);
      const hasFullArticleContent =
        this.hasMeaningfulArticleContent(fetchedContent);
      const displayTitle = hasFullArticleContent
        ? this.extractDisplayTitleFromHtml(fetchedContent)
        : null;
      const fullContent = hasFullArticleContent
        ? fetchedContent
        : item.content || item.description || "";
      this.currentFullContent = fullContent;
      this.currentDisplayTitle = displayTitle || undefined;
      this.currentContentIsFullArticle = hasFullArticleContent;
      this.syncReaderTitle();
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
      this.currentDisplayTitle = undefined;
      this.currentReaderTitle = this.isTweetLikeItem(selectedEpisode)
        ? this.formatNitterReaderTitle(selectedEpisode)
        : undefined;
      this.syncReaderTitle();
      this.updateToggleButtons();
      this.closeTagsDropdown();
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

  private async syncDashboardSelectionFromPlayer(
    article: FeedItem,
  ): Promise<void> {
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
          this.currentDisplayTitle || item.title,
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

    if (this.isTweetLikeItem(item)) {
      return true;
    }

    try {
      const host = new URL(item.link).hostname.toLowerCase();
      return this.isFeedContentPreferredHost(host);
    } catch {
      return false;
    }
  }

  private shouldSkipFullArticleFetch(item: FeedItem): boolean {
    if (this.isTweetLikeItem(item)) {
      return true;
    }

    if (!item.link) {
      return false;
    }

    try {
      const host = new URL(item.link).hostname.toLowerCase();
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
      host.endsWith(".substack.com") ||
      this.isNitterHost(host)
    );
  }

  private renderArticle(item: FeedItem, fullContent?: string): void {
    const headerContainer = this.readingContainer.createDiv({
      cls: "rss-reader-article-header",
    });

    const isNitter = this.isTweetLikeItem(item);
    const displayTitle =
      this.currentReaderTitle || this.currentDisplayTitle || item.title;
    const articleTitleEl = headerContainer.createEl("h1", {
      cls: "rss-reader-item-title",
    });
    if (
      this.settings.highlights?.enabled &&
      this.settings.highlights.highlightInTitles
    ) {
      const highlightService = new HighlightService(this.settings.highlights);
      highlightService.setHighlightedText(articleTitleEl, displayTitle);
    } else {
      articleTitleEl.setText(displayTitle);
    }

    if (!isNitter) {
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
    }

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
    let fallbackHeroUrl =
      (item.coverImage || "").trim() ||
      (item.image || "").trim() ||
      (item.itunes?.image?.href || "").trim() ||
      undefined;

    // Avoid using the feed icon (logo) as the article hero image.
    if (fallbackHeroUrl && item.feedUrl) {
      const feedIconUrl =
        this.settings.feeds.find((f) => f.url === item.feedUrl)?.iconUrl || "";
      const normalize = (u: string) => u.trim().replace(/\/$/, "");
      if (feedIconUrl && normalize(fallbackHeroUrl) === normalize(feedIconUrl)) {
        fallbackHeroUrl = undefined;
      }
    }

    const hasDistinctMainContent =
      mainHtml !== "" &&
      (!descriptionHtml || !this.isEquivalentHtml(mainHtml, descriptionHtml));

    if (!isNitter && descriptionHtml && hasDistinctMainContent) {
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
        displayTitle,
        heroSlot,
        false,
        false,
      );
    }

    const contentToRender = isNitter
      ? this.pickBestNitterTweetHtml(item, fullContent)
      : hasDistinctMainContent
        ? mainHtml
        : mainHtml || descriptionHtml;

    if (contentToRender) {
      const contentContainer = this.readingContainer.createDiv({
        cls: "rss-reader-article-content",
      });
      const shouldStripHeadline =
        this.currentContentIsFullArticle && contentToRender === mainHtml;
      this.populateArticleHtml(
        contentContainer,
        contentToRender,
        item.link,
        fallbackHeroUrl,
        displayTitle,
        heroSlot,
        shouldStripHeadline,
        isNitter,
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
    stripTopHeadline = false,
    isNitter = false,
  ): void {
    if (!rawHtml) return;

    let html = rawHtml;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Resolve relative URLs (for correct link/image navigation in Obsidian)
      if (baseUrl) {
        const base = new URL(baseUrl);

        doc.querySelectorAll("a").forEach((el) => {
          const href = el.getAttribute("href");
          if (!href) return;
          try {
            el.setAttribute("href", new URL(href, base).toString());
          } catch {
            /* ignore */
          }
        });

      doc.querySelectorAll("img").forEach((el) => {
          const src = el.getAttribute("src");
          if (!src) return;
          try {
            el.setAttribute("src", new URL(src, base).toString());
          } catch {
            /* ignore */
          }
        });
      }

      // Clean up fetched full-article HTML before hero extraction so we don't pick
      // navigation icons / breadcrumbs as the hero image.
      if (stripTopHeadline) {
        this.stripNavigationChromeFromDocument(doc);
        this.stripTopHeadlineFromDocument(doc);
      }

      // Attempt to extract and place hero image
      if (heroSlot) {
        const firstImg = doc.body.querySelector("img");

        if (heroSlot.childElementCount === 0) {
          let heroUrl = fallbackHeroUrl;
          const firstImgSrc = firstImg?.getAttribute("src")?.trim() || "";
          if (firstImgSrc) {
            heroUrl = firstImgSrc;
          }

          if (heroUrl) {
            heroSlot.createEl("img", {
              cls: "rss-reader-fallback-hero",
              attr: { src: heroUrl, alt: title || "Hero image" },
            });

            // Remove the first image from the body if it's the hero image to avoid duplication
            if (firstImg && firstImgSrc && firstImgSrc === heroUrl) {
              firstImg.remove();
            }
          }
        } else {
          // Hero slot already filled by a previous section (e.g. description)
          // If the current section starts with the same image as the hero image, remove it to avoid duplication
          const existingHeroSrc =
            heroSlot.querySelector("img")?.getAttribute("src")?.trim() || "";
          const firstImgSrc = firstImg?.getAttribute("src")?.trim() || "";
          if (existingHeroSrc && firstImg && firstImgSrc === existingHeroSrc) {
            firstImg.remove();
          }
        }
      }

      // Obsidian shows tooltips for many elements with `aria-label` / `data-tooltip*`.
      // Embedded article HTML frequently includes accessibility labels like "Breadcrumbs" and "Article body",
      // which then appear as noisy tooltips on hover throughout the reader view.
      doc.body.querySelectorAll<HTMLElement>("[aria-label]").forEach((el) => {
        el.removeAttribute("aria-label");
      });
      doc.body.querySelectorAll<HTMLElement>("[data-tooltip]").forEach((el) => {
        el.removeAttribute("data-tooltip");
      });
      doc.body
        .querySelectorAll<HTMLElement>("[data-tooltip-position]")
        .forEach((el) => {
          el.removeAttribute("data-tooltip-position");
        });
      doc.body
        .querySelectorAll<HTMLElement>("[data-tooltip-delay]")
        .forEach((el) => {
          el.removeAttribute("data-tooltip-delay");
        });

      if (isNitter) {
        this.transformNitterStatsMarkup(doc);
      }

      html = doc.body.innerHTML;
    } catch {
      // Fall back to raw HTML if parsing fails
    }

    if (
      this.settings.highlights?.enabled &&
      this.settings.highlights.highlightInContent
    ) {
      const highlightService = new HighlightService(this.settings.highlights);
      container.innerHTML = html; // eslint-disable-line @microsoft/sdl/no-inner-html
      highlightService.highlightElement(container);
    } else {
      container.innerHTML = html; // eslint-disable-line @microsoft/sdl/no-inner-html
    }

    // Add classes to images for styling
    container.querySelectorAll("img").forEach((img) => {
      img.addClass("rss-reader-responsive-img");
    });

    if (isNitter) {
      this.hydrateNitterStatsIcons(container);
    }
  }

  private isNitterHost(host: string): boolean {
    return host.toLowerCase().includes("nitter");
  }

  private isTweetLikeItem(item: FeedItem): boolean {
    if (this.isNitterItem(item)) {
      return true;
    }

    return MediaService.isXUrl(item.link) || MediaService.isXUrl(item.feedUrl);
  }

  private isNitterItem(item: FeedItem): boolean {
    const candidates = [item.feedUrl, item.link].filter(
      (u): u is string => typeof u === "string" && u.trim().length > 0,
    );

    for (const url of candidates) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        if (this.isNitterHost(host)) {
          return true;
        }
      } catch {
        // ignore invalid urls
      }
    }

    return false;
  }

  private formatNitterReaderTitle(item: FeedItem): string {
    const { name, handle } = this.extractNitterNameAndHandle(item);
    const date = this.formatIsoDate(item.pubDate);
    const time = this.formatTimeOfDay(item.pubDate);
    const dateTime = [date, time].filter(Boolean).join(" ");

    if (name && handle && dateTime) return `${name} (${handle}) · ${dateTime}`;
    if (name && handle) return `${name} (${handle})`;
    if (name && dateTime) return `${name} · ${dateTime}`;
    if (handle && dateTime) return `${handle} · ${dateTime}`;
    return item.title;
  }

  private extractNitterNameAndHandle(item: FeedItem): { name: string; handle: string } {
    const tryExtract = (source: string): { name: string; handle: string } => {
      const handleMatch = source.match(/@[\w.]+/i);
      const handle = handleMatch ? handleMatch[0] : "";
      let name = source;

      if (handle) {
        name = name.replace(handle, "");
      }

      name = name
        .replace(/[()]/g, " ")
        .replace(/[|/]/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();

      return { name, handle };
    };

    const author = (item.author || "").trim();
    const feedTitle = (item.feedTitle || "").trim();

    const authorParsed = author ? tryExtract(author) : { name: "", handle: "" };
    const feedParsed = feedTitle ? tryExtract(feedTitle) : { name: "", handle: "" };

    const urlHandle = this.extractHandleFromUrl(item.link) || this.extractHandleFromUrl(item.feedUrl);

    const handle =
      (/^@[\w.]+$/i.test(author) ? author : authorParsed.handle) ||
      feedParsed.handle ||
      urlHandle;
    const name = authorParsed.name || feedParsed.name;

    return { name, handle };
  }

  private extractHandleFromUrl(url: string): string {
    const trimmed = (url || "").trim();
    if (!trimmed) return "";

    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase();
      if (
        !this.isNitterHost(host) &&
        !host.includes("twitter.com") &&
        !host.includes("x.com")
      ) {
        return "";
      }
      const parts = u.pathname.split("/").filter(Boolean);
      const username = parts[0] || "";
      if (!username) return "";
      if (/^(home|explore|messages|notifications|settings|search|i)$/i.test(username)) {
        return "";
      }
      return username.startsWith("@") ? username : `@${username}`;
    } catch {
      return "";
    }
  }

  private formatIsoDate(dateInput: string): string {
    const trimmed = (dateInput || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }

    const parsed = new Date(trimmed);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return "";
  }

  private formatTimeOfDay(dateInput: string): string {
    const trimmed = (dateInput || "").trim();
    const parsed = new Date(trimmed);
    if (!Number.isFinite(parsed.getTime())) {
      return "";
    }

    return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  private pickBestNitterTweetHtml(item: FeedItem, fullContent?: string): string {
    const description = (item.description || "").trim();
    const content = (item.content || "").trim();
    const full = (fullContent || "").trim();

    const hasRichFormatting = (html: string): boolean =>
      /<(br|p|blockquote|img)\b/i.test(html);

    if (
      description &&
      (hasRichFormatting(description) ||
        description.length > (content ? content.length : 0))
    ) {
      return description;
    }

    return content || full || description;
  }

  private transformNitterStatsMarkup(doc: Document): void {
    let target =
      doc.body.querySelector<HTMLElement>(".tweet-stats") ||
      doc.body.querySelector<HTMLElement>(".tweet-stats-container");

    if (!target) {
      const iconEl = doc.body.querySelector<HTMLElement>(
        ".icon-comment, .icon-retweet, .icon-heart, .icon-views",
      );
      let cursor: HTMLElement | null = iconEl;
      for (let i = 0; i < 6 && cursor; i++) {
        const count = cursor.querySelectorAll(
          ".icon-comment, .icon-retweet, .icon-heart, .icon-views",
        ).length;
        if (count >= 2) {
          target = cursor;
          break;
        }
        cursor = cursor.parentElement;
      }
    }

    if (!target) return;

    const extractCount = (markerClass: string): string => {
      const marker = target.querySelector<HTMLElement>(`.${markerClass}`);
      if (!marker) return "";
      const text = (marker.parentElement?.textContent || "").replace(/\s+/g, " ").trim();
      const match = text.match(/(\d[\d.,]*\s*[kKmMbB]?)/);
      return (match ? match[1] : "").trim();
    };

    const statsEl = doc.createElement("div");
    statsEl.className = "rss-nitter-stats";

    const pills: Array<{ key: string; icon: string; count: string }> = [
      { key: "comment", icon: "message-circle", count: extractCount("icon-comment") },
      { key: "retweet", icon: "repeat-2", count: extractCount("icon-retweet") },
      { key: "heart", icon: "heart", count: extractCount("icon-heart") },
      { key: "views", icon: "bar-chart-2", count: extractCount("icon-views") },
    ];

    for (const pill of pills) {
      const pillEl = doc.createElement("span");
      pillEl.className = "rss-nitter-stat";
      pillEl.setAttribute("data-stat", pill.key);

      const iconEl = doc.createElement("span");
      iconEl.className = "rss-nitter-stat-icon";
      iconEl.setAttribute("data-rss-icon", pill.icon);

      const countEl = doc.createElement("span");
      countEl.className = "rss-nitter-stat-count";
      countEl.textContent = pill.count;

      pillEl.appendChild(iconEl);
      pillEl.appendChild(countEl);
      statsEl.appendChild(pillEl);
    }

    target.parentElement?.insertBefore(statsEl, target);
    target.remove();
  }

  private hydrateNitterStatsIcons(container: HTMLElement): void {
    container.querySelectorAll<HTMLElement>(".rss-nitter-stat-icon").forEach((el) => {
      const iconName = el.dataset.rssIcon;
      if (!iconName) return;
      try {
        setIcon(el, iconName);
      } catch {
        // ignore icon failures
      }
    });
  }

  private stripTopHeadlineFromHtml(html: string): string {
    if (!html) return html;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      this.stripTopHeadlineFromDocument(doc);
      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }

  private stripNavigationChromeFromHtml(html: string): string {
    if (!html) return html;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      this.stripNavigationChromeFromDocument(doc);
      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }

  private stripTopHeadlineFromDocument(doc: Document): void {
    const h1 = doc.body?.querySelector("h1");
    if (!h1) return;

    const elements = Array.from(doc.body.querySelectorAll("*"));
    const idx = elements.indexOf(h1);
    if (idx === -1 || idx > 9) return;

    h1.remove();
  }

  private stripNavigationChromeFromDocument(doc: Document): void {
    const body = doc.body;
    if (!body) return;

    const elements = Array.from(body.querySelectorAll<HTMLElement>("*"));
    if (elements.length === 0) return;

    const indexByEl = new Map<HTMLElement, number>();
    elements.forEach((el, idx) => indexByEl.set(el, idx));

    const substantialParagraphIndex = elements.findIndex((el) => {
      if (el.tagName.toLowerCase() !== "p") return false;
      const text = (el.textContent || "").replace(/\s+/g, " ").trim();
      return text.length >= 120;
    });

    const cutoffIndex = Math.max(
      29,
      substantialParagraphIndex >= 0 ? substantialParagraphIndex - 1 : 29,
    );

    const hasBreadcrumbSignal = (el: HTMLElement): boolean => {
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const testId = (el.getAttribute("data-testid") || "").toLowerCase();
      const cls = (el.getAttribute("class") || "").toLowerCase();
      const id = (el.getAttribute("id") || "").toLowerCase();
      return (
        aria.includes("breadcrumb") ||
        testId.includes("breadcrumb") ||
        cls.includes("breadcrumb") ||
        cls.includes("breadcrumbs") ||
        id.includes("breadcrumb") ||
        id.includes("breadcrumbs")
      );
    };

    const looksLikeBreadcrumbList = (el: HTMLElement): boolean => {
      const tag = el.tagName.toLowerCase();
      if (tag !== "ol" && tag !== "ul") return false;

      const liEls = Array.from(el.children).filter(
        (c) => (c as HTMLElement).tagName?.toLowerCase() === "li",
      ) as HTMLElement[];
      if (liEls.length < 2 || liEls.length > 10) return false;

      const totalText = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (totalText.length > 140) return false;

      let linkish = 0;
      for (const li of liEls) {
        const kids = Array.from(li.children) as HTMLElement[];
        if (kids.length !== 1) continue;
        const only = kids[0];
        if (only.tagName.toLowerCase() !== "a") continue;
        const t = (only.textContent || "").replace(/\s+/g, " ").trim();
        if (t.length < 1 || t.length > 40) continue;
        linkish++;
      }

      return linkish / liEls.length >= 0.7;
    };

    const looksLikeChromeContainer = (el: HTMLElement): boolean => {
      if (hasBreadcrumbSignal(el)) return true;

      const role = (el.getAttribute("role") || "").toLowerCase();
      if (role === "navigation") return true;

      if (
        el.querySelector(
          "nav, [role='navigation'], [aria-label*='breadcrumb' i], [data-testid*='breadcrumb' i]",
        )
      ) {
        return true;
      }

      const linkCount = el.querySelectorAll("a").length;
      const paragraphCount = el.querySelectorAll("p").length;
      const textLen = (el.textContent || "").replace(/\s+/g, " ").trim().length;
      return linkCount >= 3 && paragraphCount === 0 && textLen < 200;
    };

    const shouldRemove = (el: HTMLElement): boolean => {
      const tag = el.tagName.toLowerCase();

      if (tag === "nav") return true;

      const role = (el.getAttribute("role") || "").toLowerCase();
      if (role === "navigation") return true;

      if (hasBreadcrumbSignal(el)) return true;

      if (tag === "header" || tag === "footer" || tag === "aside") {
        return looksLikeChromeContainer(el);
      }

      if (looksLikeBreadcrumbList(el)) return true;

      return false;
    };

    const candidates = elements.filter((el) => {
      const idx = indexByEl.get(el);
      if (idx === undefined || idx > cutoffIndex) return false;
      return shouldRemove(el);
    });

    if (candidates.length === 0) return;

    const removeSet = new Set(candidates);
    const topLevel = candidates.filter((el) => {
      let p = el.parentElement;
      while (p) {
        if (removeSet.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });

    topLevel.forEach((el) => el.remove());
  }

  private extractDisplayTitleFromHtml(html: string): string | null {
    if (!html) return null;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const h1 = doc.body?.querySelector("h1");
      if (!h1) return null;

      const elements = Array.from(doc.body.querySelectorAll("*"));
      const idx = elements.indexOf(h1);
      if (idx === -1 || idx > 9) return null;

      const raw = (h1.textContent || "").replace(/\s+/g, " ").trim();
      if (!this.isAcceptableDisplayTitle(raw)) return null;
      return raw;
    } catch {
      return null;
    }
  }

  private isAcceptableDisplayTitle(text: string): boolean {
    const t = (text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    if (t.length < 10 || t.length > 200) return false;

    const words = t.split(" ").filter(Boolean);
    if (words.length < 3) return false;

    const lower = t.toLowerCase();
    const boilerplate = [
      "sign in",
      "log in",
      "login",
      "subscribe",
      "advertisement",
      "sponsored",
    ];
    if (boilerplate.some((b) => lower.includes(b))) return false;

    return true;
  }

  private isEquivalentHtml(html1: string, html2: string): boolean {
    const clean = (h: string) => h.replace(/\s+/g, " ").toLowerCase().trim();
    return clean(html1) === clean(html2);
  }

  private hasMeaningfulArticleContent(html: string | null): boolean {
    if (!html) return false;
    const text =
      new DOMParser().parseFromString(html, "text/html").body.textContent || "";
    return text.trim().length > 200;
  }

  private async fetchFullArticleContent(url: string): Promise<string> {
    const proxyUrl =
      this.settings.corsProxyEnabled && this.settings.corsProxyUrl
        ? this.settings.corsProxyUrl
        : undefined;
    return fetchWithProxyFallback(url, proxyUrl);
  }

  private toggleReadStatus(): void {
    if (!this.currentItem) return;
    const nextRead = !this.currentItem.read;
    this.onArticleUpdate(this.currentItem, { read: nextRead }, false);
    this.updateToggleButtons();
  }

  public applyExternalUpdate(
    articleGuid: string,
    updates: Partial<FeedItem>,
  ): void {
    if (!this.currentItem || this.currentItem.guid !== articleGuid) {
      return;
    }

    Object.assign(this.currentItem, updates);
    if (updates.tags) {
      this.currentItem.tags = updates.tags;
      this.refreshReaderHeaderTags();
    }

    if (
      updates.read !== undefined ||
      updates.starred !== undefined ||
      updates.saved !== undefined
    ) {
      this.updateToggleButtons();
    }
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

    if (this.saveButton) {
      this.saveButton.toggleClass("saved", saved);
      this.saveButton.setAttr(
        "title",
        saved ? "Click to open saved article" : "Save article",
      );
    }
  }

  private toggleTagsDropdown(anchor: HTMLElement): void {
    if (!this.currentItem) {
      return;
    }

    if (this.tagsDropdownCleanup) {
      this.tagsDropdownCleanup();
      this.tagsDropdownCleanup = null;
      return;
    }

    const item = this.currentItem;
    const cleanup = createTagsDropdownPortal({
      anchor,
      settings: this.settings,
      item,
      onTagAssignmentChange: (tag, checked) => {
        this.toggleTag(item, tag, checked);
      },
      onPersistSettings: async () => {
        const plugin = this.getRssDashboardPluginForSettingsSave();
        if (!plugin) {
          return;
        }
        try {
          await plugin.saveSettings();
        } catch {
          // ignore
        }
      },
      onAfterSettingsTagsMutated: () => {
        this.refreshReaderHeaderTags();
        if (this.podcastPlayer) {
          this.podcastPlayer.refreshTags();
          this.podcastPlayer.refreshPlaylistTags();
        }
        this.app.workspace.trigger("rss-dashboard:tags-mutated");
      },
      onOpenTagsSettings: () => {
        this.openTagsSettings();
      },
      appContainer: this.contentEl,
      onClosed: () => {
        if (this.tagsDropdownCleanup === cleanup) {
          this.tagsDropdownCleanup = null;
        }
      },
    });

    this.tagsDropdownCleanup = cleanup;
  }

  private closeTagsDropdown(): void {
    if (this.tagsDropdownCleanup) {
      this.tagsDropdownCleanup();
      this.tagsDropdownCleanup = null;
    }
  }

  private openTagsSettings(): void {
    const appWithPlugins = this.app as unknown as {
      plugins?: {
        getPlugin?: (id: string) => unknown;
        plugins?: Record<string, unknown>;
      };
      setting?: {
        open?: () => void;
        openTabById?: (id: string) => void;
      };
    };

    type TagsPlugin = { openTagsSettings?: () => void };
    const plugins = appWithPlugins.plugins;
    const pluginByGetter =
      typeof plugins?.getPlugin === "function"
        ? (plugins.getPlugin("rss-dashboard") as TagsPlugin | null)
        : null;
    const pluginByRegistry = plugins?.plugins?.["rss-dashboard"] as
      | TagsPlugin
      | undefined;

    const plugin = pluginByGetter || pluginByRegistry;
    if (typeof plugin?.openTagsSettings === "function") {
      plugin.openTagsSettings();
      return;
    }

    appWithPlugins.setting?.open?.();
    appWithPlugins.setting?.openTabById?.("rss-dashboard");
  }

  private refreshReaderHeaderTags(): void {
    if (!this.currentItem) {
      return;
    }

    const headerContainer = this.readingContainer?.querySelector<HTMLElement>(
      ".rss-reader-article-header",
    );
    if (!headerContainer) {
      return;
    }

    const tags = this.currentItem.tags || [];
    const existing =
      headerContainer.querySelector<HTMLElement>(".rss-reader-tags");

    if (tags.length === 0) {
      existing?.remove();
      return;
    }

    const tagsContainer =
      existing ??
      headerContainer.createDiv({
        cls: "rss-reader-tags",
      });

    tagsContainer.empty();
    for (const tag of tags) {
      const tagElement = tagsContainer.createDiv({
        cls: "rss-reader-tag",
      });
      tagElement.textContent = tag.name;
      tagElement.style.setProperty("--tag-color", tag.color);
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

    const format = this.settings
      .readerFormat as Partial<ReaderFormatSettings> & {
      wordsPerLine?: number;
    };
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
      "--rss-reader-body-font-size": `${format.fontScalePct / 100}em`,
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
      this.readerFormatPortal.close(true);
      this.readerFormatPortal = null;
      return;
    }

    const format = this.getReaderFormat();
    const portal = createReaderFormatPortal({
      anchor,
      format,
      defaults: DEFAULT_SETTINGS.readerFormat,
      applyFormat: () => this.applyReaderFormat(),
      scheduleSave: () => this.scheduleReaderFormatSave(),
      flushSave: () => this.flushReaderFormatSave(),
      onClosed: () => {
        if (this.readerFormatPortal === portal) {
          this.readerFormatPortal = null;
        }
      },
    });

    this.readerFormatPortal = portal;
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

    if (this.currentItem?.guid === item.guid) {
      this.refreshReaderHeaderTags();
    }

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

    // Update save button state
    if (this.saveButton) {
      const isSaved = Boolean(this.currentItem.saved);
      this.saveButton.toggleClass("saved", isSaved);
      this.saveButton.setAttr(
        "title",
        isSaved ? "Click to open saved article" : "Save article",
      );
    }
  }

  private resetTitle(): void {
    this.syncReaderTitle();
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
