import {
  ItemView,
  WorkspaceLeaf,
  Menu,
  MenuItem,
  Setting,
  requireApiVersion,
  TFile,
  Notice,
  setTooltip,
} from "obsidian";
import { setIcon, Scope } from "obsidian";
import {
  addMathTurndownRule,
  protectMathForMarkdown,
  scheduleProcessMathElements,
} from "../utils/math-rendering";
import {
  handleReaderMathCopy,
  trackReaderMathSelection,
} from "../utils/math-copy";
import { sanitizeAndAppendHtml } from "../utils/safe-html";
import { type FullArticleFetchFailureType } from "../utils/fetch-helpers";
import { type RawArticleMetadata } from "../utils/article-metadata";
import {
  applyArticleMetadata,
  feedLanguageFor,
} from "../utils/article-metadata-persistence";
import {
  RssDashboardSettings,
  FeedItem,
  ReaderFormatSettings,
  DEFAULT_SETTINGS,
  ArticleSavingSettings,
  SavedTemplate,
  Tag,
  ViewLocation,
} from "../types/types";
import { HighlightService } from "../services/highlight-service";
import { resolveDisplayDate } from "../services/feed-parser/feed-retention";
import { ArticleSaver } from "../services/article-saver";
import { setCssProps } from "../utils/platform-utils";
import {
  fetchFullArticleContentWithOutcome,
  RESTRICTED_ARTICLE_BANNER,
  RESTRICTED_ARTICLE_LINK_TEXT,
  RESTRICTED_ARTICLE_NOTICE,
  RESTRICTED_ARTICLE_REASON,
} from "../utils/full-article-fetch";
import { isLikelyVideoItem } from "../utils/video-detection";
import {
  buildReaderImageTooltipText,
  formatReaderDateText,
  getReaderImageFilename,
  placeHeroImage,
  resolveFallbackHeroUrl,
  resolveReaderMediaRoute,
  resolveRelativeUrlsInDocument,
  descriptionToStripFromBody,
  selectArticleSections,
  stripEmbeddedTooltipAttributes,
} from "../utils/reader-article-render";
import {
  extractDisplayTitleFromHtml,
  hasMeaningfulArticleContent,
  isLikelySameImageSource,
  stripDuplicateLeadCaptionBlocks,
  stripDuplicateLeadContentFromDocument,
  stripDuplicateLeadMediaMatchingHero,
  stripLeadMediaBeforeContent,
  stripNavigationChromeFromDocument,
  stripNavigationChromeFromHtml,
  stripSkipLinksFromDocument,
  stripTopHeadlineFromDocument,
  stripTopHeadlineFromHtml,
} from "../utils/reader-html-cleanup";
import TurndownService from "turndown";
import { WebViewerIntegration } from "../services/web-viewer-integration";
import { MediaService } from "../services/media-service";
import { createTagsDropdownPortal } from "../utils/tags-dropdown-portal";
import { resolveItemExternalUrl } from "../utils/item-url-utils";
import { resolveSavedTemplateForArticle } from "../utils/saved-template-utils";
import { resolvePodcastOpenDestinations } from "../utils/podcast-open-destinations";
import { resolveApplePodcastsShowUrl } from "../services/apple-podcasts-service";
import { createReaderFormatPortal } from "../utils/reader-format-portal";
import {
  normalizeSubstackImageUrl,
  normalizeSubstackImageUrlsInDocument,
} from "../utils/substack-image-url";
import { firstNonFormulaImageUrl } from "../utils/image-url-utils";
import { ReaderLightbox } from "../components/reader-lightbox";
import {
  isLightboxEligibleImage,
  resolveFullResolutionImageSource,
} from "../utils/full-size-image-resolver";
import { PodcastPlayer } from "./podcast-player";
import { VideoPlayer } from "./video-player";
import { RSS_DASHBOARD_VIEW_TYPE, RssDashboardView } from "./dashboard-view";
import {
  CustomSaveModal,
  type CustomSaveModalContext,
} from "../modals/custom-save-modal";
import { ShortcutHelpModal } from "../modals/shortcut-help-modal";
import { openWebViewerSaveModal } from "../modals/web-viewer-save-modal";
import { setupReaderHotkeys } from "../hotkeys/reader-hotkeys";

const VIDEO_ARTICLE_BANNER =
  "This item appears to be a video. Open the source page to watch.";
const VIDEO_ARTICLE_LINK_TEXT = "Open video at source";

const STARRED_IMPORT_UNFETCHED_BANNER_TEXT =
  "This is a cached preview from the starred.json import";
const STARRED_IMPORT_FAILED_BANNER_TEXT =
  "The last attempt to fetch the full article failed. Showing the cached preview from the starred.json import";
const STARRED_IMPORT_FETCH_NOW_TEXT = "Fetch now";
const STARRED_IMPORT_OPEN_IN_BROWSER_TEXT = "Open in browser";
const STARRED_IMPORT_FETCH_FAILED_NOTICE =
  "Could not fetch full article content.";

export const RSS_READER_VIEW_TYPE = "rss-reader-view";

export class ReaderView extends ItemView {
  private currentItem: FeedItem | null = null;
  private readingContainer!: HTMLElement;
  private titleElement!: HTMLElement;
  private articleSaverProvider: () => ArticleSaver;
  private settingsProvider: () => RssDashboardSettings;
  private onArticleSave: (item: FeedItem) => void;
  private persistSettings: () => Promise<void>;
  private onArticleUpdate: (
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void | Promise<void>;
  private webViewerIntegration: WebViewerIntegration | null = null;
  private podcastPlayer: PodcastPlayer | null = null;
  private videoPlayer: VideoPlayer | null = null;
  private relatedItems: FeedItem[] = [];
  private currentFullContent?: string;
  private currentFetchedArticleContent?: string;
  private currentFullContentFetchAttempted = false;
  private currentDisplayTitle?: string;
  private currentReaderTitle?: string;
  private imageAccessibleTextIndex = 0;
  private currentContentIsFullArticle = false;
  private turndownService = new TurndownService();
  private onPlaybackProgress?: (
    item: FeedItem,
    position: number,
    duration: number,
    flush?: boolean,
  ) => void;
  private readToggleButton: HTMLElement | null = null;
  private starToggleButton: HTMLElement | null = null;
  private saveButton: HTMLElement | null = null;
  private returnLeaf: WorkspaceLeaf | null = null;
  private tagsDropdownCleanup: (() => void) | null = null;
  private currentFullContentFailureType: FullArticleFetchFailureType = "none";
  private currentPageMetadata?: RawArticleMetadata;
  private lastRestrictedNoticeGuid: string | null = null;

  private readerFormatPortal: { close: (flushSave: boolean) => void } | null =
    null;
  private readerFormatSaveTimeout: number | null = null;

  private get articleSaver(): ArticleSaver {
    return this.articleSaverProvider();
  }

  private get settings(): RssDashboardSettings {
    return this.settingsProvider();
  }

  public setReturnLeaf(leaf: WorkspaceLeaf | null): void {
    this.returnLeaf = leaf;
  }

  public focusReaderView(): void {
    this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
    window.requestAnimationFrame(() => {
      this.containerEl.focus({ preventScroll: true });
    });
  }

  private getDashboardLeaf(): WorkspaceLeaf | null {
    const dashboardLeaves = this.app.workspace.getLeavesOfType(
      RSS_DASHBOARD_VIEW_TYPE,
    );
    return this.returnLeaf && dashboardLeaves.includes(this.returnLeaf)
      ? this.returnLeaf
      : (dashboardLeaves[0] ?? null);
  }

  private async focusDashboardLeaf(): Promise<void> {
    const targetLeaf = this.getDashboardLeaf();
    if (targetLeaf) {
      await this.app.workspace.revealLeaf(targetLeaf);
      this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });

      const dashboardContainer = (
        targetLeaf.view as { containerEl?: HTMLElement } | undefined
      )?.containerEl;
      if (dashboardContainer) {
        window.requestAnimationFrame(() => {
          dashboardContainer.focus({ preventScroll: true });
        });
      }
    }
  }

  private async navigateBackToDashboard(): Promise<void> {
    await this.focusDashboardLeaf();
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
    settings: RssDashboardSettings | (() => RssDashboardSettings),
    articleSaver: ArticleSaver | (() => ArticleSaver),
    onArticleSave: (item: FeedItem) => void,
    onArticleUpdate: (
      item: FeedItem,
      updates: Partial<FeedItem>,
      shouldRerender?: boolean,
    ) => void | Promise<void>,
    options?: {
      saveSettings?: () => Promise<void>;
      onPlaybackProgress?: (
        item: FeedItem,
        position: number,
        duration: number,
        flush?: boolean,
      ) => void;
    },
  ) {
    super(leaf);
    this.settingsProvider =
      typeof settings === "function" ? settings : () => settings;
    this.articleSaverProvider =
      typeof articleSaver === "function" ? articleSaver : () => articleSaver;
    this.onArticleSave = onArticleSave;
    this.persistSettings = options?.saveSettings ?? (() => Promise.resolve());
    this.onArticleUpdate = onArticleUpdate;
    this.onPlaybackProgress = options?.onPlaybackProgress;
    addMathTurndownRule(this.turndownService);

    this.scope = new Scope(this.app.scope);
    this.setupScope();

    this.webViewerIntegration = WebViewerIntegration.createIfAvailable(
      this.app,
      () => this.settings.articleSaving,
      () => this.settings.useFirstSeenDateFallback,
      openWebViewerSaveModal(this.app),
    );
  }

  private setupScope() {
    if (this.scope) {
      setupReaderHotkeys(this.scope, this);
    }
  }

  /**
   * Action: Zoom/Increase reader font size.
   * @internal
   */
  public actionZoomIn(): void {
    const steps = [80, 90, 100, 110, 120, 130, 150, 175, 200];
    const format = this.getReaderFormat();
    const currentIndex = steps.indexOf(format.fontScalePct);
    const nextIndex = Math.min(
      steps.length - 1,
      (currentIndex >= 0 ? currentIndex : 2) + 1,
    );
    format.fontScalePct = steps[nextIndex] ?? 100;
    this.applyReaderFormat();
    void this.flushReaderFormatSave();
  }

  /**
   * Action: Zoom/Decrease reader font size.
   * @internal
   */
  public actionZoomOut(): void {
    const steps = [80, 90, 100, 110, 120, 130, 150, 175, 200];
    const format = this.getReaderFormat();
    const currentIndex = steps.indexOf(format.fontScalePct);
    const nextIndex = Math.max(0, (currentIndex >= 0 ? currentIndex : 2) - 1);
    format.fontScalePct = steps[nextIndex] ?? 100;
    this.applyReaderFormat();
    void this.flushReaderFormatSave();
  }

  /**
   * Action: Reset reader font size.
   * @internal
   */
  public actionZoomReset(): void {
    const format = this.getReaderFormat();
    format.fontScalePct = 100;
    this.applyReaderFormat();
    void this.flushReaderFormatSave();
  }

  private getReaderScrollContainer(): HTMLElement | null {
    return this.readingContainer ?? null;
  }

  private getReaderLineScrollAmount(): number {
    const container = this.getReaderScrollContainer();
    if (!container) {
      return 40;
    }

    const computedStyle = activeWindow.getComputedStyle(container);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight);
    if (Number.isFinite(lineHeight)) {
      return Math.max(24, Math.round(lineHeight * 2));
    }

    const fontSize = Number.parseFloat(computedStyle.fontSize);
    if (Number.isFinite(fontSize)) {
      return Math.max(24, Math.round(fontSize * 2.5));
    }

    return 40;
  }

  private getReaderPageScrollAmount(): number {
    const container = this.getReaderScrollContainer();
    if (!container) {
      return 0;
    }

    return Math.max(0, Math.round(container.clientHeight * 0.9));
  }

  private scrollReaderBy(top: number, left = 0): void {
    const container = this.getReaderScrollContainer();
    if (!container) {
      return;
    }

    container.scrollBy({
      top,
      left,
      behavior: "auto",
    });
  }

  private scrollReaderTo(top: number): void {
    const container = this.getReaderScrollContainer();
    if (!container) {
      return;
    }

    container.scrollTo({
      top,
      behavior: "auto",
    });
  }

  /**
   * Action: Scroll reader up by a small line-style increment.
   * @internal
   */
  public actionScrollUp(): void {
    this.scrollReaderBy(-this.getReaderLineScrollAmount());
  }

  /**
   * Action: Scroll reader down by a small line-style increment.
   * @internal
   */
  public actionScrollDown(): void {
    this.scrollReaderBy(this.getReaderLineScrollAmount());
  }

  /**
   * Action: Scroll reader left by a small increment.
   * @internal
   */
  public actionScrollLeft(): void {
    this.scrollReaderBy(0, -this.getReaderLineScrollAmount());
  }

  /**
   * Action: Scroll reader right by a small increment.
   * @internal
   */
  public actionScrollRight(): void {
    this.scrollReaderBy(0, this.getReaderLineScrollAmount());
  }

  /**
   * Action: Scroll reader up by nearly one page.
   * @internal
   */
  public actionPageUp(): void {
    this.scrollReaderBy(-this.getReaderPageScrollAmount());
  }

  /**
   * Action: Scroll reader down by nearly one page.
   * @internal
   */
  public actionPageDown(): void {
    this.scrollReaderBy(this.getReaderPageScrollAmount());
  }

  /**
   * Action: Jump to the top of the current article.
   * @internal
   */
  public actionScrollToStart(): void {
    this.scrollReaderTo(0);
  }

  /**
   * Action: Jump to the bottom of the current article.
   * @internal
   */
  public actionScrollToEnd(): void {
    const container = this.getReaderScrollContainer();
    if (!container) {
      return;
    }

    this.scrollReaderTo(container.scrollHeight);
  }

  private getDashboardView(): RssDashboardView | null {
    const leaf = this.getDashboardLeaf();
    if (leaf && leaf.view instanceof RssDashboardView) {
      return leaf.view;
    }
    return null;
  }

  private getSavedArticleOpenLocation(): ViewLocation {
    const location = this.settings.savedArticleOpenLocation;
    if (
      location === "left-sidebar" ||
      location === "right-sidebar" ||
      location === "inline"
    ) {
      return location;
    }
    return "main";
  }

  private getConfiguredSavedArticleLeaf(
    location: ViewLocation,
  ): WorkspaceLeaf | null {
    switch (location) {
      case "left-sidebar":
        return this.app.workspace.getLeftLeaf(false);
      case "right-sidebar":
        return this.app.workspace.getRightLeaf(false);
      case "inline":
        return null;
      default:
        return this.app.workspace.getLeaf("split");
    }
  }

  private async openSavedArticleInConfiguredLocation(
    file: TFile,
    article: FeedItem,
  ): Promise<void> {
    const dashboardView = this.getDashboardView();
    if (dashboardView) {
      await dashboardView.openSavedArticleFile(file, article);
      return;
    }

    const location = this.getSavedArticleOpenLocation();
    const targetLocation = location === "inline" ? "main" : location;
    const leaf = this.getConfiguredSavedArticleLeaf(targetLocation);
    if (!leaf) {
      new Notice("No workspace leaf available for saved article");
      return;
    }

    await leaf.openFile(file);
    await this.app.workspace.revealLeaf(leaf);
  }

  private async openSavedArticle(article: FeedItem): Promise<void> {
    try {
      const file = await this.articleSaver.findSavedArticleFile(article);
      if (file) {
        await this.openSavedArticleInConfiguredLocation(file, article);
        return;
      }

      const tags = (article.tags ?? []).filter(
        (tag) => tag.name.toLowerCase() !== "saved",
      );
      await this.onArticleUpdate(
        article,
        { saved: false, savedFilePath: undefined, tags },
        false,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Error opening saved article: ${message}`);
    }
  }

  /**
   * Action: Navigate to next article from reader.
   * @internal
   */
  public actionNavigateNext(): void {
    const dashboardView = this.getDashboardView();
    if (dashboardView) {
      dashboardView.actionNavigateNext({ open: true });
    }
  }

  /**
   * Action: Navigate to previous article from reader.
   * @internal
   */
  public actionNavigatePrevious(): void {
    const dashboardView = this.getDashboardView();
    if (dashboardView) {
      dashboardView.actionNavigatePrevious({ open: true });
    }
  }

  /**
   * Action: Refocus the dashboard leaf while keeping the reader open.
   * @internal
   */
  public actionFocusDashboard(): void {
    void this.focusDashboardLeaf();
  }

  public actionFocusSidebar(): void {
    const dashboardView = this.getDashboardView();
    if (dashboardView) {
      dashboardView.actionFocusSidebar();
      return;
    }

    new Notice("No dashboard pane is currently open.");
  }

  public actionFocusReader(): void {
    if (!this.leaf) {
      new Notice("No reader pane is currently open.");
      return;
    }

    this.focusReaderView();
  }

  /**
   * Action: Close the article and go back to dashboard.
   * @internal
   */
  public actionToggleArticleOpen(): void {
    void this.navigateBackToDashboard();
  }

  /**
   * Action: Toggle read/unread status of the current article.
   * @internal
   */
  public actionToggleReadStatus(): void {
    if (this.currentItem) {
      this.toggleReadStatus();
    }
  }

  /**
   * Action: Mark read/unread and open next article.
   * @internal
   */
  public actionMarkReadAndNext(): void {
    this.actionToggleReadStatus();
    this.actionNavigateNext();
  }

  /**
   * Action: Toggle star status of the current article.
   * @internal
   */
  public actionToggleStarStatus(): void {
    if (this.currentItem) {
      this.toggleStarStatus();
    }
  }

  /**
   * Action: Toggle tags dropdown menu.
   * @internal
   */
  public actionToggleTagsMenu(): void {
    const tagsButton = this.contentEl.querySelector<HTMLElement>(
      ".rss-dashboard-tags-toggle",
    );
    if (tagsButton) {
      this.toggleTagsDropdown(tagsButton);
    }
  }

  /**
   * Action: Save current article.
   * @internal
   */
  public async actionSaveCurrentArticle(): Promise<void> {
    if (!this.currentItem) {
      return;
    }
    if (this.currentItem.saved) {
      await this.openSavedArticle(this.currentItem);
      return;
    }

    const displayTitle = this.currentDisplayTitle;
    const saveItem = displayTitle
      ? { ...this.currentItem, title: displayTitle }
      : this.currentItem;
    const savedTemplate = this.getCustomTemplateForArticle(this.currentItem);
    const file = await this.saveReaderArticle(
      saveItem,
      undefined,
      undefined,
      savedTemplate,
    );
    if (file) {
      this.currentItem.saved = true;
      this.currentItem.savedFilePath = file.path;
      this.onArticleSave(this.currentItem);

      this.updateSavedLabel(true);
    }
  }

  private buildReaderSaveMarkdown(item: FeedItem): string {
    const htmlToSave =
      this.currentFullContent && this.currentContentIsFullArticle
        ? stripNavigationChromeFromHtml(
            stripTopHeadlineFromHtml(this.currentFullContent),
          )
        : this.currentFullContent || item.description || "";
    const htmlWithHero = this.prependFallbackHeroForSavedMarkdown(
      item,
      htmlToSave,
    );
    const normalizedSaveHtml =
      this.normalizeBlockLinksForSavedMarkdown(htmlWithHero);
    return this.turndownService.turndown(
      protectMathForMarkdown(normalizedSaveHtml),
    );
  }

  private saveReaderArticle(
    item: FeedItem,
    folder?: string,
    template?: string,
    savedTemplate?: SavedTemplate,
  ): Promise<TFile | null> {
    const fetchAttempted =
      this.currentFullContentFetchAttempted || this.currentContentIsFullArticle;
    const readerContent = fetchAttempted
      ? {
          fetchAttempted: true,
          markdown: this.currentContentIsFullArticle
            ? this.buildReaderSaveMarkdown(item)
            : undefined,
          fetchedHtml: this.currentFetchedArticleContent,
        }
      : undefined;
    return this.articleSaver.saveArticleWithContentPolicy(
      item,
      folder,
      template,
      savedTemplate,
      readerContent,
    );
  }

  private prependFallbackHeroForSavedMarkdown(
    item: FeedItem,
    html: string,
  ): string {
    if (!html) return html;

    const feedIconUrl = item.feedUrl
      ? this.settings.feeds.find((f) => f.url === item.feedUrl)?.iconUrl || ""
      : "";
    const normalize = (u: string) => normalizeSubstackImageUrl(u.trim());
    const normalizedFeedIcon = feedIconUrl ? normalize(feedIconUrl) : "";

    const fallbackCandidates = [
      item.coverImage || "",
      item.image || "",
      item.itunes?.image?.href || "",
      item.enclosure?.type?.startsWith("image/")
        ? (item.enclosure.url ?? "")
        : "",
    ];

    const fallbackHeroUrl = firstNonFormulaImageUrl(
      fallbackCandidates
        .map((candidate) => normalize(candidate))
        .filter((candidate) => candidate !== normalizedFeedIcon),
    );

    if (!fallbackHeroUrl) return html;

    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const heroAlreadyIncluded = Array.from(doc.querySelectorAll("img")).some(
        (img) =>
          isLikelySameImageSource(
            normalizeSubstackImageUrl(img.getAttribute("src") || ""),
            fallbackHeroUrl,
          ),
      );

      if (heroAlreadyIncluded) {
        return html;
      }
    } catch {
      // Best-effort check only; continue and inject hero if parsing fails.
    }

    return `<p><img src="${fallbackHeroUrl}" alt="Hero image" /></p>${html}`;
  }

  private normalizeBlockLinksForSavedMarkdown(html: string): string {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      doc.querySelectorAll("a").forEach((link) => {
        const href = normalizeSubstackImageUrl(link.getAttribute("href") || "");
        const hasInlineImage = !!link.querySelector("img, picture img");
        const hasBlockContent = !!link.querySelector(
          "address, article, aside, blockquote, br, dd, div, dl, dt, figcaption, figure, footer, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, ul",
        );
        if (!hasBlockContent && !hasInlineImage) return;

        link.querySelectorAll("br").forEach((br) => {
          br.replaceWith(doc.createTextNode(" "));
        });

        const label = (link.textContent || "").replace(/\s+/g, " ").trim();
        if (label) {
          link.textContent = label;
          return;
        }

        if (hasInlineImage) {
          const fragment = doc.win.createFragment();
          while (link.firstChild) {
            fragment.appendChild(link.firstChild);
          }

          if (href) {
            link.setAttribute("href", href);
          }

          link.replaceWith(fragment);
        }
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  }

  /**
   * Action: Mark all filtered articles as read on the dashboard.
   * @internal
   */
  public actionMarkAllAsRead(): void {
    const dashboardView = this.getDashboardView();
    if (dashboardView) {
      dashboardView.actionMarkAllAsRead();
    }
  }

  /**
   * Action: Open keyboard shortcuts help modal.
   * @internal
   */
  public actionOpenShortcutHelp(): void {
    new ShortcutHelpModal(this.app, this.settings).open();
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

    // Make the view container focusable so keyboard events are routed through
    // Obsidian's scope system when this view is active.
    this.containerEl.tabIndex = -1;
    this.registerDomEvent(this.containerEl, "click", (evt) => {
      // Only grab focus back to the container if the click was not on an
      // interactive element (input, button, select, textarea, link, etc.).
      const target = evt.target as HTMLElement;
      const interactive = target.closest(
        'input, button, select, textarea, a, [tabindex]:not([tabindex="-1"])',
      );
      if (!interactive) {
        this.containerEl.focus({ preventScroll: true });
      }
    });
    if (typeof this.app.workspace.on === "function") {
      this.registerEvent(
        this.app.workspace.on("active-leaf-change", (leaf) => {
          if (leaf === this.leaf) {
            this.containerEl.focus({ preventScroll: true });
          }
        }),
      );
    }

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
      attr: { "aria-label": "Save article" },
    });

    setIcon(this.saveButton, "save");
    this.saveButton.addEventListener("click", (e) => {
      if (this.currentItem && this.currentItem.saved) {
        void this.openSavedArticle(this.currentItem);
        return;
      }
      if (this.currentItem) {
        this.showSaveOptions(e, this.currentItem);
      }
    });

    // Read toggle button
    this.readToggleButton = actions.createDiv({
      cls: "rss-reader-action-button rss-reader-read-toggle",
      attr: { "aria-label": "Mark as read/unread" },
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
      attr: {
        role: "button",
        tabindex: "0",
        "aria-label": "Star/unstar article",
        "aria-pressed": "false",
      },
    });
    setIcon(this.starToggleButton, "star-off");
    this.starToggleButton.addEventListener("click", () => {
      if (this.currentItem) {
        this.toggleStarStatus();
      }
    });
    this.starToggleButton.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.starToggleButton?.click();
      }
    });

    // Tags button (same portal menu as dashboard cards)
    const tagsDropdown = actions.createDiv({
      cls: "rss-dashboard-tags-dropdown",
    });
    const tagsButton = tagsDropdown.createDiv({
      cls: "rss-dashboard-tags-toggle clickable-icon rss-reader-action-button",
      attr: {
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
      attr: {
        "aria-label": "Reader settings",
        role: "button",
        tabindex: "0",
      },
    });
    setIcon(readerFormatButton, "type");
    readerFormatButton.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleReaderFormatDropdown(readerFormatButton);
    });
    readerFormatButton.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        this.toggleReaderFormatDropdown(readerFormatButton);
      }
    });

    // Open in browser button
    const browserButton = actions.createDiv({
      cls: "rss-reader-action-button",
      attr: { "aria-label": "Open in browser" },
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
              if (dom) setTooltip(dom, destination.url);
            }

            if (destination.id === "apple_podcasts") {
              menuItem.onClick(() => {
                void (async () => {
                  if (!feedMatch?.url || !feedMatch.title) {
                    new Notice("Could not find this show in apple podcasts.");
                    return;
                  }
                  const appleUrl = await resolveApplePodcastsShowUrl(
                    feedMatch.url,
                    feedMatch.title,
                  );
                  if (!appleUrl) {
                    new Notice("Could not find this show in apple podcasts.");
                    return;
                  }
                  activeWindow.open(appleUrl, "_blank");
                })();
              });
              return;
            }

            const url = destination.url;
            if (url) {
              menuItem.onClick(() => activeWindow.open(url, "_blank"));
            } else {
              menuItem.setDisabled(true);
            }
          });
        }

        menu.showAtMouseEvent(e);
        return;
      }

      const url = resolveItemExternalUrl(item);
      if (!url) return;
      activeWindow.open(url, "_blank");
    });

    this.readingContainer = this.contentEl.createDiv({
      cls: "rss-reader-content",
    });
    this.register(
      trackReaderMathSelection(this.containerEl, () => this.readingContainer),
    );
    this.registerDomEvent(this.containerEl, "copy", (event) => {
      const result = handleReaderMathCopy(event, this.readingContainer);
      if (result === "failed") {
        new Notice(
          "Could not copy formula source; copied rendered selection instead.",
        );
      }
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

    const inlineVideo =
      this.readingContainer?.querySelector<HTMLVideoElement>(
        ".rss-reader-video",
      );
    if (
      this.settings.media.rememberPlaybackProgress &&
      inlineVideo &&
      this.currentItem &&
      this.onPlaybackProgress
    ) {
      const duration = Number.isFinite(inlineVideo.duration)
        ? inlineVideo.duration
        : 0;
      if (inlineVideo.currentTime >= 0 && duration > 0) {
        this.onPlaybackProgress(
          this.currentItem,
          inlineVideo.currentTime,
          duration,
          true,
        );
      }
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

  private getCustomTemplateForArticle(
    item: FeedItem,
  ): SavedTemplate | undefined {
    const articleSaving: ArticleSavingSettings = this.settings.articleSaving;
    return resolveSavedTemplateForArticle(
      item,
      this.settings.feeds,
      articleSaving.savedTemplates ?? [],
      articleSaving.globalDefaultTemplateId,
    );
  }

  private showSaveOptions(event: MouseEvent, item: FeedItem): void {
    const menu = new Menu();
    const displayTitle = this.currentDisplayTitle;

    menu.addItem((menuItem: MenuItem) => {
      menuItem
        .setTitle("Save with default settings")
        .setIcon("save")
        .onClick(async () => {
          const saveItem = displayTitle
            ? { ...item, title: displayTitle }
            : item;
          const savedTemplate = this.getCustomTemplateForArticle(item);
          const file = await this.saveReaderArticle(
            saveItem,
            undefined,
            undefined,
            savedTemplate,
          );
          if (file) {
            item.saved = true;
            item.savedFilePath = file.path;
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
    new CustomSaveModal(
      this.app,
      item,
      this.getCustomSaveModalContext(),
    ).open();
  }

  private getCustomSaveModalContext(): CustomSaveModalContext {
    return {
      getSettings: () => this.settings,
      getArticleSaver: () => this.articleSaver,
      displayTitle: this.currentDisplayTitle,
      getSavedTemplateForArticle: (article) =>
        this.getCustomTemplateForArticle(article),
      saveSettings: () => this.persistSettings(),
      saveArticle: (article, request) => {
        const displayTitle = this.currentDisplayTitle;
        const saveItem = displayTitle
          ? { ...article, title: displayTitle }
          : article;
        return this.saveReaderArticle(
          saveItem,
          request.folder,
          request.template,
          request.savedTemplate,
        );
      },
      onArticleSave: (article) => this.onArticleSave(article),
      updateSavedLabel: (saved) => this.updateSavedLabel(saved),
    };
  }

  async displayItem(
    item: FeedItem,
    relatedItems: FeedItem[] = [],
  ): Promise<void> {
    if (this.currentItem?.guid !== item.guid) {
      this.lastRestrictedNoticeGuid = null;
    }

    this.closeTagsDropdown();
    if (this.readingContainer) {
      this.readingContainer.empty();
    }
    this.currentItem = item;
    this.relatedItems = relatedItems;
    this.currentDisplayTitle = undefined;
    this.currentReaderTitle = undefined;
    this.currentContentIsFullArticle = false;
    this.currentFetchedArticleContent = undefined;
    this.currentFullContentFetchAttempted = false;
    this.currentFullContentFailureType = "none";
    this.syncReaderTitle();

    // Update toggle button states
    this.updateToggleButtons();

    const route = resolveReaderMediaRoute(item);
    if (route === "video") {
      await this.displayVideo(item);
    } else if (route === "video-podcast") {
      await this.displayVideoPodcast(item);
    } else if (route === "podcast") {
      await this.displayPodcast(item);
    } else {
      const skipFullArticleFetch = this.shouldSkipFullArticleFetch(item);
      this.currentFullContentFetchAttempted = !skipFullArticleFetch;
      const fetchedContent = skipFullArticleFetch
        ? ""
        : await this.fetchFullArticleContent(item.link);
      this.currentFetchedArticleContent = fetchedContent.trim()
        ? fetchedContent
        : undefined;
      const hasFullArticleContent = hasMeaningfulArticleContent(fetchedContent);

      if (hasFullArticleContent) {
        item.restrictedReason = undefined;
        this.persistFetchedMetadata(item, fetchedContent);
      } else if (this.lastFullArticleFetchWasRestricted()) {
        item.restrictedReason = RESTRICTED_ARTICLE_REASON;
        // Toast notification removed for paywalled/restricted articles.
      }

      const displayTitle = hasFullArticleContent
        ? extractDisplayTitleFromHtml(fetchedContent)
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
      this.videoPlayer = new VideoPlayer(
        container,
        (selectedVideo) => {
          void this.displayItem(selectedVideo, this.relatedItems);
        },
        this.onPlaybackProgress,
        this.settings.media.rememberPlaybackProgress,
        this.settings.useFirstSeenDateFallback,
      );
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
      this.currentReaderTitle = undefined;
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
        this.onPlaybackProgress,
        this.settings.media.rememberPlaybackProgress,
        this.settings.media.defaultPlaySpeed ?? 1,
        this.settings.useFirstSeenDateFallback,
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
          this.onPlaybackProgress,
          this.settings.media.rememberPlaybackProgress,
          this.settings.media.defaultPlaySpeed ?? 1,
          this.settings.useFirstSeenDateFallback,
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

    const shouldBypassWebViewer = this.shouldBypassWebViewerForFeedContent(
      item,
      fullContent,
    );
    const shouldUseWebViewer =
      Boolean(this.settings.useWebViewer) &&
      Boolean(this.webViewerIntegration) &&
      !shouldBypassWebViewer;

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
    const feedHtml = (
      fullContent ||
      item.content ||
      item.description ||
      ""
    ).trim();
    if (!feedHtml) {
      return false;
    }

    return this.prefersFeedContent(item, feedHtml);
  }

  private shouldSkipFullArticleFetch(item: FeedItem): boolean {
    if (this.isStarredImportCachedPreview(item)) {
      return true;
    }

    if (this.isVideoMediaItem(item)) {
      return true;
    }

    return this.prefersFeedContent(item);
  }

  /**
   * True for a starred.json-imported article (234-09) that has never had a
   * full-content fetch attempted, or whose last attempt failed. The reader's
   * automatic fetch-on-open is skipped in both cases — a fetch only happens
   * when the user clicks "Fetch now" on the cached-preview banner. Articles
   * that never came from a starred import (no `starredImportContentState`
   * at all) always return false here, so their automatic fetch-on-open is
   * completely unaffected.
   */
  private isStarredImportCachedPreview(item: FeedItem): boolean {
    return (
      item.starredImportContentState === "unfetched" ||
      item.starredImportContentState === "failed"
    );
  }

  private isVideoMediaItem(item: FeedItem): boolean {
    return isLikelyVideoItem(item);
  }

  private prefersFeedContent(item: FeedItem, feedHtml?: string): boolean {
    if (item.link) {
      try {
        const host = new URL(item.link).hostname.toLowerCase();
        if (this.isFeedContentPreferredHost(host)) {
          return true;
        }
      } catch {
        // Fall through to markup-based detection.
      }
    }

    const html = (feedHtml || item.content || item.description || "").trim();
    return this.hasSubstackRichFeedMarkup(html);
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

  private hasSubstackRichFeedMarkup(html: string): boolean {
    if (!html) return false;

    const lower = html.toLowerCase();
    return (
      lower.includes('data-component-name="image2todom"') ||
      lower.includes('class="image-link image2 is-viewable-img"') ||
      lower.includes("substackcdn.com/image/fetch/")
    );
  }

  private renderArticle(item: FeedItem, fullContent?: string): void {
    const headerContainer = this.readingContainer.createDiv({
      cls: "rss-reader-article-header",
    });

    const displayTitle =
      this.currentReaderTitle || this.currentDisplayTitle || item.title;
    const articleTitleEl = headerContainer.createEl("h1", {
      cls: "rss-reader-item-title",
    });
    articleTitleEl.style.fontFamily = this.resolveReaderFontFamily(
      this.getReaderFormat().fontFamily,
    );
    if (
      this.settings.highlights?.enabled &&
      this.settings.highlights.highlightInTitles
    ) {
      const highlightService = new HighlightService(this.settings.highlights);
      highlightService.setHighlightedText(articleTitleEl, displayTitle);
    } else {
      articleTitleEl.setText(displayTitle);
    }
    void scheduleProcessMathElements(articleTitleEl, {
      app: this.app,
      component: this,
    });

    const metaContainer = headerContainer.createDiv({
      cls: "rss-reader-meta",
    });

    metaContainer.createDiv({
      cls: "rss-reader-feed-title",
      text: item.feedTitle,
    });

    metaContainer.createDiv({
      cls: "rss-reader-pub-date",
      text: formatReaderDateText(item, this.settings.useFirstSeenDateFallback),
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

    const {
      descriptionHtml,
      descriptionLabel,
      mainHtml,
      hasMeaningfulDescription,
      hasDistinctMainContent,
      contentToRender,
    } = selectArticleSections(item, fullContent);
    const fallbackHeroUrl = resolveFallbackHeroUrl(item, this.settings.feeds);

    if (hasDistinctMainContent && hasMeaningfulDescription) {
      const descriptionCallout = this.readingContainer.createEl("details", {
        cls: "rss-reader-description-callout",
      });
      descriptionCallout.open = true;
      descriptionCallout.createEl("summary", { text: descriptionLabel });
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
        undefined,
      );
    }

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
        descriptionToStripFromBody(hasDistinctMainContent, descriptionHtml),
      );
    }

    if (item.restrictedReason) {
      this.renderRestrictedBanner(item);
    } else if (this.shouldRenderVideoSourceBanner(item)) {
      this.renderVideoSourceBanner(item);
    } else if (this.isStarredImportCachedPreview(item)) {
      this.renderStarredImportBanner(item);
    }
  }

  /**
   * Cached-preview banner (234-09) for a starred.json-imported article whose
   * full content has never been fetched, or whose last fetch attempt
   * failed. Offers a "Fetch now" action alongside the reader's existing
   * "Open in Browser" affordance, since the header's browser button is easy
   * to miss when the reader opened straight to an export-only preview.
   */
  private renderStarredImportBanner(item: FeedItem): void {
    const banner = this.readingContainer.createDiv({
      cls: "rss-reader-inline-banner rss-reader-starred-import-banner",
    });

    const message = banner.createDiv({
      cls: "rss-reader-starred-import-banner-text",
    });
    const baseText =
      item.starredImportContentState === "failed"
        ? STARRED_IMPORT_FAILED_BANNER_TEXT
        : STARRED_IMPORT_UNFETCHED_BANNER_TEXT;
    const importedAtText =
      typeof item.starredImportedAt === "number"
        ? new Date(item.starredImportedAt).toLocaleString()
        : null;
    message.setText(
      importedAtText ? `${baseText} (${importedAtText}).` : `${baseText}.`,
    );

    const actions = banner.createDiv({
      cls: "rss-reader-starred-import-banner-actions",
    });

    const fetchNowButton = actions.createEl("button", {
      cls: "rss-reader-starred-import-fetch-now",
      text: STARRED_IMPORT_FETCH_NOW_TEXT,
    });
    fetchNowButton.addEventListener("click", () => {
      void this.handleStarredImportFetchNow(item);
    });

    if (item.link) {
      const openLink = actions.createEl("a", {
        cls: "rss-reader-starred-import-open-link",
        text: STARRED_IMPORT_OPEN_IN_BROWSER_TEXT,
        href: item.link,
      });
      openLink.target = "_blank";
      openLink.rel = "noopener noreferrer";
    }
  }

  /**
   * Handles the starred-import banner's "Fetch now" action (234-09). Reuses
   * the same `fetchFullArticleContentWithOutcome` pipeline the reader's
   * automatic fetch-on-open and the import-time opt-in fetch (234-06) both
   * use. A successful fetch replaces the article's content, clears its
   * content-state so the banner won't reappear, and persists that change via
   * the normal `onArticleUpdate` settings-save path — but only when the
   * article is starred or saved, per spec, rather than for every article the
   * reader ever opens. A failed fetch moves the article to the "failed"
   * state so the banner's wording can distinguish it from "never attempted"
   * the next time this article is opened.
   */
  private async handleStarredImportFetchNow(item: FeedItem): Promise<void> {
    const proxyUrl =
      this.settings.corsProxyEnabled && this.settings.corsProxyUrl
        ? this.settings.corsProxyUrl
        : undefined;

    const result = item.link
      ? await fetchFullArticleContentWithOutcome(item.link, proxyUrl)
      : { content: "", failureType: "none" as const };

    const shouldPersist = Boolean(item.starred || item.saved);

    if (result.content) {
      item.content = result.content;
      item.starredImportContentState = undefined;
      if (shouldPersist) {
        void this.onArticleUpdate(
          item,
          { content: result.content, starredImportContentState: undefined },
          false,
        );
      }
    } else {
      item.starredImportContentState = "failed";
      if (shouldPersist) {
        void this.onArticleUpdate(
          item,
          { starredImportContentState: "failed" },
          false,
        );
      }
      new Notice(STARRED_IMPORT_FETCH_FAILED_NOTICE);
    }

    if (this.currentItem?.guid !== item.guid) {
      return;
    }

    this.currentFullContentFetchAttempted = true;
    this.currentFetchedArticleContent = result.content.trim()
      ? result.content
      : undefined;
    this.currentFullContent =
      result.content || item.content || item.description || "";
    this.currentContentIsFullArticle = Boolean(result.content);
    if (result.content) {
      this.currentDisplayTitle =
        extractDisplayTitleFromHtml(result.content) || undefined;
    }
    this.syncReaderTitle();

    if (this.readingContainer) {
      this.readingContainer.empty();
    }
    await this.displayArticle(item, this.currentFullContent);
  }

  private renderRestrictedBanner(item: FeedItem): void {
    const banner = this.readingContainer.createDiv({
      cls: "rss-reader-inline-banner rss-reader-paywall-banner",
    });
    const message = banner.createDiv({
      cls: "rss-reader-paywall-banner-text",
    });
    message.setText(
      item.restrictedReason === RESTRICTED_ARTICLE_REASON
        ? RESTRICTED_ARTICLE_BANNER
        : (item.restrictedReason ?? RESTRICTED_ARTICLE_BANNER),
    );

    if (!item.link) {
      return;
    }

    const link = banner.createEl("a", {
      cls: "rss-reader-paywall-banner-link",
      text: RESTRICTED_ARTICLE_LINK_TEXT,
      href: item.link,
    });
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }

  private shouldRenderVideoSourceBanner(item: FeedItem): boolean {
    return isLikelyVideoItem(item) && !item.videoId && !item.videoUrl;
  }

  private renderVideoSourceBanner(item: FeedItem): void {
    const banner = this.readingContainer.createDiv({
      cls: "rss-reader-inline-banner rss-reader-video-banner",
    });
    const message = banner.createDiv({
      cls: "rss-reader-video-banner-text",
      text: VIDEO_ARTICLE_BANNER,
    });
    message.setAttr("role", "note");

    if (!item.link) {
      return;
    }

    const link = banner.createEl("a", {
      cls: "rss-reader-video-banner-link",
      text: VIDEO_ARTICLE_LINK_TEXT,
      href: item.link,
    });
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }

  private populateArticleHtml(
    container: HTMLElement,
    rawHtml: string,
    baseUrl: string,
    fallbackHeroUrl?: string,
    title?: string,
    heroSlot?: HTMLElement,
    stripTopHeadline = false,
    feedDescriptionHtml?: string,
  ): void {
    if (!rawHtml) return;

    let html = rawHtml;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      resolveRelativeUrlsInDocument(doc, baseUrl);

      normalizeSubstackImageUrlsInDocument(doc);

      doc.body
        .querySelectorAll(
          ".image-link-expand, button.restack-image, button.view-image",
        )
        .forEach((el) => el.remove());

      // Clean up fetched full-article HTML before hero extraction so we don't pick
      // navigation icons / breadcrumbs as the hero image.
      if (stripTopHeadline) {
        stripNavigationChromeFromDocument(doc);
        stripTopHeadlineFromDocument(doc);
        stripDuplicateLeadContentFromDocument(doc, feedDescriptionHtml);
        stripSkipLinksFromDocument(doc);
        if (fallbackHeroUrl) {
          stripLeadMediaBeforeContent(doc);
          stripDuplicateLeadMediaMatchingHero(doc, fallbackHeroUrl);
          stripDuplicateLeadCaptionBlocks(doc);
        }
        // Strip inline SVGs from fetched articles — these are publisher UI
        // decorations (section icons, share buttons) never present in RSS payloads.
        doc.body.querySelectorAll("svg").forEach((el) => el.remove());
      }

      // Attempt to extract and place hero image
      if (heroSlot) {
        placeHeroImage(doc, heroSlot, fallbackHeroUrl, title, (img) => {
          this.setupReaderImageTooltip(img, title);
          this.setupLightboxForImage(img);
        });
      }

      stripEmbeddedTooltipAttributes(doc);

      html = doc.body.innerHTML;
    } catch {
      // Fall back to raw HTML if parsing fails
    }

    if (
      this.settings.highlights?.enabled &&
      this.settings.highlights.highlightInContent
    ) {
      const highlightService = new HighlightService(this.settings.highlights);
      sanitizeAndAppendHtml(container, html, { mode: "rich" });
      highlightService.highlightElement(container);
    } else {
      sanitizeAndAppendHtml(container, html, { mode: "rich" });
    }

    // Add classes to images for styling
    container.querySelectorAll("img").forEach((img) => {
      img.addClass("rss-reader-responsive-img");
      this.setupReaderImageTooltip(img, title);
      this.setupLightboxForImage(img);
      img.addEventListener("error", () => {
        this.recoverFailedSubstackImageElement(img);
      });
    });

    void scheduleProcessMathElements(container, {
      app: this.app,
      component: this,
    });
  }

  private setupLightboxForImage(img: HTMLImageElement): void {
    if (!isLightboxEligibleImage(img)) return;

    img.addClass("rss-reader-zoomable-img");
    img.setAttribute("role", "button");
    img.setAttribute("tabindex", "0");
    img.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      img.click();
    });
    img.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const source = resolveFullResolutionImageSource(img);
      const lightbox = new ReaderLightbox({
        source,
        doc: this.containerEl.ownerDocument,
      });
      lightbox.open();
    });
  }

  private setupReaderImageTooltip(
    img: HTMLImageElement,
    articleTitle: string | undefined,
  ): void {
    const filename = getReaderImageFilename(img);
    const altText = img.getAttribute("alt");
    const tooltipText = buildReaderImageTooltipText(
      altText,
      articleTitle,
      filename,
    );
    const opensLightbox = isLightboxEligibleImage(img);

    if (tooltipText) {
      setTooltip(img, tooltipText);
      if (opensLightbox) {
        const tooltipTarget = img.closest("picture") ?? img;
        const parent = tooltipTarget.parentElement;
        if (parent) {
          const tooltipHost = parent.createSpan({
            cls: "rss-reader-image-tooltip-host",
          });
          parent.insertBefore(tooltipHost, tooltipTarget);
          tooltipHost.appendChild(tooltipTarget);
          tooltipHost.createSpan({
            cls: "rss-reader-image-focus-tooltip",
            text: tooltipText,
            attr: { "aria-hidden": "true" },
          });
        }
      }
    }

    const makeAccessibleText = (text: string): string => {
      let id = "";
      do {
        id = `rss-reader-image-text-${++this.imageAccessibleTextIndex}`;
      } while (this.readingContainer.ownerDocument.getElementById(id));
      const label = this.readingContainer.createSpan({
        attr: { id, hidden: "" },
      });
      label.setText(text);
      return id;
    };

    if (altText === "" && !opensLightbox) {
      img.setAttribute("aria-hidden", "true");
    } else if (altText === "" && opensLightbox) {
      img.setAttribute(
        "aria-labelledby",
        makeAccessibleText("Open image in lightbox"),
      );
    } else if (altText?.trim()) {
      img.setAttribute("aria-labelledby", makeAccessibleText(altText));
      if (
        filename &&
        filename.toLocaleLowerCase() !== altText.trim().toLocaleLowerCase()
      ) {
        img.setAttribute("aria-describedby", makeAccessibleText(filename));
      }
    } else if (filename) {
      img.setAttribute("aria-labelledby", makeAccessibleText(filename));
    } else if (opensLightbox) {
      img.setAttribute("aria-label", "Open image in lightbox");
    }
  }

  private recoverFailedSubstackImageElement(img: HTMLImageElement): boolean {
    if (img.dataset.rssSubstackRecoverAttempted === "true") {
      return false;
    }

    const rawSrc = img.getAttribute("src") || "";
    const currentSrc = img.currentSrc || "";
    const normalizedCurrentSrc = normalizeSubstackImageUrl(currentSrc);
    const normalizedRawSrc = normalizeSubstackImageUrl(rawSrc);
    if (
      !currentSrc ||
      ((!normalizedCurrentSrc || normalizedCurrentSrc === currentSrc) &&
        (!normalizedRawSrc || normalizedRawSrc === currentSrc))
    ) {
      return false;
    }

    img.dataset.rssSubstackRecoverAttempted = "true";

    const picture = img.closest("picture");
    if (picture) {
      picture.querySelectorAll("source").forEach((source) => source.remove());
    }

    const replacement = img.cloneNode(true) as HTMLImageElement;
    replacement.dataset.rssSubstackRecoverAttempted = "true";
    replacement.removeAttribute("srcset");
    replacement.removeAttribute("sizes");
    const recoverySrc =
      normalizedCurrentSrc && normalizedCurrentSrc !== currentSrc
        ? normalizedCurrentSrc
        : normalizedRawSrc;
    replacement.setAttribute("src", recoverySrc);
    img.replaceWith(replacement);
    return true;
  }

  private async fetchFullArticleContent(url: string): Promise<string> {
    if (!url) {
      this.currentFullContentFailureType = "none";
      return "";
    }

    const proxyUrl =
      this.settings.corsProxyEnabled && this.settings.corsProxyUrl
        ? this.settings.corsProxyUrl
        : undefined;
    const result = await fetchFullArticleContentWithOutcome(url, proxyUrl);
    this.currentFullContentFailureType = result.failureType;
    this.currentPageMetadata = result.pageMetadata;
    return result.content;
  }

  /** Writes the fetched page's resolved metadata once (#247 slice 4). */
  private persistFetchedMetadata(item: FeedItem, articleHtml: string): void {
    const update = applyArticleMetadata(
      item,
      this.currentPageMetadata,
      articleHtml,
      undefined,
      feedLanguageFor(this.settings.feeds, item),
    );
    if (update) void this.onArticleUpdate(item, update, false);
  }

  private showRestrictedNotice(item: FeedItem): void {
    if (this.lastRestrictedNoticeGuid === item.guid) {
      return;
    }

    new Notice(RESTRICTED_ARTICLE_NOTICE);
    this.lastRestrictedNoticeGuid = item.guid;
  }

  private lastFullArticleFetchWasRestricted(): boolean {
    return this.currentFullContentFailureType === "restricted";
  }

  private toggleReadStatus(): void {
    if (!this.currentItem) return;
    const nextRead = !this.currentItem.read;
    void this.onArticleUpdate(this.currentItem, { read: nextRead }, false);
    this.updateToggleButtons();
  }

  public applyExternalUpdate(
    articleGuid: string,
    updates: Partial<FeedItem>,
    feedUrl?: string,
  ): void {
    if (
      !this.currentItem ||
      this.currentItem.guid !== articleGuid ||
      (feedUrl !== undefined && this.currentItem.feedUrl !== feedUrl)
    ) {
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

  public refreshTagColors(): void {
    if (!this.currentItem) {
      return;
    }

    this.currentItem.tags = this.syncTagColorsWithSettings(
      this.currentItem.tags,
    );
    this.refreshReaderHeaderTags();

    if (this.podcastPlayer && this.currentItem.mediaType === "podcast") {
      this.podcastPlayer.refreshTags();
      this.podcastPlayer.refreshPlaylistTags(this.currentItem.guid);
    }
  }

  private toggleStarStatus(): void {
    if (!this.currentItem) return;
    const nextStarred = !this.currentItem.starred;
    void this.onArticleUpdate(this.currentItem, { starred: nextStarred });
    this.updateToggleButtons();
  }

  private updateSavedLabel(saved: boolean): void {
    if (!this.currentItem) return;
    void this.onArticleUpdate(this.currentItem, { saved });

    if (this.saveButton) {
      this.saveButton.toggleClass("saved", saved);
      setTooltip(
        this.saveButton,
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
      app: this.app,
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
        const plugin = this.getRssDashboardPluginForSettingsSave();
        if (plugin?.refreshOpenTagColorViews) {
          void plugin.refreshOpenTagColorViews();
        } else {
          this.refreshTagColors();
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
      TagsPlugin | undefined;

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

  private syncTagColorsWithSettings(tags: FeedItem["tags"]): Tag[] {
    return (tags ?? []).map((tag) => {
      const matchingTag = this.settings.availableTags.find(
        (availableTag) => availableTag.name === tag.name,
      );

      if (!matchingTag || matchingTag.color === tag.color) {
        return tag;
      }

      return {
        ...tag,
        color: matchingTag.color,
      };
    });
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

  private applyReaderHeadlineFont(fontFamily: string): void {
    const headlineElements =
      this.readingContainer?.querySelectorAll<HTMLElement>(
        ".rss-reader-item-title",
      ) ?? [];

    headlineElements.forEach((headline) => {
      headline.style.fontFamily = fontFamily;
    });
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
    const resolvedFontFamily = this.resolveReaderFontFamily(format.fontFamily);

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
      "--rss-reader-font-family": resolvedFontFamily,
    });

    this.applyReaderHeadlineFont(resolvedFontFamily);
    this.contentEl.dataset.rssReaderAlign = format.textAlign;
    this.contentEl.dataset.rssReaderFont = format.fontFamily;
    this.contentEl.dataset.rssReaderParagraph = format.paragraphSpacing;
  }

  private toggleReaderFormatDropdown(anchor: HTMLElement): void {
    if (this.readerFormatPortal) {
      this.readerFormatPortal.close(true);
      this.readerFormatPortal = null;
      return;
    }

    const format = this.getReaderFormat();
    const portal = createReaderFormatPortal({
      anchor: anchor,
      format,
      defaults: DEFAULT_SETTINGS.readerFormat,
      applyFormat: () => this.applyReaderFormat(),
      scheduleSave: () => this.scheduleReaderFormatSave(),
      flushSave: () => this.flushReaderFormatSave(),
      openReaderDisplaySettings: () => {
        void this.openRssDashboardDisplaySettings();
      },
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
    refreshOpenTagColorViews?: () => Promise<void>;
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
        | {
            saveSettings?: unknown;
            refreshOpenTagColorViews?: unknown;
          }
        | undefined;
      if (plugin && typeof plugin.saveSettings === "function") {
        return plugin as {
          saveSettings: () => Promise<void>;
          refreshOpenTagColorViews?: () => Promise<void>;
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  private async openRssDashboardDisplaySettings(): Promise<void> {
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

    type SettingsPlugin = {
      openSettingsToTab?: (
        tabName: string,
        sectionName?: string,
      ) => Promise<void> | void;
    };
    const plugins = appWithPlugins.plugins;
    const pluginByGetter =
      typeof plugins?.getPlugin === "function"
        ? (plugins.getPlugin("rss-dashboard") as SettingsPlugin | null)
        : null;
    const pluginByRegistry = plugins?.plugins?.["rss-dashboard"] as
      SettingsPlugin | undefined;

    const plugin = pluginByGetter || pluginByRegistry;
    if (typeof plugin?.openSettingsToTab === "function") {
      await plugin.openSettingsToTab("Display", "Reader");
      return;
    }

    appWithPlugins.setting?.open?.();
    appWithPlugins.setting?.openTabById?.("rss-dashboard");
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
    void this.onArticleUpdate(item, { tags: [...item.tags] }, false);

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
      setTooltip(
        this.readToggleButton,
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
      this.starToggleButton.setAttribute(
        "aria-pressed",
        String(this.currentItem.starred),
      );
      setTooltip(
        this.starToggleButton,
        this.currentItem.starred ? "Remove from starred" : "Add to starred",
      );
    }

    // Update save button state
    if (this.saveButton) {
      const isSaved = Boolean(this.currentItem.saved);
      this.saveButton.toggleClass("saved", isSaved);
      setTooltip(
        this.saveButton,
        isSaved ? "Click to open saved article" : "Save article",
      );
    }
  }

  private resetTitle(): void {
    this.syncReaderTitle();
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

      const progressEnabled = this.settings.media.rememberPlaybackProgress;

      const reportProgress = (flush = false) => {
        if (!progressEnabled) return;
        if (!this.onPlaybackProgress) return;
        const position = video.currentTime;
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (position < 0 || duration <= 0) return;
        this.onPlaybackProgress(item, position, duration, flush);
      };

      if (
        progressEnabled &&
        item.playbackProgress?.position &&
        item.playbackProgress.position > 0
      ) {
        video.addEventListener("loadedmetadata", () => {
          video.currentTime = item.playbackProgress?.position ?? 0;
        });
      }

      let lastReportedSecond = -1;
      video.addEventListener("timeupdate", () => {
        const wholeSecond = Math.floor(video.currentTime);
        if (
          wholeSecond > 0 &&
          wholeSecond % 5 === 0 &&
          wholeSecond !== lastReportedSecond
        ) {
          lastReportedSecond = wholeSecond;
          reportProgress();
        }
      });
      video.addEventListener("pause", () => reportProgress(true));
      video.addEventListener("ended", () => reportProgress(true));
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
    const videoDisplayDate = resolveDisplayDate(
      item,
      this.settings.useFirstSeenDateFallback,
    );
    metaRow.createDiv({
      text: videoDisplayDate
        ? videoDisplayDate.toLocaleDateString()
        : "Unknown date",
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
        const relatedDisplayDate = resolveDisplayDate(
          video,
          this.settings.useFirstSeenDateFallback,
        );
        videoInfo.createDiv({
          cls: "rss-video-related-date",
          text: relatedDisplayDate
            ? relatedDisplayDate.toLocaleDateString()
            : "Unknown date",
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
