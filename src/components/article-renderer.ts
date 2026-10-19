import type {
  ReaderContentVersion,
  ReaderContentVersions,
} from "./reader-content-versions";
import { runFeedFirstDisplay } from "./reader-feed-first";
import { App, type Component, TFile } from "obsidian";
import {
  refreshReaderHeaderTags,
  renderReaderTagChips,
} from "../utils/reader-tag-chips";
import { sanitizeAndAppendHtml } from "../utils/safe-html";
import { enhanceYouTubeEmbeds } from "../utils/youtube-inline-embed";
import { scheduleProcessMathElements } from "../utils/math-rendering";
import { FeedItem, RssDashboardSettings, Tag } from "../types/types";
import { HighlightService } from "../services/highlight-service";
import {
  getPubDateMs,
  resolveDisplayDate,
} from "../services/feed-parser/feed-retention";
import { MediaService } from "../services/media-service";
import { type FullArticleFetchResult } from "../utils/fetch-helpers";
import {
  persistFetchedCoverImage,
  persistFetchedMetadata,
  persistFetchedPageImage,
  renderRestrictedBanner,
  renderVideoSourceBanner,
  shouldRenderVideoSourceBanner,
} from "../utils/reader-article-fetch";
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
  normalizeSubstackImageUrl,
  normalizeSubstackImageUrlsInDocument,
  recoverFailedSubstackImageElement,
} from "../utils/substack-image-url";
import { isDuplicateIntro } from "../utils/duplicate-intro-detection";
import {
  descriptionToStripFromBody,
  hasMeaningfulFeedDescription,
  resolveFeedHeroUrl,
  resolveFetchedHeroUrl,
  selectCalloutDescription,
} from "../utils/reader-article-render";
import {
  cleanFetchedArticleDocument,
  extractDisplayTitleFromHtml,
  hasMeaningfulArticleContent,
  isLikelySameImageSource,
  removeLeadImageElement,
} from "../utils/reader-html-cleanup";
import {
  findFirstNonFormulaImage,
  promoteLazyImageSources,
} from "../utils/image-url-utils";
import { getOpenableHttpHref } from "../utils/url-utils";
import { applyReaderImageLoading } from "../utils/reader-image-loading";
import { PodcastPlayer } from "../views/podcast-player";
import { VideoPlayer } from "../views/video-player";

export interface ArticleRendererOptions {
  app: App;
  component: Component;
  settings: RssDashboardSettings;
  /** Returns the live settings object; wins over `settings` when given. */
  getSettings?: () => RssDashboardSettings;
  onArticleSave: (item: FeedItem) => void;
  onArticleUpdate: (
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void;
  onOpenSavedArticle?: (file: TFile) => void;
  onPlaybackProgress?: (
    item: FeedItem,
    position: number,
    duration: number,
    flush?: boolean,
  ) => void;
  /** Persists the settings object after this renderer mutates it. */
  onPersistSettings?: () => Promise<void>;
}

export class ArticleRenderer {
  private app: App;
  private component: Component;
  private initialSettings: RssDashboardSettings;
  private getSettings?: () => RssDashboardSettings;
  private onArticleSave: (item: FeedItem) => void;
  private onArticleUpdate: (
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void;
  private onOpenSavedArticle?: (file: TFile) => void;
  private onPlaybackProgress?: (
    item: FeedItem,
    position: number,
    duration: number,
    flush?: boolean,
  ) => void;
  private onPersistSettings?: () => Promise<void>;
  private readonly onPodcastPlaySpeedChange = (speed: number): void => {
    // Remember the speed the user picked in the inline player so later players
    // start from it, and persist it through the owning view (#1269).
    this.settings.media.defaultPlaySpeed = speed;
    void this.onPersistSettings?.().catch(() => {
      // Keep the in-session speed even when the settings write fails.
    });
  };

  private podcastPlayer: PodcastPlayer | null = null;
  private videoPlayer: VideoPlayer | null = null;
  private currentItem: FeedItem | null = null;
  private relatedItems: FeedItem[] = [];
  private currentFullContent?: string;
  private displayIdentity = {};
  private contentVersions?: ReaderContentVersions;
  private currentDisplayTitle?: string;
  private currentReaderTitle?: string;
  private currentContentIsFullArticle = false;
  private renderRoot: HTMLElement | null = null;

  constructor(options: ArticleRendererOptions) {
    this.app = options.app;
    this.component = options.component;
    this.initialSettings = options.settings;
    this.getSettings = options.getSettings;
    this.onArticleSave = options.onArticleSave;
    this.onArticleUpdate = options.onArticleUpdate;
    this.onOpenSavedArticle = options.onOpenSavedArticle;
    this.onPlaybackProgress = options.onPlaybackProgress;
    this.onPersistSettings = options.onPersistSettings;
  }

  // Plugin imports replace plugin.settings with a new object, so resolve it per read.
  private get settings(): RssDashboardSettings {
    return this.getSettings?.() ?? this.initialSettings;
  }

  public async render(
    container: HTMLElement,
    item: FeedItem,
    relatedItems: FeedItem[] = [],
  ): Promise<void> {
    this.cancelPendingDisplay();
    const identity = this.displayIdentity;
    container.empty();
    this.renderRoot = container;
    this.currentItem = item;
    this.relatedItems = relatedItems;
    this.currentDisplayTitle = undefined;
    this.currentReaderTitle = undefined;
    this.currentContentIsFullArticle = false;

    if (item.mediaType === "video" && !item.videoId && item.link) {
      const vid = MediaService.extractYouTubeVideoId(item.link);
      if (vid) item.videoId = vid;
    }

    if (item.mediaType === "video" && item.videoId) {
      await this.displayVideo(container, item);
    } else if (item.mediaType === "video" && item.videoUrl) {
      await this.displayVideoPodcast(container, item);
    } else if (
      item.mediaType === "podcast" &&
      (item.audioUrl || MediaService.extractPodcastAudio(item.description))
    ) {
      if (!item.audioUrl) {
        const aud = MediaService.extractPodcastAudio(item.description);
        if (aud) item.audioUrl = aud;
      }
      await this.displayPodcast(container, item);
    } else {
      const feedContent = item.content || item.description || "";
      this.currentFullContent = feedContent;
      if (this.shouldSkipFullArticleFetch(item) || !item.link) {
        await this.displayArticle(container, item, feedContent);
        return;
      }
      this.cleanupPlayers();
      await runFeedFirstDisplay({
        container,
        item,
        feedContent,
        renderVersion: (parent, version, content) =>
          this.renderArticle(parent, item, content, version),
        onSelectVersion: (version, fetchedContent) => {
          this.currentContentIsFullArticle = version === "full";
          this.currentFullContent =
            version === "full" ? fetchedContent : feedContent;
          this.currentDisplayTitle =
            version === "full"
              ? extractDisplayTitleFromHtml(fetchedContent) || undefined
              : undefined;
        },
        hasMeaningfulContent: hasMeaningfulArticleContent,
        onVersions: (versions) => {
          this.contentVersions = versions;
        },
        fetch: () => this.fetchFullArticleContent(item.link),
        persistMetadata: (result) => {
          persistFetchedMetadata(
            item,
            result.content,
            result.pageMetadata,
            this.settings.feeds,
            (update) => this.onArticleUpdate(item, update, false),
          );
          persistFetchedCoverImage(
            item,
            result.pageImage,
            this.settings.feeds,
            (update) => this.onArticleUpdate(item, update, false),
          );
        },
        persistPageImage: (result) => {
          persistFetchedPageImage(
            item,
            result.pageImage,
            this.settings.feeds,
            (update) => this.onArticleUpdate(item, update, false),
          );
        },
        // The failure belongs to the item too: remember it even after
        // navigation so the next open does not stall on the same fetch (#1110).
        rememberOutcome: (result) =>
          this.rememberFetchOutcome(item, result) !== undefined,
        persistRestrictedReason: (reason) =>
          this.onArticleUpdate(item, { restrictedReason: reason }, false),
        isCurrent: () => identity === this.displayIdentity,
        renderRestrictedBanner: () => renderRestrictedBanner(container, item),
        renderFetchFailureBanner: () =>
          this.renderFetchFailureBanner(container, item),
      });
    }
  }

  public cancelPendingDisplay(): void {
    this.displayIdentity = {};
    this.contentVersions?.dispose();
    this.contentVersions = undefined;
    // The dashboard calls this on leaving the inline Reader and on closing.
    // destroy() saves the video's last position and stops its timers and
    // message listener, which removing the iframe alone does not (#1236).
    if (this.videoPlayer) {
      this.videoPlayer.destroy();
      this.videoPlayer = null;
    }
  }

  private async displayVideo(
    container: HTMLElement,
    item: FeedItem,
  ): Promise<void> {
    this.cleanupPlayers();
    const videoContainer = container.createDiv({
      cls: "rss-reader-video-container enhanced",
    });
    if (item.videoId) {
      this.videoPlayer = new VideoPlayer(
        videoContainer,
        (selectedVideo) => {
          void this.render(container, selectedVideo, this.relatedItems);
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
      const errorContainer = videoContainer.createDiv({
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
      await this.displayArticle(container, item);
    }
  }

  private async displayVideoPodcast(
    container: HTMLElement,
    item: FeedItem,
  ): Promise<void> {
    // Placeholder for displayVideoPodcast if needed, logic seems missing in original snippet but referenced
    await this.displayArticle(container, item);
  }

  private async displayPodcast(
    container: HTMLElement,
    item: FeedItem,
  ): Promise<void> {
    this.cleanupPlayers();
    const podcastContainer = container.createDiv({
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
      // We might need to bubble this up if the dashboard selection needs to sync
      this.onArticleUpdate(selectedEpisode, { read: true }, false);
    };

    if (item.audioUrl) {
      this.podcastPlayer = new PodcastPlayer(
        podcastContainer,
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
      await this.displayArticle(container, item);
    }
  }

  private async displayArticle(
    container: HTMLElement,
    item: FeedItem,
    fullContent?: string,
  ): Promise<void> {
    this.cleanupPlayers();
    this.renderArticle(container, item, fullContent);
  }

  private renderArticle(
    container: HTMLElement,
    item: FeedItem,
    fullContent?: string,
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

    // Note: font family resolving and highlighting logic here...
    articleTitleEl.setText(displayTitle);
    void scheduleProcessMathElements(articleTitleEl, {
      app: this.app,
      component: this.component,
    });

    const metaContainer = headerContainer.createDiv({
      cls: "rss-reader-meta",
    });
    metaContainer.createDiv({
      cls: "rss-reader-feed-title",
      text: item.feedTitle,
    });
    const useFirstSeenDateFallback = this.settings.useFirstSeenDateFallback;
    const displayDate = resolveDisplayDate(item, useFirstSeenDateFallback);
    const isFirstSeenFallback =
      getPubDateMs(item.pubDate) <= 0 && !!displayDate;
    metaContainer.createDiv({
      cls: "rss-reader-pub-date",
      text: displayDate
        ? isFirstSeenFallback
          ? `First seen: ${displayDate.toLocaleString()}`
          : displayDate.toLocaleString()
        : "Unknown date",
    });

    renderReaderTagChips(headerContainer, item.tags);
    const heroSlot = container.createDiv({
      cls: "rss-reader-hero-slot",
    });

    const { html: descriptionHtml, label: descriptionLabel } =
      selectCalloutDescription(item);
    const hasMeaningfulDescription =
      hasMeaningfulFeedDescription(descriptionHtml);
    const mainHtml = (fullContent || item.content || "").trim();
    const fallbackHeroUrl =
      version === "full"
        ? resolveFetchedHeroUrl(item, this.settings.feeds)
        : resolveFeedHeroUrl(item, this.settings.feeds);

    const hasDistinctMainContent =
      mainHtml !== "" &&
      (!hasMeaningfulDescription ||
        !isDuplicateIntro(descriptionHtml, mainHtml));

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

    const contentToRender = hasDistinctMainContent
      ? mainHtml
      : mainHtml || descriptionHtml;

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

    this.renderArticleBanners(container, item);
  }

  private renderArticleBanners(container: HTMLElement, item: FeedItem): void {
    if (item.restrictedReason) {
      renderRestrictedBanner(container, item);
    } else if (shouldRenderVideoSourceBanner(item)) {
      renderVideoSourceBanner(container, item);
    }
    // Independent of the banners above: the fetch is skipped while a failure
    // is remembered, so Try again must stay reachable (#1110).
    if (hasActiveFetchFailure(item)) {
      this.renderFetchFailureBanner(container, item);
    }
  }

  /** Records or clears the item's remembered fetch failure (#1110). */
  private rememberFetchOutcome(
    item: FeedItem,
    result: FullArticleFetchResult,
  ): FullContentFetchFailure | undefined {
    return applyFetchOutcome(item, result, (patch) =>
      this.onArticleUpdate(item, patch, false),
    );
  }

  /** Banner for an article whose full-content fetch failed earlier (#1110). */
  private renderFetchFailureBanner(
    container: HTMLElement,
    item: FeedItem,
  ): void {
    // Captured now so a click on a stale banner cannot re-render another view.
    const root = this.renderRoot;
    renderFetchFailureBanner(container, item, () => {
      if (!root?.isConnected || this.currentItem !== item) return;
      clearFetchFailure(item, (patch) =>
        this.onArticleUpdate(item, patch, false),
      );
      void this.render(root, item, this.relatedItems);
    });
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

      if (baseUrl) {
        const base = new URL(baseUrl);
        doc.querySelectorAll("a").forEach((el) => {
          const href = el.getAttribute("href");
          if (!href) return;
          try {
            el.setAttribute("href", new URL(href, base).toString());
          } catch {
            /* intentionally empty */
          }
        });
        doc.querySelectorAll("img").forEach((el) => {
          const src = el.getAttribute("src");
          if (!src) return;
          try {
            el.setAttribute("src", new URL(src, base).toString());
          } catch {
            /* intentionally empty */
          }
        });
      }

      normalizeSubstackImageUrlsInDocument(doc);

      doc.body
        .querySelectorAll(
          ".image-link-expand, button.restack-image, button.view-image",
        )
        .forEach((el) => el.remove());

      if (stripTopHeadline) {
        // The same cleanup the dedicated Reader and the save path run (#1362).
        cleanFetchedArticleDocument(doc, {
          feedDescriptionHtml,
          fallbackHeroUrl,
        });
      }

      if (heroSlot) {
        const firstImg = findFirstNonFormulaImage(doc.body);
        if (heroSlot.childElementCount === 0) {
          let heroUrl = normalizeSubstackImageUrl(fallbackHeroUrl);
          const firstImgSrc = normalizeSubstackImageUrl(
            firstImg?.getAttribute("src")?.trim() || "",
          );
          if (!heroUrl && firstImgSrc) heroUrl = firstImgSrc;
          if (heroUrl) {
            heroSlot.createEl("img", {
              cls: "rss-reader-fallback-hero",
              attr: { src: heroUrl, alt: title || "Hero image" },
            });
            if (
              firstImg &&
              firstImgSrc &&
              isLikelySameImageSource(firstImgSrc, heroUrl)
            ) {
              removeLeadImageElement(firstImg);
            }
          }
        }
      }

      doc.body
        .querySelectorAll<HTMLElement>(
          "[aria-label], [data-tooltip], [data-tooltip-position], [data-tooltip-delay]",
        )
        .forEach((el) => {
          el.removeAttribute("aria-label");
          el.removeAttribute("data-tooltip");
          el.removeAttribute("data-tooltip-position");
          el.removeAttribute("data-tooltip-delay");
        });

      html = doc.body.innerHTML;
    } catch {
      /* intentionally empty */
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

    if (!stripTopHeadline) {
      enhanceYouTubeEmbeds(container, { title });
    }

    container.querySelectorAll("img").forEach((img) => {
      img.addClass("rss-reader-responsive-img");
      // Before the error listener below, so a failed image is revealed before
      // Substack recovery clones it.
      applyReaderImageLoading(img);
      img.addEventListener("error", () => {
        recoverFailedSubstackImageElement(img);
      });
    });
    void scheduleProcessMathElements(container, {
      app: this.app,
      component: this.component,
    });
  }

  public setYouTubeFocusMode(hide: boolean): void {
    this.videoPlayer?.setFocusMode(hide);
  }

  public setVideoTags(tags: Tag[] | undefined): void {
    this.contentVersions?.visitVersions((container) =>
      refreshReaderHeaderTags(container, tags),
    );
    this.videoPlayer?.setTags(tags);
  }

  public cleanupPlayers(): void {
    if (this.podcastPlayer) {
      this.podcastPlayer.destroy();
      this.podcastPlayer = null;
    }
    if (this.videoPlayer) {
      this.videoPlayer.destroy();
      this.videoPlayer = null;
    }
  }

  // --- Helper methods (extracted from ReaderView) ---

  private async fetchFullArticleContent(
    url?: string,
  ): Promise<FullArticleFetchResult> {
    if (!url) {
      return { content: "", failureType: "none" };
    }

    try {
      const proxyUrl = this.settings.corsProxyEnabled
        ? this.settings.corsProxyUrl
        : undefined;
      const result = await fetchFullArticleContentWithOutcome(
        url,
        proxyUrl,
        this.settings.articleSaving.fetchTimeout,
      );
      return result;
    } catch {
      return {
        content: "",
        failureType: "network",
        failureReason: "unexpected",
      };
    }
  }

  private shouldSkipFullArticleFetch(item: FeedItem): boolean {
    // A fetch that failed earlier waits for an explicit "Try again" (#1110).
    if (hasActiveFetchFailure(item)) return true;
    if (this.isVideoMediaItem(item)) return true;
    return this.prefersFeedContent(item);
  }

  private isVideoMediaItem(item: FeedItem): boolean {
    return isLikelyVideoItem(item);
  }

  /**
   * Whether the feed's own markup should be preferred over a page fetch. This
   * looks at the feed content only: the hard-coded host allowlist was disabled
   * because it silently suppressed the fetch for hosts whose feed ships a
   * teaser, leaving no way to reach the article (#1287). A user-facing
   * replacement list is proposed in #1288.
   */
  private prefersFeedContent(item: FeedItem): boolean {
    const feedHtml = (item.content || item.description || "").trim();
    return this.hasSubstackRichFeedMarkup(feedHtml);
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
}
