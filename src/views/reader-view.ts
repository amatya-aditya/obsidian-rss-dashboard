import {
  ItemView,
  WorkspaceLeaf,
  Menu,
  MenuItem,
  App,
  Setting,
  Notice,
  requireApiVersion,
} from "obsidian";
import { setIcon } from "obsidian";
import {
  FeedItem,
  RssDashboardSettings,
  ArticleSavingSettings,
  Tag,
  DEFAULT_SETTINGS,
  ReaderFormatSettings,
} from "../types/types";
import { MediaService } from "../services/media-service";
import { ArticleSaver } from "../services/article-saver";
import { WebViewerIntegration } from "../services/web-viewer-integration";
import { HighlightService } from "../services/highlight-service";
import { PodcastPlayer } from "./podcast-player";
import { VideoPlayer } from "./video-player";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { ensureUtf8Meta, robustFetch, setCssProps } from "../utils/platform-utils";
import { RSS_DASHBOARD_VIEW_TYPE } from "./dashboard-view";
import { showEditTagModal } from "../utils/tag-utils";

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
    fallbackHeroAlt?: string,
    heroSlot?: HTMLElement,
  ): void {
    const htmlString = ensureUtf8Meta(rawHtml || "");
    const processedHtmlString = this.convertRelativeUrlsInContent(
      htmlString,
      baseUrl,
    );
    const parser = new DOMParser();
    const doc = parser.parseFromString(processedHtmlString, "text/html");

    function appendNodes(parent: HTMLElement, nodes: NodeListOf<ChildNode>) {
      nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          parent.appendText(node.textContent || "");
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          const isIconElement =
            element.tagName === "I" && element.classList.contains("icon-class");
          if (!isIconElement) {
            const tag =
              element.tagName.toLowerCase() as keyof HTMLElementTagNameMap;
            const el = parent.createEl(tag);

            Array.from(element.attributes).forEach((attr) => {
              // Safety check: ensure attribute name is valid to avoid InvalidCharacterError
              if (/^[a-z:_-][a-z0-9:._-]*$/i.test(attr.name)) {
                el.setAttr(attr.name, attr.value);
              }
            });

            appendNodes(el, node.childNodes);
          }
        }
      });
    }

    appendNodes(container, doc.body.childNodes);

    container.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src");
      if (src && src.startsWith("app://")) {
        img.setAttribute("src", src.replace("app://", "https://"));
      }
      img.classList.add("rss-reader-responsive-img");

      img.addEventListener("error", () => {
        // Substack frequently includes broken <source srcset> or mangled srcset values in feed HTML.
        // If an inline image fails anyway, show a single hero fallback (card image) rather than
        // leaving the reader with no imagery at all.
        if (
          heroSlot &&
          fallbackHeroUrl &&
          this.isSubstackUrl(baseUrl) &&
          !heroSlot.querySelector("img")
        ) {
          heroSlot.createEl("img", {
            cls: "rss-reader-fallback-hero",
            attr: {
              src: fallbackHeroUrl,
              alt: fallbackHeroAlt || "",
              loading: "lazy",
              referrerpolicy: "no-referrer",
            },
          });
        }

        img.remove();
      });
    });

    // Substack renders interactive "expand" UI controls inside feed HTML (buttons under images).
    // They don't function in the Obsidian reader and end up as empty bordered buttons.
    container
      .querySelectorAll(
        ".image-link-expand, button.restack-image, button.view-image",
      )
      .forEach((el) => el.remove());

    container.querySelectorAll("source").forEach((source) => {
      const srcset = source.getAttribute("srcset");
      if (srcset) {
        const processedSrcset = srcset
          .split(",")
          .map((part: string) => {
            const trimmedPart = part.trim();

            const urlMatch = trimmedPart.match(/^([^\s]+)(\s+\d+w)?$/);
            if (urlMatch) {
              const url = urlMatch[1];
              const sizeDescriptor = urlMatch[2] || "";

              let absoluteUrl = url;
              if (url.startsWith("app://")) {
                absoluteUrl = url.replace("app://", "https://");
              } else if (url.startsWith("//")) {
                absoluteUrl = "https:" + url;
              }
              return absoluteUrl + sizeDescriptor;
            }
            return trimmedPart;
          })
          .join(", ");
        source.setAttribute("srcset", processedSrcset);
      }
    });

    container.querySelectorAll("a").forEach((link) => {
      const href = link.getAttribute("href");
      if (href && href.startsWith("app://")) {
        link.setAttribute("href", href.replace("app://", "https://"));
      }
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    });

    this.app.workspace.trigger("parse-math", container);

    if (
      this.settings.highlights?.enabled &&
      this.settings.highlights.highlightInContent
    ) {
      const highlightService = new HighlightService(this.settings.highlights);
      highlightService.highlightElement(container);
    }
  }

  private isEquivalentHtml(first: string, second: string): boolean {
    if (!first || !second) {
      return false;
    }
    const firstSignature = this.buildDedupSignature(first);
    const secondSignature = this.buildDedupSignature(second);
    return Boolean(
      firstSignature && secondSignature && firstSignature === secondSignature,
    );
  }

  private buildDedupSignature(html: string): string {
    if (!html || !html.trim()) {
      return "";
    }

    const tokens = this.extractComparableTokens(html);
    if (tokens.length === 0) {
      return "";
    }

    const tokenFrequency = new Map<string, number>();
    for (const token of tokens) {
      tokenFrequency.set(token, (tokenFrequency.get(token) || 0) + 1);
    }

    return JSON.stringify(
      Array.from(tokenFrequency.entries()).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    );
  }

  private extractComparableTokens(html: string): string[] {
    const parsedText = this.extractNormalizedTextFromHtml(html);
    if (!parsedText) {
      return [];
    }

    const normalized = parsedText
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

    if (!normalized) {
      return [];
    }

    return normalized.split(/\s+/).filter((token) => token.length >= 2);
  }

  private extractNormalizedTextFromHtml(html: string): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(ensureUtf8Meta(html), "text/html");
      return (doc.body.textContent || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      return html
        .toLowerCase()
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  async fetchFullArticleContent(url: string): Promise<string> {
    // Reuse the more robust fetch/extraction strategy used by article saving.
    try {
      const saverContent = await this.articleSaver.fetchFullArticleContent(url);
      if (
        this.hasMeaningfulArticleContent(saverContent) &&
        !this.isBlockedOrChallengeContent(saverContent)
      ) {
        return saverContent;
      }
    } catch {
      // Fall through to local reader fetch path.
    }

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
      DNT: "1",
    };

    try {
      const text = await robustFetch(url, { headers });
      if (!text) {
        return "";
      }
      if (this.isBlockedOrChallengeContent(text)) {
        return "";
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      return this.extractReadableContentFromHtmlDocument(doc, url);
    } catch {
      return "";
    }
  }

  private extractReadableContentFromHtmlDocument(
    doc: Document,
    url: string,
  ): string {
    const reader = new Readability(doc);
    const article = reader.parse();
    const readableContent = article?.content || "";
    if (
      this.hasMeaningfulArticleContent(readableContent) &&
      !this.isBlockedOrChallengeContent(readableContent)
    ) {
      return this.convertRelativeUrlsInContent(readableContent, url);
    }

    const mainContent = doc.querySelector(
      "main, article, .content, .post-content, .entry-content, .article-content, .main-content, section[role='main']",
    );
    if (mainContent) {
      return this.convertRelativeUrlsInContent(
        ensureUtf8Meta(new XMLSerializer().serializeToString(mainContent)),
        url,
      );
    }

    return this.convertRelativeUrlsInContent(
      ensureUtf8Meta(new XMLSerializer().serializeToString(doc.body)),
      url,
    );
  }

  private isBlockedOrChallengeContent(content: string): boolean {
    const text = this.extractNormalizedTextFromHtml(content);
    if (!text) {
      return false;
    }

    const blockedMarkers = [
      "vercel security checkpoint",
      "too many requests",
      "error 429",
      "status code 429",
      "rate limit",
      "access denied",
      "enable javascript and cookies",
      "checking your browser",
      "captcha",
      "bot detection",
      "request blocked",
      "please verify you are human",
    ];

    return blockedMarkers.some((marker) => text.includes(marker));
  }

  private hasMeaningfulArticleContent(content: string): boolean {
    if (!content || !content.trim()) {
      return false;
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, "text/html");
      const body = doc.body;
      if (!body) {
        return false;
      }

      body.querySelectorAll("script, style, noscript").forEach((node) => {
        node.remove();
      });

      const text = (body.textContent || "").replace(/\s+/g, " ").trim();
      if (text.length >= 80) {
        return true;
      }

      return Boolean(
        body.querySelector("p, article, li, blockquote, h1, h2, h3, h4"),
      );
    } catch {
      return content.trim().length >= 80;
    }
  }

  private convertHtmlToMarkdown(html: string): string {
    return this.turndownService.turndown(html);
  }

  private showMarkdownView(markdownContent: string, item: FeedItem): void {
    const modal = document.body.createDiv({
      cls: "rss-reader-markdown-modal",
    });

    const modalContent = modal.createDiv({
      cls: "rss-reader-markdown-content",
    });

    modalContent.createDiv({
      text: markdownContent,
    });

    const saveButton = modalContent.createEl("button", {
      text: "Save to vault",
    });
    saveButton.addEventListener("click", () => {
      void (async () => {
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
        }
        document.body.removeChild(modal);
      })();
    });

    const closeButton = modalContent.createEl("button", {
      text: "Close",
    });
    closeButton.addEventListener("click", () => {
      document.body.removeChild(modal);
    });
    document.body.appendChild(modal);
  }

  onClose(): Promise<void> {
    this.closeTagsDropdownPortal();
    this.closeReaderFormatPortal(true);
    this.contentEl.empty();
    return Promise.resolve();
  }

  private convertRelativeUrlsInContent(
    content: string,
    baseUrl: string,
  ): string {
    if (!content || !baseUrl) return content;
    try {
      const isSubstack = this.isSubstackUrl(baseUrl);
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
          } catch {
            // Not a Substack image or malformed JSON
          }
        }

        if (src) {
          img.setAttribute("src", this.convertToAbsoluteUrl(src.trim(), baseUrl));
        }
        
        // Handle srcset on <img>
        const srcset = img.getAttribute("srcset");
        if (srcset) {
          if (isSubstack && this.isLikelyBrokenSubstackSrcset(srcset)) {
            img.removeAttribute("srcset");
            img.removeAttribute("sizes");
          } else {
            img.setAttribute("srcset", this.processSrcset(srcset, baseUrl));
          }
        }

        // Handle common lazy loading attributes
        ["data-src", "data-srcset", "data-original", "data-delayed-url"].forEach(attrName => {
          const val = img.getAttribute(attrName);
          if (val) {
            if (attrName.includes("srcset")) {
              if (isSubstack && this.isLikelyBrokenSubstackSrcset(val)) {
                img.removeAttribute(attrName);
              } else {
                img.setAttribute(attrName, this.processSrcset(val, baseUrl));
              }
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
          if (isSubstack && this.isLikelyBrokenSubstackSrcset(srcset)) {
            source.remove();
            return;
          }
          source.setAttribute("srcset", this.processSrcset(srcset, baseUrl));
        }
        
        const dataSrcset = source.getAttribute("data-srcset");
        if (dataSrcset) {
          if (isSubstack && this.isLikelyBrokenSubstackSrcset(dataSrcset)) {
            source.remove();
            return;
          }
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

      // Update <iframe> tags (often missed)
      doc.querySelectorAll("iframe").forEach((iframe) => {
        const src = iframe.getAttribute("src");
        if (src) {
          iframe.setAttribute("src", this.convertToAbsoluteUrl(src, baseUrl));
        }
      });

      return doc.body.innerHTML;
    } catch (e) {
      console.error("[RSS Dashboard] Failed to convert relative URLs:", e);
      return content;
    }
  }

  private convertToAbsoluteUrl(url: string, baseUrl: string): string {
    if (!url || !baseUrl) return url;
    if (url.startsWith("app://")) {
      return url.replace("app://", "https://");
    }
    if (url.startsWith("//")) {
      return "https:" + url;
    }
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
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

  private isSubstackUrl(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host === "substack.com" || host.endsWith(".substack.com");
    } catch {
      return false;
    }
  }

  private isLikelyBrokenSubstackSrcset(srcset: string): boolean {
    const s = (srcset || "").trim();
    if (!s) return false;

    // Heuristic: this is the broken pattern seen in some Substack feed HTML where a single
    // URL gets exploded into comma-separated fragments, which makes the browser attempt
    // nonsense URLs like `.../image/fetch/$s_!MM86!` or `<site>.substack.com/fl_progressive...`.
    if (
      s.includes("$s_!") &&
      /substackcdn\.com\/image\/fetch\/\$s_![^,]*,\s+https?:\/\//i.test(s)
    ) {
      return true;
    }

    if (
      /\bsubstack\.com\/w_\d+/i.test(s) ||
      /\bsubstack\.com\/c_limit\b/i.test(s) ||
      /\bsubstack\.com\/f_webp\b/i.test(s) ||
      /\bsubstack\.com\/q_auto\b/i.test(s) ||
      /\bsubstack\.com\/fl_progressive:/i.test(s)
    ) {
      return true;
    }

    return false;
  }

  private updateSavedLabel(saved: boolean): void {
    // This method is kept for compatibility but no longer displays a label
    // The save button icon state is now managed elsewhere
    void saved;
  }

  private toggleReadStatus(): void {
    if (!this.currentItem) return;

    const newReadState = !this.currentItem.read;
    this.currentItem.read = newReadState;

    // Update the icon
    if (this.readToggleButton) {
      setIcon(this.readToggleButton, newReadState ? "check-circle" : "circle");
      this.readToggleButton.classList.toggle("read", newReadState);
      this.readToggleButton.classList.toggle("unread", !newReadState);
      this.readToggleButton.setAttr(
        "title",
        newReadState ? "Mark as unread" : "Mark as read",
      );
    }

    // Notify parent to persist the change
    this.onArticleUpdate(this.currentItem, { read: newReadState }, false);
  }

  private toggleStarStatus(): void {
    if (!this.currentItem) return;

    const newStarState = !this.currentItem.starred;
    this.currentItem.starred = newStarState;

    // Update the icon
    if (this.starToggleButton) {
      setIcon(this.starToggleButton, newStarState ? "star" : "star-off");
      this.starToggleButton.classList.toggle("starred", newStarState);
      this.starToggleButton.classList.toggle("unstarred", !newStarState);
      this.starToggleButton.setAttr(
        "title",
        newStarState ? "Remove from starred" : "Add to starred",
      );
    }

    // Notify parent to persist the change
    this.onArticleUpdate(this.currentItem, { starred: newStarState }, false);
  }

  private showTagsDropdown(event: MouseEvent, item: FeedItem): void {
    event.stopPropagation();
    const anchor = event.currentTarget;
    if (!(anchor instanceof HTMLElement)) {
      return;
    }
    this.createTagsDropdownPortal(anchor, item);
  }

  private createTagsDropdownPortal(anchor: HTMLElement, item: FeedItem): void {
    this.closeTagsDropdownPortal();

    const targetDocument = anchor.ownerDocument;
    const targetBody = targetDocument.body;
    const targetWindow = targetDocument.defaultView || window;
    const isMobile = targetWindow.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      this.tagsDropdownBackdrop = targetBody.createDiv({
        cls: "rss-dashboard-tags-sheet-backdrop",
      });
    }

    const portalDropdown = targetBody.createDiv({
      cls: "rss-dashboard-tags-dropdown-content rss-dashboard-tags-dropdown-content-portal rss-reader-tags-dropdown-portal",
    });
    if (isMobile) {
      portalDropdown.addClass("rss-dashboard-tags-mobile-sheet");
      const sheetHeader = portalDropdown.createDiv({
        cls: "rss-dashboard-tags-sheet-header",
      });
      sheetHeader.createDiv({
        cls: "rss-dashboard-tags-sheet-title",
        text: "Manage tags",
      });
      const sheetActions = sheetHeader.createDiv({
        cls: "rss-dashboard-tags-sheet-actions",
      });
      const addTagBtn = sheetActions.createEl("button", {
        cls: "rss-dashboard-tags-sheet-btn",
        text: "Add tag",
      });
      setIcon(addTagBtn, "plus");
      addTagBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeTagsDropdownPortal();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        void (this.app as any).plugins.plugins[
          "rss-dashboard"
        ].openTagsSettings();
      });
      const doneBtn = sheetActions.createEl("button", {
        cls: "rss-dashboard-tags-sheet-btn rss-dashboard-tags-sheet-btn-done",
        text: "Done",
      });
      doneBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeTagsDropdownPortal();
      });
    }
    const tagsListContainer = portalDropdown.createDiv({
      cls: "rss-dashboard-tag-list",
    });
    const tagSeparator = portalDropdown.createDiv({
      cls: "rss-dashboard-tag-item-separator",
    });
    const updateTagSeparatorVisibility = (): void => {
      const hasTags = this.settings.availableTags.length > 0;
      tagSeparator.style.display = hasTags ? "" : "none";
    };
    const rerenderTagItems = (): void => {
      tagsListContainer.empty();
      for (const nextTag of this.settings.availableTags) {
        appendTagItem(nextTag);
      }
      updateTagSeparatorVisibility();
    };
    const deleteTagFromProfile = (tag: Tag): void => {
      const tagIndex = this.settings.availableTags.findIndex(
        (t) => t.name === tag.name,
      );
      if (tagIndex === -1) return;
      this.settings.availableTags.splice(tagIndex, 1);
      this.settings.feeds.forEach((feed) => {
        feed.items.forEach((feedItem) => {
          if (feedItem.tags) {
            feedItem.tags = feedItem.tags.filter((t) => t.name !== tag.name);
          }
        });
      });
      if (item.tags?.some((t) => t.name === tag.name)) {
        item.tags = item.tags.filter((t) => t.name !== tag.name);
      }
      this.onArticleUpdate(item, {}, false);
      new Notice(`Tag "${tag.name}" deleted successfully!`);
      updateTagSeparatorVisibility();
    };
    this.tagsDropdownPortal = portalDropdown;
    this.tagsDropdownDocument = targetDocument;

    const appendTagItem = (tag: Tag, checkedOverride?: boolean) => {
      const tagItem = tagsListContainer.createDiv({
        cls: "rss-dashboard-tag-item",
      });
      const hasTag =
        checkedOverride ??
        (item.tags?.some((existing) => existing.name === tag.name) || false);

      const tagCheckbox = tagItem.createEl("input", {
        attr: { type: "checkbox" },
        cls: "rss-dashboard-tag-checkbox",
      });
      tagCheckbox.checked = hasTag;

      const tagLabel = tagItem.createDiv({
        cls: "rss-dashboard-tag-label",
        text: tag.name,
      });
      tagLabel.style.setProperty("--tag-color", tag.color);

      const editButton = tagItem.createEl("button", {
        cls: "rss-dashboard-tag-action-button rss-dashboard-tag-edit-button",
        attr: { title: `Edit "${tag.name}" tag`, "aria-label": "Edit tag" },
      });
      setIcon(editButton, "pencil");

      const deleteButton = tagItem.createEl("button", {
        cls: "rss-dashboard-tag-action-button rss-dashboard-tag-delete-button",
        attr: { title: `Delete "${tag.name}" tag`, "aria-label": "Delete tag" },
      });
      setIcon(deleteButton, "trash");

      tagCheckbox.addEventListener("change", (e) => {
        e.stopPropagation();
        const isChecked = (e.target as HTMLInputElement).checked;
        this.toggleTag(item, tag, isChecked);
      });

      tagItem.addEventListener("click", (e) => {
        if (
          e.target === tagCheckbox ||
          (e.target instanceof Element &&
            (e.target.closest(".rss-dashboard-tag-delete-button") ||
             e.target.closest(".rss-dashboard-tag-edit-button")))
        ) {
          return;
        }
        const isChecked = !tagCheckbox.checked;
        tagCheckbox.checked = isChecked;
        
        tagItem.classList.add("rss-dashboard-tag-item-processing");
        this.toggleTag(item, tag, isChecked);

        window.setTimeout(() => {
          tagItem.classList.remove("rss-dashboard-tag-item-processing");
        }, 200);
      });

      editButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showEditTagModal({
          settings: this.settings,
          tag,
          onSave: () => {
            rerenderTagItems();
          },
        });
      });

      deleteButton.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteTagFromProfile(tag);
        tagItem.remove();
      });

      tagItem.appendChild(tagCheckbox);
      tagItem.appendChild(tagLabel);
      tagItem.appendChild(editButton);
      tagItem.appendChild(deleteButton);
    };

    for (const tag of this.settings.availableTags) {
      appendTagItem(tag);
    }
    updateTagSeparatorVisibility();

    if (!isMobile) {
      const inlineAddRow = portalDropdown.createDiv({
        cls: "rss-dashboard-tag-inline-add-row",
      });

      const colorInput = inlineAddRow.createEl("input", {
        attr: {
          type: "color",
          value: "#3498db",
        },
        cls: "rss-dashboard-tag-inline-color",
      });

      const nameInput = inlineAddRow.createEl("input", {
        attr: {
          type: "text",
          placeholder: "Add new tag...",
          autocomplete: "off",
        },
        cls: "rss-dashboard-tag-inline-input",
      });
      nameInput.spellcheck = false;

      const addButton = inlineAddRow.createEl("button", {
        cls: "rss-dashboard-tag-inline-button",
        attr: { title: "Add tag" },
      });
      setIcon(addButton, "plus");

      const submitInlineTag = () => {
        const tagName = nameInput.value.trim();
        const tagColor = colorInput.value;

        if (!tagName) {
          new Notice("Please enter a tag name!");
          return;
        }

        if (
          this.settings.availableTags.some(
            (tag) => tag.name.toLowerCase() === tagName.toLowerCase(),
          )
        ) {
          new Notice("A tag with this name already exists!");
          return;
        }

        const newTag: Tag = {
          name: tagName,
          color: tagColor,
        };

        this.settings.availableTags.push(newTag);
        this.toggleTag(item, newTag, true);
        appendTagItem(newTag, true);

        nameInput.value = "";
        requestAnimationFrame(() => nameInput.focus());
        new Notice(`Tag "${tagName}" added`);
      };

      addButton.addEventListener("click", (e) => {
        e.stopPropagation();
        submitInlineTag();
      });

      nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          submitInlineTag();
        }
      });
    } // end !isMobile

    const rect = anchor.getBoundingClientRect();
    const dropdownRect = portalDropdown.getBoundingClientRect();
    const appContainer =
      this.contentEl.closest(".workspace-leaf-content") || targetBody;
    const appContainerRect = appContainer.getBoundingClientRect();

    if (isMobile) {
      const syncMobileViewportHeight = () => {
        const vvp = targetWindow.visualViewport;
        const viewportHeight = vvp?.height ?? targetWindow.innerHeight;
        portalDropdown.style.setProperty(
          "max-height",
          `${viewportHeight - 16}px`,
          "important",
        );
      };
      syncMobileViewportHeight();

      const visualViewport = targetWindow.visualViewport;
      if (visualViewport) {
        visualViewport.addEventListener("resize", syncMobileViewportHeight);
        visualViewport.addEventListener("scroll", syncMobileViewportHeight);
        this.tagsDropdownViewportCleanup = () => {
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
        this.tagsDropdownViewportCleanup = () => {
          targetWindow.removeEventListener("resize", syncMobileViewportHeight);
        };
      }

      this.tagsDropdownBackdrop?.addEventListener("click", () => {
        this.closeTagsDropdownPortal();
      });

      return;
    }

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
          this.tagsDropdownPortal &&
          !this.tagsDropdownPortal.contains(ev.target as Node) &&
          !anchor.contains(ev.target as Node)
        ) {
          this.closeTagsDropdownPortal();
        }
      };
      this.tagsDropdownOutsideHandler = outsideHandler;
      targetDocument.addEventListener("mousedown", outsideHandler);
    }, 0);
  }

  private closeTagsDropdownPortal(): void {
    if (this.tagsDropdownBackdrop) {
      this.tagsDropdownBackdrop.remove();
      this.tagsDropdownBackdrop = null;
    }

    if (this.tagsDropdownPortal) {
      this.tagsDropdownPortal.remove();
      this.tagsDropdownPortal = null;
    }

    if (this.tagsDropdownOutsideHandler && this.tagsDropdownDocument) {
      this.tagsDropdownDocument.removeEventListener(
        "mousedown",
        this.tagsDropdownOutsideHandler,
      );
    }

    if (this.tagsDropdownViewportCleanup) {
      this.tagsDropdownViewportCleanup();
      this.tagsDropdownViewportCleanup = null;
    }

    this.tagsDropdownOutsideHandler = null;
    this.tagsDropdownDocument = null;
  }

  private getReaderFormat(): ReaderFormatSettings {
    if (!this.settings.readerFormat) {
      this.settings.readerFormat = { ...DEFAULT_SETTINGS.readerFormat };
      return this.settings.readerFormat;
    }

    const format = this.settings.readerFormat as Partial<ReaderFormatSettings>;
    const defaults = DEFAULT_SETTINGS.readerFormat;

    if (format.textAlign === undefined) format.textAlign = defaults.textAlign;
    if (format.wordsPerLine === undefined)
      format.wordsPerLine = defaults.wordsPerLine;
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

  private applyReaderFormat(): void {
    const format = this.getReaderFormat();
    const wordsPerLine = Number.isFinite(format.wordsPerLine)
      ? Math.max(0, Math.round(format.wordsPerLine))
      : 0;
    const maxWidth = wordsPerLine > 0 ? `${wordsPerLine * 6}ch` : "none";

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

    let wordsSlider: { setValue: (value: number) => void } | null = null;
    let wordsInput: HTMLInputElement | null = null;
    new Setting(controlsContainer)
      .setName("Words per row")
      .setDesc("Approximate measure (0 = full width)")
      .addSlider((slider) => {
        wordsSlider = slider;
        slider
          .setLimits(0, 30, 1)
          .setValue(format.wordsPerLine)
          .setDynamicTooltip()
          .onChange((value) => {
            format.wordsPerLine = value;
            if (wordsInput) wordsInput.value = String(value);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          });
      })
      .addText((text) => {
        wordsInput = text.inputEl;
        text.inputEl.addClass("rss-reader-slider-value-input");
        text.setValue(String(format.wordsPerLine)).onChange((value) => {
          const numValue = parseInt(value);
          if (!isNaN(numValue)) {
            const clamped = Math.max(0, Math.min(30, numValue));
            format.wordsPerLine = clamped;
            if (wordsSlider) wordsSlider.setValue(clamped);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          }
        });
      });

    let fontSizeSlider: { setValue: (value: number) => void } | null = null;
    let fontSizeInput: HTMLInputElement | null = null;
    new Setting(controlsContainer)
      .setName("Font size")
      .setDesc("Relative size (%)")
      .addSlider((slider) => {
        fontSizeSlider = slider;
        slider
          .setLimits(80, 200, 5)
          .setValue(format.fontScalePct)
          .setDynamicTooltip()
          .onChange((value) => {
            format.fontScalePct = value;
            if (fontSizeInput) fontSizeInput.value = String(value);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          });
      })
      .addText((text) => {
        fontSizeInput = text.inputEl;
        text.inputEl.addClass("rss-reader-slider-value-input");
        text.setValue(String(format.fontScalePct)).onChange((value) => {
          const numValue = parseInt(value);
          if (!isNaN(numValue)) {
            const clamped = Math.max(80, Math.min(200, numValue));
            format.fontScalePct = clamped;
            if (fontSizeSlider) fontSizeSlider.setValue(clamped);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          }
        });
      });

    let lineHeightSlider: { setValue: (value: number) => void } | null = null;
    let lineHeightInput: HTMLInputElement | null = null;
    new Setting(controlsContainer)
      .setName("Line height")
      .setDesc("Relative spacing (%)")
      .addSlider((slider) => {
        lineHeightSlider = slider;
        slider
          .setLimits(120, 220, 5)
          .setValue(format.lineHeightPct)
          .setDynamicTooltip()
          .onChange((value) => {
            format.lineHeightPct = value;
            if (lineHeightInput) lineHeightInput.value = String(value);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          });
      })
      .addText((text) => {
        lineHeightInput = text.inputEl;
        text.inputEl.addClass("rss-reader-slider-value-input");
        text.setValue(String(format.lineHeightPct)).onChange((value) => {
          const numValue = parseInt(value);
          if (!isNaN(numValue)) {
            const clamped = Math.max(120, Math.min(220, numValue));
            format.lineHeightPct = clamped;
            if (lineHeightSlider) lineHeightSlider.setValue(clamped);
            this.applyReaderFormat();
            this.scheduleReaderFormatSave();
          }
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
      btn.setButtonText("Reset").onClick(() => {
        Object.assign(format, DEFAULT_SETTINGS.readerFormat);

        alignDropdown?.setValue(format.textAlign);
        wordsSlider?.setValue(format.wordsPerLine);
        if (wordsInput) wordsInput.value = String(format.wordsPerLine);
        fontSizeSlider?.setValue(format.fontScalePct);
        if (fontSizeInput) fontSizeInput.value = String(format.fontScalePct);
        lineHeightSlider?.setValue(format.lineHeightPct);
        if (lineHeightInput)
          lineHeightInput.value = String(format.lineHeightPct);
        fontDropdown?.setValue(format.fontFamily);
        paragraphDropdown?.setValue(format.paragraphSpacing);

        this.applyReaderFormat();
        this.scheduleReaderFormatSave();
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
        const maxHeight = Math.max(220, Math.floor(viewportHeight - bottomOffset - 8));
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
