import type {
  ReaderContentVersion,
  ReaderContentVersions,
} from "../components/reader-content-versions";
import {
  runFeedFirstDisplay,
  visitReaderContent,
} from "../components/reader-feed-first";
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
import { refreshReaderHeaderTags } from "../utils/reader-tag-chips";
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
import { enhanceYouTubeEmbeds } from "../utils/youtube-inline-embed";
import { type FullArticleFetchResult } from "../utils/fetch-helpers";
import {
  persistFetchedCoverImage,
  persistFetchedMetadata,
  persistFetchedPageImage,
  renderRestrictedBanner,
  renderVideoSourceBanner,
  shouldRenderVideoSourceBanner,
} from "../utils/reader-article-fetch";
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
import { createIconButton } from "../utils/icon-button";
import { attachRovingToolbar } from "../utils/roving-toolbar";
import { fetchFullArticleContentWithOutcome } from "../utils/full-article-fetch";
import {
  applyFetchOutcome,
  type FullContentFetchFailure,
  clearFetchFailure,
  hasActiveFetchFailure,
  renderFetchFailureBanner,
} from "../utils/full-article-fetch-failure";
import { isLikelyVideoItem } from "../utils/video-detection";
import {
  buildReaderImageTooltipText,
  formatReaderDateText,
  getReaderImageFilename,
  isFeedIconUrl,
  placeHeroImage,
  resolveFallbackHeroUrl,
  resolveFetchedHeroUrl,
  resolveReaderMediaRoute,
  resolveRelativeUrlsInDocument,
  descriptionToStripFromBody,
  feedDescriptionToStripFromBody,
  selectArticleSections,
  stripEmbeddedTooltipAttributes,
} from "../utils/reader-article-render";
import {
  collectLeadCaptionTexts,
  cleanFetchedArticleHtml,
  extractDisplayTitleFromHtml,
  flattenSingleRootWrapper,
  hasMeaningfulArticleContent,
  isLikelySameImageSource,
  stripDuplicateLeadCaptionBlocks,
  stripDuplicateLeadContentFromDocument,
  stripDuplicateLeadMediaMatchingHero,
  stripLeadMediaBeforeContent,
  stripNavigationChromeFromDocument,
  stripSkipLinksFromDocument,
  stripTopHeadlineFromDocument,
} from "../utils/reader-html-cleanup";
import { stripAdContainersFromHtml } from "../utils/ad-containers";
import TurndownService from "turndown";
import { WebViewerIntegration } from "../services/web-viewer-integration";
import { MediaService } from "../services/media-service";
import { createTagsDropdownPortal } from "../utils/tags-dropdown-portal";
import { resolveItemExternalUrl } from "../utils/item-url-utils";
import { resolveSavedTemplateForArticle } from "../utils/saved-template-utils";
import {
  resolveSaveVersion,
  SAVED_ARTICLE_TOOLTIP,
  saveVersionTooltip,
} from "../utils/save-version";
import { resolvePodcastOpenDestinations } from "../utils/podcast-open-destinations";
import { resolveApplePodcastsShowUrl } from "../services/apple-podcasts-service";
import { createReaderFormatPortal } from "../utils/reader-format-portal";
import {
  normalizeSubstackImageUrl,
  normalizeSubstackImageUrlsInDocument,
  recoverFailedSubstackImageElement,
} from "../utils/substack-image-url";
import {
  firstNonFormulaImageUrl,
  promoteLazyImageSources,
} from "../utils/image-url-utils";
import { getOpenableHttpHref } from "../utils/url-utils";
import { applyReaderImageLoading } from "../utils/reader-image-loading";
import { markNamedLandmark } from "../utils/landmarks";
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
import {
  addYouTubeEmbedTurndownRule,
  protectYouTubeEmbedsForMarkdown,
} from "../utils/youtube-embed";
import { addTableTurndownRule } from "../utils/table-markdown";

const STARRED_IMPORT_UNFETCHED_BANNER_TEXT =
  "This is a cached preview from the starred.json import";
const STARRED_IMPORT_FAILED_BANNER_TEXT =
  "The last attempt to fetch article content failed. Showing the cached preview from the starred.json import";
const STARRED_IMPORT_FETCH_NOW_TEXT = "Fetch now";
const STARRED_IMPORT_OPEN_IN_BROWSER_TEXT = "Open in browser";
const STARRED_IMPORT_FETCH_FAILED_NOTICE = "Could not fetch article content.";

export const RSS_READER_VIEW_TYPE = "rss-reader-view";

export class ReaderView extends ItemView {
  private currentItem: FeedItem | null = null;
  private openInBrowserButton: HTMLElement | null = null;
  private readingContainer!: HTMLElement;
  private titleElement!: HTMLElement;
  private articleSaverProvider: () => ArticleSaver;
  private settingsProvider: () => RssDashboardSettings;
  private onArticleSave: (item: FeedItem) => void;
  private persistSettings: () => Promise<void>;
  private readonly onPodcastPlaySpeedChange = (speed: number): void => {
    // Remember the speed the user picked in the player so later players, and
    // the Settings → Media control, start from it (#1269).
    this.settings.media.defaultPlaySpeed = speed;
    void this.persistSettings().catch(() => {
      // Keep the in-session speed even when the settings write fails.
    });
  };
  private onArticleUpdate: (
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void | boolean | Promise<void | boolean>;
  private webViewerIntegration: WebViewerIntegration | null = null;
  private podcastPlayer: PodcastPlayer | null = null;
  private videoPlayer: VideoPlayer | null = null;
  private relatedItems: FeedItem[] = [];
  private currentFullContent?: string;
  private displayIdentity = {};
  private contentVersions?: ReaderContentVersions;
  private currentArticleFetch?: Promise<void>;
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
  private headerEl: HTMLElement | null = null;
  private tagsToggleButton: HTMLElement | null = null;
  private saveButton: HTMLElement | null = null;
  private returnLeaf: WorkspaceLeaf | null = null;
  private tagsDropdownCleanup: (() => void) | null = null;

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
    ) => void | boolean | Promise<void | boolean>,
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
    addTableTurndownRule(this.turndownService);
    addYouTubeEmbedTurndownRule(this.turndownService);

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
   * Action: Mark read (never unread) and open next article.
   * @internal
   */
  public actionMarkReadAndNext(): void {
    if (this.currentItem && !this.currentItem.read) {
      this.toggleReadStatus();
    }
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
   * Action: Open the current article's original page in the browser. A podcast
   * opens its destination menu, anchored to the toolbar button without an event.
   * @internal
   */
  public actionOpenOriginal(event?: MouseEvent): void {
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

      if (event) {
        menu.showAtMouseEvent(event);
      } else {
        const rect = this.openInBrowserButton?.getBoundingClientRect();
        menu.showAtPosition({ x: rect?.left ?? 0, y: rect?.bottom ?? 0 });
      }
      return;
    }

    const url = resolveItemExternalUrl(item);
    if (!url) return;
    activeWindow.open(url, "_blank");
  }

  /**
   * Action: Toggle tags dropdown menu.
   * @internal
   */
  public actionToggleTagsMenu(): void {
    if (this.tagsToggleButton) {
      this.toggleTagsDropdown(this.tagsToggleButton);
    }
  }

  /**
   * Action: Save current article.
   * @internal
   */
  public async actionSaveCurrentArticle(): Promise<void> {
    const item = this.currentItem;
    if (!item) {
      return;
    }
    if (item.saved) {
      await this.openSavedArticle(item);
      return;
    }

    const displayTitle = this.currentDisplayTitle;
    const saveItem = displayTitle ? { ...item, title: displayTitle } : item;
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

      if (
        this.currentItem?.feedUrl === item.feedUrl &&
        this.currentItem?.guid === item.guid
      ) {
        this.updateSavedLabel(true);
      }
    }
  }

  private buildReaderSaveMarkdown(item: FeedItem): string {
    const htmlToSave =
      this.currentFullContent && this.currentContentIsFullArticle
        ? cleanFetchedArticleHtml(this.currentFullContent, {
            // The note body follows the body the reader shows: same cleanup,
            // same description and hero inputs (#1323).
            feedDescriptionHtml: feedDescriptionToStripFromBody(
              item,
              this.currentFullContent,
            ),
            fallbackHeroUrl: resolveFetchedHeroUrl(item, this.settings.feeds),
          })
        : this.currentFullContent || item.description || "";
    // Same ad stripping the saver applies on its own paths (#1195).
    const htmlWithHero = this.prependFallbackHeroForSavedMarkdown(
      item,
      stripAdContainersFromHtml(htmlToSave),
    );
    const normalizedSaveHtml =
      this.normalizeBlockLinksForSavedMarkdown(htmlWithHero);
    return this.turndownService.turndown(
      protectMathForMarkdown(
        protectYouTubeEmbedsForMarkdown(normalizedSaveHtml),
      ),
    );
  }

  private async saveReaderArticle(
    item: FeedItem,
    folder?: string,
    template?: string,
    savedTemplate?: SavedTemplate,
  ): Promise<TFile | null> {
    const identity = this.displayIdentity;
    if (
      resolveSaveVersion(this.settings.articleSaving, savedTemplate) ===
      "fetched"
    )
      await this.currentArticleFetch;
    if (identity !== this.displayIdentity) {
      return this.articleSaver.saveArticleWithContentPolicy(
        item,
        folder,
        template,
        savedTemplate,
      );
    }
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

    const fallbackCandidates = [
      item.pageImage || "",
      item.coverImage || "",
      item.image || "",
      item.itunes?.image?.href || "",
      item.enclosure?.type?.startsWith("image/")
        ? (item.enclosure.url ?? "")
        : "",
    ];

    // Avoid using the feed icon (logo) as the article hero image.
    const fallbackHeroUrl = firstNonFormulaImageUrl(
      fallbackCandidates
        .map((candidate) => normalizeSubstackImageUrl(candidate.trim()))
        .filter(
          (candidate) =>
            candidate && !isFeedIconUrl(candidate, item, this.settings.feeds),
        ),
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
          if (hasInlineImage) {
            // Keep the image as the anchor's content and move the caption just
            // after it, so a link that wraps an image and a caption converts to
            // `[![alt](src)](href) Caption` instead of dropping the image
            // (#1200).
            const images = Array.from(link.querySelectorAll("img"));
            link.textContent = "";
            images.forEach((image) => link.appendChild(image));

            if (href) {
              link.setAttribute("href", href);
            }

            link.after(doc.createTextNode(` ${label}`));
            return;
          }

          link.textContent = label;
          return;
        }

        if (hasInlineImage && hasBlockContent) {
          // A label-less block link does not survive the Markdown conversion as
          // a link, so unwrap it and keep its contents (the image), as before.
          const fragment = doc.win.createFragment();
          while (link.firstChild) {
            fragment.appendChild(link.firstChild);
          }

          link.replaceWith(fragment);
          return;
        }

        // An image-only link keeps its anchor, so the image stays a link in the
        // saved note (#1194). Only labelled anchors are flattened to text above.
        if (hasInlineImage && href) {
          link.setAttribute("href", href);
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

  /**
   * Action: Toggle YouTube Focus mode from the `Shift+F` keymap binding.
   * @internal
   */
  public actionToggleYouTubeFocusMode(): void {
    void this.getRssDashboardPlugin()?.toggleYouTubeFocusMode?.();
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

    const header = (this.headerEl = this.contentEl.createDiv({
      cls: "rss-reader-header",
    }));

    createIconButton({
      parent: header,
      cls: "rss-reader-back-button",
      label: "Back to dashboard",
      icon: "arrow-left",
      action: "back",
      onClick: () => {
        void this.navigateBackToDashboard();
      },
    });

    this.titleElement = header.createDiv({
      cls: "rss-reader-title",
      text: "RSS reader",
    });

    this.currentItem = null;

    this.renderToolbar(header);

    this.readingContainer = this.contentEl.createDiv({
      cls: "rss-reader-content",
    });
    // A region named by the article title, not a second `main`: the Reader
    // opens beside the dashboard, which already has one (#826).
    markNamedLandmark(this.readingContainer, "region", this.titleElement);
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

  /**
   * Builds the Reader toolbar from native icon buttons and makes it one Tab
   * stop with arrow-key navigation (roving tabindex). Every button keeps its
   * aria-label and behavior; keyboard activation comes from the native button.
   */
  private renderToolbar(header: HTMLElement): void {
    const region = "reader-toolbar";
    const actions = header.createDiv({
      cls: "rss-reader-actions",
      attr: { role: "toolbar", "aria-label": "Reader actions" },
    });

    this.saveButton = createIconButton({
      parent: actions,
      cls: "rss-reader-action-button",
      label: "Save article",
      icon: "save",
      action: "save",
      region,
      onClick: (e) => {
        if (this.currentItem && this.currentItem.saved) {
          void this.openSavedArticle(this.currentItem);
          return;
        }
        if (this.currentItem) {
          this.showSaveOptions(e, this.currentItem);
        }
      },
    });

    this.readToggleButton = createIconButton({
      parent: actions,
      cls: "rss-reader-action-button rss-reader-read-toggle",
      label: "Mark as read/unread",
      icon: "circle",
      action: "read",
      region,
      onClick: () => {
        if (this.currentItem) {
          this.toggleReadStatus();
        }
      },
    });

    this.starToggleButton = createIconButton({
      parent: actions,
      cls: "rss-reader-action-button rss-reader-star-toggle",
      label: "Star/unstar article",
      icon: "star-off",
      action: "star",
      region,
      pressed: false,
      onClick: () => {
        if (this.currentItem) {
          this.toggleStarStatus();
        }
      },
    });

    // Tags button (same portal menu as dashboard cards)
    const tagsButton = (this.tagsToggleButton = createIconButton({
      parent: actions,
      cls: "rss-reader-action-button",
      label: "Manage tags",
      icon: "tag",
      action: "tags",
      region,
      hasPopup: true,
      expanded: false,
      onClick: (e) => {
        e.stopPropagation();
        if (!this.currentItem) {
          return;
        }
        this.toggleTagsDropdown(tagsButton);
      },
    }));

    const readerFormatButton = createIconButton({
      parent: actions,
      cls: "rss-reader-action-button rss-reader-format-button",
      label: "Reader settings",
      icon: "type",
      action: "format",
      region,
      hasPopup: true,
      expanded: false,
      onClick: (e) => {
        e.stopPropagation();
        this.toggleReaderFormatDropdown(readerFormatButton);
      },
    });

    this.openInBrowserButton = createIconButton({
      parent: actions,
      cls: "rss-reader-action-button",
      label: "Open in browser",
      icon: "external-link",
      action: "open",
      region,
      onClick: (e) => {
        this.actionOpenOriginal(e);
      },
    });

    const roving = attachRovingToolbar(actions);
    this.register(() => roving.destroy());
  }

  async onClose(): Promise<void> {
    this.invalidateDisplay();
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

            if (
              this.currentItem?.feedUrl === item.feedUrl &&
              this.currentItem?.guid === item.guid
            ) {
              this.updateSavedLabel(true);
            }
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
    this.invalidateDisplay();
    const identity = this.displayIdentity;
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
    this.syncReaderTitle();

    // Update toggle button states
    this.updateToggleButtons();

    const route = resolveReaderMediaRoute(item);
    this.syncYouTubeFocusChrome(this.settings.media.youtubeFocusMode);
    if (route === "video") {
      await this.displayVideo(item);
    } else if (route === "video-podcast") {
      await this.displayVideoPodcast(item);
    } else if (route === "podcast") {
      await this.displayPodcast(item);
    } else {
      this.currentArticleFetch = this.displayFeedFirstArticle(item, identity);
      await this.currentArticleFetch;
    }
  }

  private invalidateDisplay(): void {
    this.displayIdentity = {};
    this.contentVersions?.dispose();
    this.contentVersions = undefined;
    this.currentArticleFetch = undefined;
  }

  private async displayFeedFirstArticle(
    item: FeedItem,
    identity: object,
  ): Promise<void> {
    const feedContent = item.content || item.description || "";
    this.currentFullContent = feedContent;
    if (this.shouldSkipFullArticleFetch(item) || !item.link) {
      await this.displayArticle(item, feedContent);
      return;
    }
    this.podcastPlayer?.destroy();
    this.podcastPlayer = null;
    this.videoPlayer?.destroy();
    this.videoPlayer = null;
    const link = item.link;
    let fetchedContent = "";
    const versions = await runFeedFirstDisplay({
      container: this.readingContainer,
      item,
      feedContent,
      renderVersion: (parent, version, content) =>
        this.renderArticle(item, content, parent, version),
      onSelectVersion: (version, fetched) => {
        this.currentContentIsFullArticle = version === "full";
        this.currentFullContent = version === "full" ? fetched : feedContent;
        this.currentDisplayTitle =
          version === "full"
            ? extractDisplayTitleFromHtml(fetched) || undefined
            : undefined;
        this.syncReaderTitle();
      },
      hasMeaningfulContent: hasMeaningfulArticleContent,
      onVersions: (created) => {
        this.contentVersions = created;
      },
      fetch: async () => {
        try {
          return await this.fetchFullArticleContent(link);
        } catch {
          return {
            content: "",
            failureType: "network",
            failureReason: "unexpected",
          };
        }
      },
      persistMetadata: (result) => {
        persistFetchedMetadata(
          item,
          result.content,
          result.pageMetadata,
          this.settings.feeds,
          (update) => this.persistBackgroundUpdate(item, update, false),
        );
        persistFetchedCoverImage(
          item,
          result.pageImage,
          this.settings.feeds,
          (update) => this.persistBackgroundUpdate(item, update, false),
        );
      },
      persistPageImage: (result) => {
        persistFetchedPageImage(
          item,
          result.pageImage,
          this.settings.feeds,
          (update) => this.persistBackgroundUpdate(item, update, false),
        );
      },
      // The failure belongs to the item too: remember it even after
      // navigation so the next open does not stall on the same fetch (#1110).
      rememberOutcome: (result) =>
        this.rememberFetchOutcome(item, result) !== undefined,
      persistRestrictedReason: (reason) =>
        this.persistBackgroundUpdate(item, { restrictedReason: reason }, false),
      isCurrent: () => identity === this.displayIdentity,
      onSettled: (result) => {
        fetchedContent = result.content;
        this.currentFullContentFetchAttempted = true;
        this.currentFetchedArticleContent = fetchedContent.trim()
          ? fetchedContent
          : undefined;
      },
      renderRestrictedBanner: () =>
        renderRestrictedBanner(this.readingContainer, item),
      renderFetchFailureBanner: () => this.renderFetchFailureBanner(item),
    });
    if (!versions) return;
    if (
      this.settings.useWebViewer &&
      this.webViewerIntegration &&
      identity === this.displayIdentity &&
      versions.isActive()
    ) {
      // Opening another pane must not keep the fetched-content cache pending.
      void this.webViewerIntegration
        .openInWebViewer(
          item.link,
          extractDisplayTitleFromHtml(fetchedContent) || item.title,
        )
        .catch(() => {
          // The RSS version and the optional full-article button remain usable.
        });
    }
  }

  private async displayVideo(item: FeedItem): Promise<void> {
    if (this.podcastPlayer) {
      this.podcastPlayer.destroy();
      this.podcastPlayer = null;
    }
    // A related-video click lands here with the old player still live: destroy
    // saves its last position and stops its timers and message listener.
    if (this.videoPlayer) {
      this.videoPlayer.destroy();
      this.videoPlayer = null;
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
        this.settings.media.youtubeFocusMode,
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
      const watchHref = getOpenableHttpHref(item.link);
      if (watchHref) {
        const watchLink = errorContainer.createEl("a", {
          cls: "rss-reader-error-link",
          text: "Watch on YouTube",
          href: watchHref,
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
        this.onPodcastPlaySpeedChange,
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
          this.onPodcastPlaySpeedChange,
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

  setYouTubeFocusMode(hide: boolean): void {
    this.videoPlayer?.setFocusMode(hide);
    this.syncYouTubeFocusChrome(hide);
  }

  /**
   * In Focus mode a YouTube video drops the toolbar and title from the header
   * and keeps only the back button; articles and podcasts keep the full one.
   */
  private syncYouTubeFocusChrome(focusMode: boolean): void {
    const isVideo =
      this.currentItem !== null &&
      resolveReaderMediaRoute(this.currentItem) === "video";
    this.headerEl?.toggleClass("rss-youtube-focus", focusMode && isVideo);
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
    version: ReaderContentVersion = "rss",
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
      const identity = this.displayIdentity;
      try {
        const success = await this.webViewerIntegration.openInWebViewer(
          item.link,
          this.currentDisplayTitle || item.title,
        );
        if (identity !== this.displayIdentity) return;
        if (!success) {
          this.renderArticle(item, fullContent, this.readingContainer, version);
        }
      } catch {
        if (identity !== this.displayIdentity) return;
        this.renderArticle(item, fullContent, this.readingContainer, version);
      }

      return;
    }

    this.renderArticle(item, fullContent, this.readingContainer, version);
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

    // A fetch that failed earlier waits for an explicit "Try again" (#1110).
    if (hasActiveFetchFailure(item)) {
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

  /**
   * Whether the feed's own markup should be preferred over a page fetch. This
   * looks at the feed content only: the hard-coded host allowlist (Aeon, Kagi,
   * Substack) was disabled because it silently suppressed the fetch for hosts
   * whose feed ships a teaser, leaving no way to reach the article (#1287). A
   * user-facing replacement list is proposed in #1288.
   */
  private prefersFeedContent(item: FeedItem, feedHtml?: string): boolean {
    const html = (feedHtml || item.content || item.description || "").trim();
    return this.hasSubstackRichFeedMarkup(html);
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

  private renderArticle(
    item: FeedItem,
    fullContent?: string,
    container = this.readingContainer,
    version: ReaderContentVersion = "rss",
  ): void {
    const headerContainer = container.createDiv({
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

    const heroSlot = container.createDiv({
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
    const fallbackHeroUrl =
      version === "full"
        ? resolveFetchedHeroUrl(item, this.settings.feeds)
        : resolveFallbackHeroUrl(item, this.settings.feeds);

    if (hasDistinctMainContent && hasMeaningfulDescription) {
      const descriptionCallout = container.createEl("details", {
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
      const contentContainer = container.createDiv({
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
      renderRestrictedBanner(container, item);
    } else if (shouldRenderVideoSourceBanner(item)) {
      renderVideoSourceBanner(container, item);
    } else if (this.isStarredImportCachedPreview(item)) {
      this.renderStarredImportBanner(item, container);
    }
    // Independent of the banners above: the fetch is skipped while a failure
    // is remembered, so Try again must stay reachable (#1110).
    if (hasActiveFetchFailure(item)) {
      this.renderFetchFailureBanner(item, container);
    }
  }

  /** Records or clears the item's remembered fetch failure (#1110). */
  private rememberFetchOutcome(
    item: FeedItem,
    result: FullArticleFetchResult,
  ): FullContentFetchFailure | undefined {
    return applyFetchOutcome(item, result, (patch) =>
      this.persistBackgroundUpdate(item, patch, false),
    );
  }

  /** Banner for an article whose full-content fetch failed earlier (#1110). */
  private renderFetchFailureBanner(
    item: FeedItem,
    container = this.readingContainer,
  ): void {
    renderFetchFailureBanner(container, item, () => {
      void this.retryFullArticleFetch(item);
    });
  }

  /** "Try again": forget the failure, then fetch the article again (#1110). */
  private async retryFullArticleFetch(item: FeedItem): Promise<void> {
    // Compare feed and guid: two feeds can carry the same guid.
    const current = this.currentItem;
    if (current?.guid !== item.guid || current.feedUrl !== item.feedUrl) return;
    clearFetchFailure(item, (patch) =>
      this.persistBackgroundUpdate(item, patch, false),
    );
    await this.displayItem(item, this.relatedItems);
  }

  /**
   * Cached-preview banner (234-09) for a starred.json-imported article whose
   * full content has never been fetched, or whose last fetch attempt
   * failed. Offers a "Fetch now" action alongside the reader's existing
   * "Open in Browser" affordance, since the header's browser button is easy
   * to miss when the reader opened straight to an export-only preview.
   */
  private renderStarredImportBanner(
    item: FeedItem,
    container = this.readingContainer,
  ): void {
    const banner = container.createDiv({
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

    const openHref = getOpenableHttpHref(item.link);
    if (openHref) {
      const openLink = actions.createEl("a", {
        cls: "rss-reader-starred-import-open-link",
        text: STARRED_IMPORT_OPEN_IN_BROWSER_TEXT,
        href: openHref,
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
    const identity = this.displayIdentity;
    const proxyUrl =
      this.settings.corsProxyEnabled && this.settings.corsProxyUrl
        ? this.settings.corsProxyUrl
        : undefined;

    const result = item.link
      ? await fetchFullArticleContentWithOutcome(
          item.link,
          proxyUrl,
          this.settings.articleSaving.fetchTimeout,
        )
      : { content: "", failureType: "none" as const };

    if (identity !== this.displayIdentity) return;
    const shouldPersist = Boolean(item.starred || item.saved);

    if (result.content) {
      if (item.fullContentFetchFailure) {
        clearFetchFailure(item, (patch) =>
          this.persistBackgroundUpdate(item, patch, false),
        );
      }
      item.content = result.content;
      item.starredImportContentState = undefined;
      // The page's own image (#812), stored with the same gate this path uses
      // for the fetched content: kept in memory for this session, persisted only
      // for a starred or saved article.
      persistFetchedPageImage(
        item,
        result.pageImage,
        this.settings.feeds,
        (update) => {
          if (shouldPersist) {
            this.persistBackgroundUpdate(item, update, false);
          }
        },
      );
      if (shouldPersist) {
        this.persistBackgroundUpdate(
          item,
          { content: result.content, starredImportContentState: undefined },
          false,
        );
      }
    } else {
      item.starredImportContentState = "failed";
      if (shouldPersist) {
        this.persistBackgroundUpdate(
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
    // The reader now shows the fetched content, so the hero comes from the
    // fetched version (#812), not the RSS cover chain.
    await this.displayArticle(
      item,
      this.currentFullContent,
      this.currentContentIsFullArticle ? "full" : "rss",
    );
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

      promoteLazyImageSources(doc);

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
        // Readability wraps the fetched article in one root element; hoist its
        // blocks so the body-child scans below see them directly (#1304).
        flattenSingleRootWrapper(doc);
        stripDuplicateLeadContentFromDocument(doc, feedDescriptionHtml);
        stripSkipLinksFromDocument(doc);
        if (fallbackHeroUrl) {
          const leadCaptionTexts = collectLeadCaptionTexts(doc);
          stripLeadMediaBeforeContent(doc);
          stripDuplicateLeadMediaMatchingHero(doc, fallbackHeroUrl);
          stripDuplicateLeadCaptionBlocks(doc, leadCaptionTexts);
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

    // Only the RSS version and the feed description get the inline player. The
    // fetched full-article body keeps the sanitizer's plain watch link; the
    // fetched version is faithful to its source and #1176 upgrades it there.
    if (!stripTopHeadline) {
      enhanceYouTubeEmbeds(container, { title });
    }

    // Add classes to images for styling
    container.querySelectorAll("img").forEach((img) => {
      img.addClass("rss-reader-responsive-img");
      // Before the error listener below, so a failed image is revealed before
      // Substack recovery clones it.
      applyReaderImageLoading(img);
      this.setupReaderImageTooltip(img, title);
      this.setupLightboxForImage(img);
      img.addEventListener("error", () => {
        recoverFailedSubstackImageElement(img);
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

  private async fetchFullArticleContent(
    url: string,
  ): Promise<FullArticleFetchResult> {
    if (!url) {
      return { content: "", failureType: "none" };
    }

    const proxyUrl =
      this.settings.corsProxyEnabled && this.settings.corsProxyUrl
        ? this.settings.corsProxyUrl
        : undefined;
    const result = await fetchFullArticleContentWithOutcome(
      url,
      proxyUrl,
      this.settings.articleSaving.fetchTimeout,
    );
    return result;
  }

  private toggleReadStatus(): void {
    if (!this.currentItem) return;
    const nextRead = !this.currentItem.read;
    void this.persistUserUpdate(this.currentItem, { read: nextRead }, false);
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

  /**
   * Persists a change the user just made. The plugin rolls the article back in
   * every open view when the save fails; here the user is told, and the toolbar
   * is redrawn from the restored state.
   */
  private async persistUserUpdate(
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
    onFailure?: () => void,
  ): Promise<boolean> {
    let persisted: boolean;
    try {
      // Omit an unset flag so the callback sees the same arguments as before.
      const args: [FeedItem, Partial<FeedItem>, boolean?] =
        shouldRerender === undefined
          ? [item, updates]
          : [item, updates, shouldRerender];
      persisted = (await this.onArticleUpdate(...args)) !== false;
    } catch (error) {
      console.error("Failed to save Reader article update", error);
      persisted = false;
    }
    if (!persisted) {
      onFailure?.();
      this.updateToggleButtons();
      new Notice("Couldn't save your change. It was reverted.");
    }
    return persisted;
  }

  /** Persists a write the user did not initiate; a failure is logged only. */
  private persistBackgroundUpdate(
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ): void {
    void Promise.resolve(
      this.onArticleUpdate(item, updates, shouldRerender),
    ).catch((error: unknown) => {
      console.error("Failed to save Reader article update", error);
    });
  }

  private toggleStarStatus(): void {
    if (!this.currentItem) return;
    const nextStarred = !this.currentItem.starred;
    void this.persistUserUpdate(this.currentItem, { starred: nextStarred });
    this.updateToggleButtons();
  }

  /**
   * The tooltip of the Reader's save control, naming the version this article's
   * save will write (#1184).
   */
  private getSaveTooltip(item: FeedItem): string {
    return saveVersionTooltip(
      resolveSaveVersion(
        this.settings.articleSaving,
        this.getCustomTemplateForArticle(item),
      ),
    );
  }

  private updateSavedLabel(saved: boolean): void {
    if (!this.currentItem) return;

    // The save callback owns association updates and persistence.

    if (this.saveButton) {
      this.saveButton.toggleClass("saved", saved);
      setTooltip(
        this.saveButton,
        saved ? SAVED_ARTICLE_TOOLTIP : this.getSaveTooltip(this.currentItem),
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
        const plugin = this.getRssDashboardPlugin();
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
        const plugin = this.getRssDashboardPlugin();
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

    if (
      this.videoPlayer &&
      resolveReaderMediaRoute(this.currentItem) === "video"
    ) {
      this.videoPlayer.setTags(this.currentItem.tags);
      return;
    }

    visitReaderContent(
      this.contentVersions,
      this.readingContainer,
      (container) => refreshReaderHeaderTags(container, this.currentItem?.tags),
    );
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
    visitReaderContent(
      this.contentVersions,
      this.readingContainer,
      (container) => {
        container
          .querySelectorAll<HTMLElement>(".rss-reader-item-title")
          .forEach((headline) => {
            headline.style.fontFamily = fontFamily;
          });
      },
    );
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
        anchor.setAttribute("aria-expanded", "false");
      },
    });

    this.readerFormatPortal = portal;
    anchor.setAttribute("aria-expanded", "true");
  }

  private scheduleReaderFormatSave(): void {
    if (this.readerFormatSaveTimeout !== null) {
      window.clearTimeout(this.readerFormatSaveTimeout);
    }

    this.readerFormatSaveTimeout = window.setTimeout(() => {
      void this.flushReaderFormatSave();
    }, 300);
  }

  /**
   * The running plugin behind the runtime lookup, so the Reader can reach
   * plugin-level operations (settings save, tag-colour refresh, focus-mode
   * toggle) without importing `main.ts`.
   */
  private getRssDashboardPlugin(): {
    saveSettings: () => Promise<void>;
    refreshOpenTagColorViews?: () => Promise<void>;
    toggleYouTubeFocusMode?: () => void;
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
            toggleYouTubeFocusMode?: unknown;
          }
        | undefined;
      if (plugin && typeof plugin.saveSettings === "function") {
        return plugin as {
          saveSettings: () => Promise<void>;
          refreshOpenTagColorViews?: () => Promise<void>;
          toggleYouTubeFocusMode?: () => void;
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

    const plugin = this.getRssDashboardPlugin();
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
    const previousTags = item.tags ?? [];
    let nextTags: Tag[];
    if (add) {
      nextTags = previousTags.some((t) => t.name === tag.name)
        ? previousTags
        : [...previousTags, { ...tag }];
    } else {
      nextTags = previousTags.filter((t) => t.name !== tag.name);
    }

    // Notify parent to persist the change. The plugin snapshots the article's
    // previous tags before this call returns, so the item is updated after it.
    void this.persistUserUpdate(item, { tags: [...nextTags] }, false, () => {
      item.tags = previousTags;
      if (this.currentItem?.guid === item.guid) {
        this.refreshReaderHeaderTags();
      }
    });
    item.tags = nextTags;

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
      // The name stays "Star/unstar article": aria-pressed carries the state,
      // and setTooltip would overwrite aria-label with state text.
      this.starToggleButton.setAttribute(
        "aria-pressed",
        String(this.currentItem.starred),
      );
    }

    // A podcast opens a destination menu rather than a page.
    if (this.openInBrowserButton) {
      if (this.currentItem.mediaType === "podcast") {
        this.openInBrowserButton.setAttribute("aria-haspopup", "menu");
      } else {
        this.openInBrowserButton.removeAttribute("aria-haspopup");
      }
    }

    // Update save button state
    if (this.saveButton) {
      const isSaved = Boolean(this.currentItem.saved);
      this.saveButton.toggleClass("saved", isSaved);
      setTooltip(
        this.saveButton,
        isSaved ? SAVED_ARTICLE_TOOLTIP : this.getSaveTooltip(this.currentItem),
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
