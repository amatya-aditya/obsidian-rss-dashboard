import { App, setIcon, TFile } from "obsidian";
import { FeedItem, RssDashboardSettings } from "../types/types";
import { HighlightService } from "../services/highlight-service";
import { MediaService } from "../services/media-service";
import { fetchWithProxyFallback } from "../utils/fetch-helpers";
import { PodcastPlayer } from "../views/podcast-player";
import { VideoPlayer } from "../views/video-player";

export interface ArticleRendererOptions {
  app: App;
  settings: RssDashboardSettings;
  onArticleSave: (item: FeedItem) => void;
  onArticleUpdate: (
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void;
  onOpenSavedArticle?: (file: TFile) => void;
}

export class ArticleRenderer {
  private app: App;
  private settings: RssDashboardSettings;
  private onArticleSave: (item: FeedItem) => void;
  private onArticleUpdate: (
    item: FeedItem,
    updates: Partial<FeedItem>,
    shouldRerender?: boolean,
  ) => void;
  private onOpenSavedArticle?: (file: TFile) => void;

  private podcastPlayer: PodcastPlayer | null = null;
  private videoPlayer: VideoPlayer | null = null;
  private currentItem: FeedItem | null = null;
  private relatedItems: FeedItem[] = [];
  private currentFullContent?: string;
  private currentDisplayTitle?: string;
  private currentReaderTitle?: string;
  private currentContentIsFullArticle = false;

  constructor(options: ArticleRendererOptions) {
    this.app = options.app;
    this.settings = options.settings;
    this.onArticleSave = options.onArticleSave;
    this.onArticleUpdate = options.onArticleUpdate;
    this.onOpenSavedArticle = options.onOpenSavedArticle;
  }

  public async render(
    container: HTMLElement,
    item: FeedItem,
    relatedItems: FeedItem[] = [],
  ): Promise<void> {
    container.empty();
    this.currentItem = item;
    this.relatedItems = relatedItems;
    this.currentDisplayTitle = undefined;
    this.currentReaderTitle = this.isTweetLikeItem(item)
      ? this.formatNitterReaderTitle(item)
      : undefined;
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
      await this.displayArticle(container, item, fullContent);
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
      this.videoPlayer = new VideoPlayer(videoContainer, (selectedVideo) => {
        void this.render(container, selectedVideo, this.relatedItems);
      });
      this.videoPlayer.loadVideo(item);
      if (this.relatedItems.length > 0) {
        this.videoPlayer.setRelatedVideos(this.relatedItems);
      }
    } else {
      const errorContainer = videoContainer.createDiv({
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
      this.currentReaderTitle = this.isTweetLikeItem(selectedEpisode)
        ? this.formatNitterReaderTitle(selectedEpisode)
        : undefined;
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
  ): void {
    const headerContainer = container.createDiv({
      cls: "rss-reader-article-header",
    });

    const isNitter = this.isTweetLikeItem(item);
    const displayTitle =
      this.currentReaderTitle || this.currentDisplayTitle || item.title;
    const articleTitleEl = headerContainer.createEl("h1", {
      cls: "rss-reader-item-title",
    });

    // Note: font family resolving and highlighting logic here...
    articleTitleEl.setText(displayTitle);

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

    const heroSlot = container.createDiv({
      cls: "rss-reader-hero-slot",
    });

    const descriptionHtml = (item.description || "").trim();
    const mainHtml = (fullContent || item.content || "").trim();
    let fallbackHeroUrl =
      (item.coverImage || "").trim() ||
      (item.image || "").trim() ||
      (item.itunes?.image?.href || "").trim() ||
      undefined;

    const hasDistinctMainContent =
      mainHtml !== "" &&
      (!descriptionHtml || !this.isEquivalentHtml(mainHtml, descriptionHtml));

    if (!isNitter && descriptionHtml && hasDistinctMainContent) {
      const descriptionCallout = container.createEl("details", {
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
        undefined,
      );
    }

    const contentToRender = isNitter
      ? this.pickBestNitterTweetHtml(item, fullContent)
      : hasDistinctMainContent
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
        isNitter,
        descriptionHtml,
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
    feedDescriptionHtml?: string,
  ): void {
    if (!rawHtml) return;

    let html = rawHtml;

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

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

      if (stripTopHeadline) {
        this.stripNavigationChromeFromDocument(doc);
        this.stripTopHeadlineFromDocument(doc);
        this.stripDuplicateLeadContentFromDocument(doc, feedDescriptionHtml);
        this.stripSkipLinksFromDocument(doc);
        // Strip inline SVGs from fetched articles — these are publisher UI
        // decorations (section icons, share buttons) never present in RSS payloads.
        doc.body.querySelectorAll("svg").forEach((el) => el.remove());
        if (fallbackHeroUrl) {
          this.stripLeadMediaBeforeContent(doc);
          this.stripDuplicateLeadMediaMatchingHero(doc, fallbackHeroUrl);
          this.stripDuplicateLeadCaptionBlocks(doc);
        }
      }

      if (heroSlot) {
        const firstImg = doc.body.querySelector("img");
        if (heroSlot.childElementCount === 0) {
          let heroUrl = fallbackHeroUrl;
          const firstImgSrc = firstImg?.getAttribute("src")?.trim() || "";
          if (!heroUrl && firstImgSrc) heroUrl = firstImgSrc;
          if (heroUrl) {
            heroSlot.createEl("img", {
              cls: "rss-reader-fallback-hero",
              attr: { src: heroUrl, alt: title || "Hero image" },
            });
            if (firstImg && firstImgSrc && firstImgSrc === heroUrl) {
              this.removeLeadImageElement(firstImg);
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

      if (isNitter) this.transformNitterStatsMarkup(doc);

      html = doc.body.innerHTML;
    } catch {
      /* intentionally empty */
    }

    if (
      this.settings.highlights?.enabled &&
      this.settings.highlights.highlightInContent
    ) {
      const highlightService = new HighlightService(this.settings.highlights);
      // eslint-disable-next-line @microsoft/sdl/no-inner-html
      container.innerHTML = html;
      highlightService.highlightElement(container);
    } else {
      // eslint-disable-next-line @microsoft/sdl/no-inner-html
      container.innerHTML = html;
    }

    container
      .querySelectorAll("img")
      .forEach((img) => img.addClass("rss-reader-responsive-img"));
    if (isNitter) this.hydrateNitterStatsIcons(container);
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

  private async fetchFullArticleContent(url?: string): Promise<string> {
    if (!url) return "";
    try {
      const proxyUrl = this.settings.corsProxyEnabled
        ? this.settings.corsProxyUrl
        : undefined;
      return await fetchWithProxyFallback(url, proxyUrl);
    } catch {
      return "";
    }
  }

  private hasMeaningfulArticleContent(html: string): boolean {
    if (!html) return false;
    const text = html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 200;
  }

  private shouldSkipFullArticleFetch(item: FeedItem): boolean {
    if (this.isTweetLikeItem(item)) return true;
    if (!item.link) return false;
    try {
      const host = new URL(item.link).hostname.toLowerCase();
      return this.isFeedContentPreferredHost(host);
    } catch {
      return false;
    }
  }

  private isFeedContentPreferredHost(host: string): boolean {
    const preferred = [
      "kite.kagi.com",
      "news.kagi.com",
      "aeon.co",
      "substack.com",
    ];
    return (
      preferred.some((p) => host === p || host.endsWith("." + p)) ||
      host.toLowerCase().includes("nitter")
    );
  }

  private isTweetLikeItem(item: FeedItem): boolean {
    return (
      item.link?.toLowerCase().includes("nitter") ||
      MediaService.isXUrl(item.link) ||
      MediaService.isXUrl(item.feedUrl)
    );
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

  private extractNitterNameAndHandle(item: FeedItem): {
    name: string;
    handle: string;
  } {
    const tryExtract = (source: string): { name: string; handle: string } => {
      const handleMatch = source.match(/@[\w.]+/i);
      const handle = handleMatch ? handleMatch[0] : "";
      let name = source;

      if (handle) name = name.replace(handle, "");

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
    const feedParsed = feedTitle
      ? tryExtract(feedTitle)
      : { name: "", handle: "" };

    const urlHandle =
      this.extractHandleFromUrl(item.link) ||
      this.extractHandleFromUrl(item.feedUrl);

    const handle =
      (/^@[\w.]+$/i.test(author) ? author : authorParsed.handle) ||
      feedParsed.handle ||
      urlHandle;
    const name = authorParsed.name || feedParsed.name;

    return { name, handle };
  }

  private extractHandleFromUrl(url: string | undefined): string {
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
      if (
        /^(home|explore|messages|notifications|settings|search|i)$/i.test(
          username,
        )
      ) {
        return "";
      }
      return username.startsWith("@") ? username : `@${username}`;
    } catch {
      return "";
    }
  }

  private isNitterHost(host: string): boolean {
    return host.toLowerCase().includes("nitter");
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
    if (!Number.isFinite(parsed.getTime())) return "";
    return parsed.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private pickBestNitterTweetHtml(
    item: FeedItem,
    fullContent?: string,
  ): string {
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

  private isEquivalentHtml(html1: string, html2: string): boolean {
    return (
      this.normalizeComparableText(html1) ===
      this.normalizeComparableText(html2)
    );
  }

  private normalizeComparableText(html: string): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/\s+/g, " ")
      .toLowerCase()
      .trim();
  }

  private stripDuplicateLeadContentFromDocument(
    doc: Document,
    feedDescriptionHtml?: string,
  ): void {
    const normalizedDescription = this.normalizeComparableText(
      feedDescriptionHtml || "",
    );
    if (!normalizedDescription || !doc.body) return;

    const blocks = Array.from(doc.body.children) as HTMLElement[];
    const firstSubstantialIndex = blocks.findIndex(
      (block) => this.getNormalizedBlockText(block).length >= 120,
    );

    if (firstSubstantialIndex > 0) {
      // Fast path: description appears as a direct child before the first substantial block.
      const duplicateIndex = blocks.findIndex((block, index) => {
        if (index >= firstSubstantialIndex) return false;
        return this.getNormalizedBlockText(block) === normalizedDescription;
      });
      if (duplicateIndex !== -1) {
        blocks[duplicateIndex].remove();
        for (let index = duplicateIndex - 1; index >= 0; index--) {
          const block = blocks[index];
          if (this.isShortLeadInBlock(block) || this.isLeadMediaBlock(block)) {
            block.remove();
            continue;
          }
          break;
        }
        return;
      }
    }

    // Slow path: Readability wraps content in a single root div, so the
    // description may be nested inside a <header> element inside the article.
    // Scope the search to <header> descendants to avoid false positives in the
    // article body.
    doc.body
      .querySelectorAll<HTMLElement>("header p, header div")
      .forEach((el) => {
        if (
          this.normalizeComparableText(el.textContent || "") ===
          normalizedDescription
        ) {
          el.remove();
        }
      });
  }

  private stripLeadMediaBeforeContent(doc: Document): void {
    if (!doc.body) return;
    const blocks = Array.from(doc.body.children) as HTMLElement[];
    const firstSubstantialIndex = blocks.findIndex(
      (block) => this.getNormalizedBlockText(block).length >= 120,
    );
    if (firstSubstantialIndex <= 0) return;

    for (let index = 0; index < firstSubstantialIndex; index++) {
      const block = blocks[index];
      if (this.isLeadMediaBlock(block)) {
        block.remove();
      }
    }
  }

  private getNormalizedBlockText(block: HTMLElement): string {
    return this.normalizeComparableText(
      block.innerHTML || block.textContent || "",
    );
  }

  private isShortLeadInBlock(block: HTMLElement): boolean {
    if (this.isLeadMediaBlock(block)) return false;
    const text = this.getNormalizedBlockText(block);
    if (!text) return false;
    return text.length < 80 && text.split(" ").filter(Boolean).length <= 12;
  }

  private isLeadMediaBlock(block: HTMLElement): boolean {
    const tag = block.tagName.toLowerCase();
    if (["img", "figure", "picture"].includes(tag)) return true;
    return (
      !!block.querySelector("img, figure, picture") &&
      this.getNormalizedBlockText(block).length < 40
    );
  }

  private removeLeadImageElement(imageEl: Element): void {
    const wrapper = imageEl.closest("figure, picture, a");
    (wrapper || imageEl).remove();
  }

  private stripSkipLinksFromDocument(doc: Document): void {
    if (!doc.body) return;

    doc.body.querySelectorAll<HTMLAnchorElement>("a").forEach((anchor) => {
      const href = (anchor.getAttribute("href") || "").trim().toLowerCase();
      const text = (anchor.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      const aria = (anchor.getAttribute("aria-label") || "").toLowerCase();
      const cls = (anchor.getAttribute("class") || "").toLowerCase();
      const id = (anchor.getAttribute("id") || "").toLowerCase();

      const looksLikeSkipLink =
        text.includes("skip to content") ||
        text.includes("skip to main content") ||
        ((href.startsWith("#") || aria.includes("content")) &&
          (text.startsWith("skip to") ||
            aria.includes("skip") ||
            cls.includes("skip") ||
            id.includes("skip")));

      if (looksLikeSkipLink) {
        anchor.remove();
      }
    });
  }

  private stripDuplicateLeadMediaMatchingHero(
    doc: Document,
    heroUrl: string,
  ): void {
    if (!doc.body || !heroUrl) return;

    const firstSubstantial = this.findFirstSubstantialParagraph(doc);
    doc.body.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      if (!this.isBeforeBoundary(img, firstSubstantial)) return;
      const src = (img.getAttribute("src") || "").trim();
      if (!src) return;

      if (this.isLikelySameImageSource(src, heroUrl)) {
        this.removeLeadImageElement(img);
      }
    });
  }

  private stripDuplicateLeadCaptionBlocks(doc: Document): void {
    if (!doc.body) return;

    const firstSubstantial = this.findFirstSubstantialParagraph(doc);
    const removedCaptionTexts = new Set<string>();

    doc.body
      .querySelectorAll<HTMLElement>(
        "figcaption, [id^='caption-'], [id*='caption-']",
      )
      .forEach((el) => {
        if (!this.isBeforeBoundary(el, firstSubstantial)) return;
        const raw = (el.textContent || "").replace(/\s+/g, " ").trim();
        const normalized = this.normalizeComparableText(raw);
        if (!normalized) return;

        const looksLikeCredit = /(credit|photo|image|source)/i.test(raw);
        if (!looksLikeCredit || normalized.length > 300) return;

        removedCaptionTexts.add(normalized);
        el.remove();
      });

    if (removedCaptionTexts.size === 0) return;

    doc.body.querySelectorAll<HTMLElement>("p").forEach((p) => {
      if (!this.isBeforeBoundary(p, firstSubstantial)) return;
      const raw = (p.textContent || "").replace(/\s+/g, " ").trim();
      if (!raw) return;

      const normalized = this.normalizeComparableText(raw);
      if (!removedCaptionTexts.has(normalized)) return;
      if (!/(credit|photo|image|source)/i.test(raw)) return;

      p.remove();
    });
  }

  private findFirstSubstantialParagraph(doc: Document): HTMLElement | null {
    return (
      Array.from(doc.body.querySelectorAll<HTMLElement>("p")).find(
        (p) => (p.textContent || "").replace(/\s+/g, " ").trim().length >= 120,
      ) || null
    );
  }

  private isBeforeBoundary(el: Element, boundary: HTMLElement | null): boolean {
    if (!boundary) return true;
    return !!(
      el.compareDocumentPosition(boundary) & Node.DOCUMENT_POSITION_FOLLOWING
    );
  }

  private isLikelySameImageSource(urlA: string, urlB: string): boolean {
    const keyA = this.normalizeImageSourceKey(urlA);
    const keyB = this.normalizeImageSourceKey(urlB);
    if (!keyA || !keyB) return false;
    return keyA === keyB;
  }

  private normalizeImageSourceKey(rawUrl: string): string {
    const fallback = rawUrl.trim().toLowerCase();
    if (!fallback) return "";

    try {
      const url = new URL(rawUrl, "https://example.invalid");
      const normalizedPath = url.pathname
        .toLowerCase()
        .replace(/-\d+x\d+(?=\.[a-z0-9]+$)/, "");
      return `${url.hostname.toLowerCase()}${normalizedPath}`;
    } catch {
      return fallback.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/, "");
    }
  }

  private stripNavigationChromeFromDocument(doc: Document): void {
    const body = doc.body;
    if (!body) return;

    const elements = Array.from(body.querySelectorAll<HTMLElement>("*"));
    if (elements.length === 0) return;

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
      const attr = (name: string) =>
        (el.getAttribute(name) || "").toLowerCase();
      const aria = attr("aria-label");
      const testId = attr("data-testid");
      const cls = attr("class");
      const id = attr("id");
      return [aria, testId, cls, id].some((s) => s.includes("breadcrumb"));
    };

    const looksLikeBreadcrumbList = (el: HTMLElement): boolean => {
      const tag = el.tagName.toLowerCase();
      if (tag !== "ol" && tag !== "ul") return false;
      const liEls = Array.from(el.children).filter(
        (c) => c.tagName.toLowerCase() === "li",
      ) as HTMLElement[];
      if (liEls.length < 2 || liEls.length > 10) return false;
      const totalText = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (totalText.length > 140) return false;
      let linkish = 0;
      for (const li of liEls) {
        if (
          li.children.length === 1 &&
          li.children[0].tagName.toLowerCase() === "a"
        )
          linkish++;
      }
      return linkish / liEls.length >= 0.7;
    };

    const looksLikeChromeContainer = (el: HTMLElement): boolean => {
      if (hasBreadcrumbSignal(el)) return true;
      if (el.getAttribute("role") === "navigation") return true;
      if (
        el.querySelector(
          "nav, [role='navigation'], [aria-label*='breadcrumb' i], [data-testid*='breadcrumb' i]",
        )
      )
        return true;
      const links = el.querySelectorAll("a").length;
      const paragraphs = el.querySelectorAll("p").length;
      return (
        links >= 3 && paragraphs === 0 && (el.textContent || "").length < 200
      );
    };

    const shouldRemove = (el: HTMLElement): boolean => {
      const tag = el.tagName.toLowerCase();
      if (
        tag === "nav" ||
        el.getAttribute("role") === "navigation" ||
        hasBreadcrumbSignal(el)
      )
        return true;
      if (["header", "footer", "aside"].includes(tag))
        return looksLikeChromeContainer(el);
      if (looksLikeBreadcrumbList(el)) return true;
      return false;
    };

    const removeSet = new Set(
      elements.filter((el, idx) => idx <= cutoffIndex && shouldRemove(el)),
    );
    elements
      .filter((el) => {
        let p = el.parentElement;
        while (p) {
          if (removeSet.has(p)) return false;
          p = p.parentElement;
        }
        return removeSet.has(el);
      })
      .forEach((el) => el.remove());
  }

  private stripTopHeadlineFromDocument(doc: Document): void {
    const h1 = doc.body?.querySelector("h1");
    if (!h1) return;
    const idx = Array.from(doc.body.querySelectorAll("*")).indexOf(h1);
    if (idx !== -1 && idx <= 9) h1.remove();
  }

  private transformNitterStatsMarkup(doc: Document): void {
    let target = doc.body.querySelector<HTMLElement>(
      ".tweet-stats, .tweet-stats-container",
    );
    if (!target) {
      const iconEl = doc.body.querySelector<HTMLElement>(
        ".icon-comment, .icon-retweet, .icon-heart, .icon-views",
      );
      let cursor = iconEl;
      for (let i = 0; i < 6 && cursor; i++) {
        if (
          cursor.querySelectorAll(
            ".icon-comment, .icon-retweet, .icon-heart, .icon-views",
          ).length >= 2
        ) {
          target = cursor;
          break;
        }
        cursor = cursor.parentElement;
      }
    }
    if (!target) return;

    const extractCount = (cls: string) => {
      const m = target.querySelector(`.${cls}`);
      return (
        (m?.parentElement?.textContent || "")
          .replace(/\s+/g, " ")
          .trim()
          .match(/(\d[\d.,]*\s*[kKmMbB]?)/)?.[1] || ""
      );
    };

    const statsEl = doc.createElement("div");
    statsEl.className = "rss-nitter-stats";
    [
      { k: "comment", i: "message-circle" },
      { k: "retweet", i: "repeat-2" },
      { k: "heart", i: "heart" },
      { k: "views", i: "bar-chart-2" },
    ].forEach((p) => {
      const pill = doc.createElement("span");
      pill.className = "rss-nitter-stat";
      pill.setAttribute("data-stat", p.k);
      const icon = doc.createElement("span");
      icon.className = "rss-nitter-stat-icon";
      icon.setAttribute("data-rss-icon", p.i);
      const count = doc.createElement("span");
      count.className = "rss-nitter-stat-count";
      count.textContent = extractCount(`icon-${p.k}`);
      pill.appendChild(icon);
      pill.appendChild(count);
      statsEl.appendChild(pill);
    });

    target.parentElement?.insertBefore(statsEl, target);
    target.remove();
  }

  private hydrateNitterStatsIcons(container: HTMLElement): void {
    container
      .querySelectorAll<HTMLElement>(".rss-nitter-stat-icon")
      .forEach((el) => {
        const icon = el.dataset.rssIcon;
        if (icon)
          try {
            setIcon(el, icon);
          } catch {
            /* intentionally empty */
          }
      });
  }

  private extractDisplayTitleFromHtml(html: string): string | null {
    if (!html) return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const h1 = doc.body?.querySelector("h1");
      return h1 ? h1.textContent : null;
    } catch {
      return null;
    }
  }
}
