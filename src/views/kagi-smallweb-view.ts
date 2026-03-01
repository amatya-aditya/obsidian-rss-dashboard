import { ItemView, WorkspaceLeaf, Notice, setIcon, requestUrl } from "obsidian";
import { Feed } from "../types/types";
import type RssDashboardPlugin from "../../main";
import { setCssProps } from "../utils/platform-utils";
import { FolderSelectorPopup } from "../components/folder-selector-popup";

export const RSS_SMALLWEB_VIEW_TYPE = "rss-smallweb-view";

/**
 * Represents a single entry from the Kagi Smallweb Atom feed
 */
interface SmallwebEntry {
  postTitle: string;
  postUrl: string;
  blogName: string;
  blogUrl: string;
  updatedAt: Date;
  excerpt: string;
  domain: string;
}

/**
 * Cache structure for Smallweb feed data
 */
interface SmallwebCache {
  entries: SmallwebEntry[];
  fetchedAt: Date | null;
}

export class KagiSmallwebView extends ItemView {
  private smallwebEntries: SmallwebEntry[] = [];
  private smallwebFilteredEntries: SmallwebEntry[] = [];
  private smallwebCache: SmallwebCache = { entries: [], fetchedAt: null };
  private smallwebIsLoading = false;
  private smallwebError: string | null = null;
  private smallwebSearchQuery = "";
  private smallwebSearchDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;
  private smallwebFeedUpdatedAt: Date | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: RssDashboardPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return RSS_SMALLWEB_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Kagi smallweb";
  }

  getIcon(): string {
    return "sparkles";
  }

  onOpen(): Promise<void> {
    void this.fetchSmallwebFeed();
    return Promise.resolve();
  }

  async onClose(): Promise<void> {
    if (this.smallwebSearchDebounceTimer) {
      clearTimeout(this.smallwebSearchDebounceTimer);
    }
    await super.onClose();
  }

  render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("rss-smallweb-container");

    if (this.smallwebIsLoading) {
      this.renderSmallwebLoading(container);
      return;
    }

    if (this.smallwebError) {
      this.renderSmallwebError(container);
      return;
    }

    this.renderSmallwebHeader(container);
    this.renderSmallwebCardGrid(container);
    this.renderSmallwebFooter(container);
  }

  private async fetchSmallwebFeed(forceRefresh = false): Promise<void> {
    const CACHE_DURATION_MS = 5 * 60 * 1000;
    if (
      !forceRefresh &&
      this.smallwebCache.fetchedAt &&
      Date.now() - this.smallwebCache.fetchedAt.getTime() < CACHE_DURATION_MS
    ) {
      this.smallwebEntries = this.smallwebCache.entries;
      this.smallwebFilteredEntries = [...this.smallwebEntries];
      this.smallwebIsLoading = false;
      this.render();
      return;
    }

    this.smallwebIsLoading = true;
    this.smallwebError = null;
    this.render();

    try {
      const response = await requestUrl({
        url: "https://kagi.com/api/v1/smallweb/feed?limit=50",
        method: "GET",
      });

      const xmlText = response.text;
      this.smallwebEntries = this.parseSmallwebAtomFeed(xmlText);
      this.smallwebCache = {
        entries: this.smallwebEntries,
        fetchedAt: new Date(),
      };
      this.smallwebFilteredEntries = [...this.smallwebEntries];
    } catch (err) {
      console.error("[Kagi Smallweb] Error fetching feed:", err);
      this.smallwebError =
        err instanceof Error ? err.message : "Failed to fetch feed";
    } finally {
      this.smallwebIsLoading = false;
      this.render();
    }
  }

  private parseSmallwebAtomFeed(xmlText: string): SmallwebEntry[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    // Extract feed-level updated timestamp
    const feedUpdatedStr =
      doc.querySelector("feed > updated")?.textContent || "";
    if (feedUpdatedStr) {
      try {
        this.smallwebFeedUpdatedAt = new Date(feedUpdatedStr);
      } catch {
        this.smallwebFeedUpdatedAt = null;
      }
    }

    const entryElements = Array.from(doc.querySelectorAll("entry"));

    const entries: SmallwebEntry[] = [];

    for (const entry of entryElements) {
      try {
        const postTitle =
          entry.querySelector("title")?.textContent || "Untitled";

        const linkEl =
          entry.querySelector("link[rel='alternate']") ||
          entry.querySelector("link");
        const postUrl = linkEl?.getAttribute("href") || "";

        if (!postUrl) continue;

        const authorName = entry.querySelector("author > name")?.textContent;

        let blogUrl: string;
        let domain: string;
        try {
          const url = new URL(postUrl);
          blogUrl = url.origin;
          domain = url.hostname;
        } catch {
          continue;
        }

        const blogName = authorName || domain;

        const updatedStr = entry.querySelector("updated")?.textContent || "";
        let updatedAt: Date;
        try {
          updatedAt = new Date(updatedStr);
        } catch {
          updatedAt = new Date();
        }

        const summaryEl = entry.querySelector("summary");
        const contentEl = entry.querySelector("content");
        const rawText = summaryEl?.textContent || contentEl?.textContent || "";
        const excerpt = this.stripHtmlAndTruncate(rawText, 200);

        entries.push({
          postTitle,
          postUrl,
          blogName,
          blogUrl,
          updatedAt,
          excerpt,
          domain,
        });
      } catch {
        continue;
      }
    }

    return entries;
  }

  private stripHtmlAndTruncate(html: string, maxLength: number): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const text = doc.body.textContent || "";
    const normalized = text.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return normalized.substring(0, maxLength - 3) + "...";
  }

  /**
   * Truncate a title to a maximum length with ellipses
   */
  private truncateTitle(text: string, maxLength: number = 50): string {
    if (!text) return "";
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + "...";
  }

  private renderSmallwebLoading(container: HTMLElement): void {
    const loadingEl = container.createDiv({ cls: "rss-discover-loading" });
    setIcon(loadingEl, "loader-2");
    loadingEl.appendText(" Loading Kagi Smallweb feed...");

    const skeletonGrid = container.createDiv({ cls: "rss-discover-grid" });
    for (let i = 0; i < 6; i++) {
      this.renderSmallwebSkeletonCard(skeletonGrid);
    }
  }

  private renderSmallwebSkeletonCard(container: HTMLElement): void {
    const card = container.createDiv({
      cls: "rss-discover-card rss-smallweb-skeleton",
    });

    const header = card.createDiv({ cls: "rss-discover-card-header" });
    const titleGroup = header.createDiv({
      cls: "rss-discover-card-title-group",
    });
    titleGroup.createDiv({ cls: "rss-smallweb-skeleton-avatar" });
    const titleArea = titleGroup.createDiv();
    titleArea.createDiv({ cls: "rss-smallweb-skeleton-title" });

    const content = card.createDiv({ cls: "rss-discover-card-content" });
    content.createDiv({ cls: "rss-smallweb-skeleton-text" });
    content.createDiv({
      cls: "rss-smallweb-skeleton-text rss-smallweb-skeleton-text-short",
    });

    const footer = card.createDiv({ cls: "rss-discover-card-footer" });
    footer.createDiv({ cls: "rss-smallweb-skeleton-button" });
  }

  private renderSmallwebError(container: HTMLElement): void {
    const errorEl = container.createDiv({ cls: "rss-discover-error" });
    setIcon(errorEl, "alert-triangle");
    errorEl.appendText(
      " Could not load Kagi Smallweb feed. Check your internet connection.",
    );

    const retryBtn = errorEl.createEl("button", { cls: "mod-cta" });
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", () => {
      void this.fetchSmallwebFeed(true);
    });
  }

  private renderSmallwebHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: "rss-smallweb-header" });

    // Back button
    const backBtn = header.createDiv({
      cls: "rss-dashboard-nav-button",
    });
    backBtn.appendText("← Discover");
    backBtn.addEventListener("click", () => {
      void this.plugin.activateDiscoverView();
    });

    // Title section
    const titleSection = header.createDiv({
      cls: "rss-smallweb-title-section",
    });

    const titleRow = titleSection.createDiv({ cls: "rss-smallweb-title-row" });
    titleRow.createDiv({ cls: "rss-smallweb-title", text: "✦ Kagi Smallweb" });

    // Refresh button
    const refreshBtn = titleRow.createEl("button", {
      cls: "rss-smallweb-refresh-btn",
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.setAttribute("aria-label", "Refresh feed");
    refreshBtn.addEventListener("click", () => {
      void this.fetchSmallwebFeed(true);
    });

    // Subtitle
    const subtitle = titleSection.createDiv({
      cls: "rss-smallweb-subtitle",
    });
    subtitle.appendText(
      "Recently published posts from independent blogs, curated by Kagi. Refreshed every 5 hours. ",
    );
    subtitle.createEl("a", {
      text: "Read more here",
      attr: {
        href: "https://blog.kagi.com/small-web",
        target: "_blank",
        rel: "noopener noreferrer",
      },
    });

    // Warning about RSS feed availability
    const warningEl = titleSection.createDiv({
      cls: "rss-smallweb-warning",
    });
    setIcon(warningEl, "alert-triangle");
    warningEl.createSpan({
      text: " Warning: Not all feeds have a direct RSS link. You may have to find the RSS link manually for some feeds or use a third-party service to convert the feed to RSS.",
    });

    // Last update time with link to API
    if (this.smallwebFeedUpdatedAt) {
      const lastUpdateSection = titleSection.createDiv({
        cls: "rss-smallweb-last-update",
      });

      const apiLink = lastUpdateSection.createEl("a", {
        cls: "rss-smallweb-timestamp-link",
        attr: {
          href: "https://kagi.com/api/v1/smallweb/feed/",
          target: "_blank",
        },
      });

      setIcon(apiLink, "clock");

      const utcTime = this.smallwebFeedUpdatedAt
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, " UTC");
      // Show only time in EST (no date)
      const estTime = this.smallwebFeedUpdatedAt.toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

      apiLink.createSpan({
        text: ` Last Kagi update: ${utcTime} / ${estTime} EST`,
      });
    }

    // Timestamp and search row
    const controlsRow = titleSection.createDiv({
      cls: "rss-smallweb-controls-row",
    });

    // Last updated timestamp
    if (this.smallwebCache.fetchedAt) {
      const timestamp = controlsRow.createDiv({
        cls: "rss-smallweb-timestamp",
      });
      setIcon(timestamp, "clock");
      timestamp.appendText(
        ` Last local update: ${this.getSmallwebRelativeTime(this.smallwebCache.fetchedAt)}`,
      );
    }

    // Search input
    const searchWrapper = controlsRow.createDiv({
      cls: "rss-smallweb-search-wrapper",
    });
    const searchInput = searchWrapper.createEl("input", {
      type: "text",
      placeholder: "Search blogs and posts…",
      value: this.smallwebSearchQuery,
    });
    searchInput.addClass("rss-discover-search-input");
    searchInput.addEventListener("input", (e) => {
      const value = (e.target as HTMLInputElement).value;
      this.debouncedSmallwebSearch(value);
    });

    // Results count
    if (this.smallwebSearchQuery) {
      controlsRow.createDiv({
        cls: "rss-smallweb-results-count",
        text: `${this.smallwebFilteredEntries.length} results`,
      });
    }
  }

  private debouncedSmallwebSearch(query: string): void {
    if (this.smallwebSearchDebounceTimer) {
      clearTimeout(this.smallwebSearchDebounceTimer);
    }
    this.smallwebSearchDebounceTimer = setTimeout(() => {
      this.smallwebSearchQuery = query;
      this.filterSmallwebEntries();
      this.render();
    }, 150);
  }

  private filterSmallwebEntries(): void {
    if (!this.smallwebSearchQuery.trim()) {
      this.smallwebFilteredEntries = [...this.smallwebEntries];
      return;
    }

    const query = this.smallwebSearchQuery.toLowerCase();
    this.smallwebFilteredEntries = this.smallwebEntries.filter((entry) => {
      return (
        entry.blogName.toLowerCase().includes(query) ||
        entry.domain.toLowerCase().includes(query) ||
        entry.postTitle.toLowerCase().includes(query) ||
        entry.excerpt.toLowerCase().includes(query)
      );
    });
  }

  private renderSmallwebCardGrid(container: HTMLElement): void {
    const grid = container.createDiv({ cls: "rss-discover-grid" });

    if (this.smallwebFilteredEntries.length === 0) {
      const emptyState = grid.createDiv({ cls: "rss-discover-empty" });
      setIcon(emptyState, "search");
      emptyState.appendText(" No posts found");
      return;
    }

    for (const entry of this.smallwebFilteredEntries) {
      this.renderSmallwebCard(grid, entry);
    }
  }

  private renderSmallwebCard(
    container: HTMLElement,
    entry: SmallwebEntry,
  ): void {
    const card = container.createDiv({ cls: "rss-discover-card" });

    const header = card.createDiv({ cls: "rss-discover-card-header" });
    const titleGroup = header.createDiv({
      cls: "rss-discover-card-title-group",
    });

    const logoContainer = titleGroup.createDiv({
      cls: "rss-discover-card-logo-container",
    });
    this.generateSmallwebAvatar(logoContainer, entry.blogName, entry.domain);

    const titleArea = titleGroup.createDiv();
    titleArea.createDiv({
      cls: "rss-discover-card-title",
      text: this.truncateTitle(entry.blogName, 50),
    });

    if (entry.postTitle && entry.postTitle !== entry.blogName) {
      titleArea.createDiv({
        cls: "rss-smallweb-post-title",
        text: this.truncateTitle(entry.postTitle, 50),
      });
    }

    const content = card.createDiv({ cls: "rss-discover-card-content" });

    const metaTop = content.createDiv({ cls: "rss-discover-card-meta-top" });

    const typeEl = metaTop.createDiv({
      cls: "rss-discover-card-type rss-smallweb-badge",
    });
    typeEl.textContent = "Smallweb";

    const domainTag = metaTop.createDiv({ cls: "rss-discover-card-tag" });
    domainTag.textContent = entry.domain;
    setCssProps(domainTag, {
      "--tag-color": this.getSmallwebTagColor(entry.domain),
    });

    const timeTag = metaTop.createDiv({ cls: "rss-discover-card-tag" });
    timeTag.textContent = this.getSmallwebRelativeTime(entry.updatedAt);
    setCssProps(timeTag, { "--tag-color": "hsl(210, 60%, 75%)" });

    if (entry.excerpt) {
      content.createDiv({
        cls: "rss-discover-card-summary",
        text: entry.excerpt,
      });
    }

    const footer = card.createDiv({ cls: "rss-discover-card-footer" });
    const rightSection = footer.createDiv({
      cls: "rss-discover-card-footer-right",
    });

    const previewBtn = rightSection.createEl("button", {
      cls: "rss-discover-card-preview-btn",
    });
    setIcon(previewBtn, "globe");
    previewBtn.createSpan({ text: " View Blog" });
    previewBtn.addEventListener("click", () => {
      if (this.plugin.settings.useWebViewer) {
        // Open in sidebar using internal browser
        window.open(entry.postUrl, "_blank", "noopener,noreferrer");
      } else {
        // Open in external browser
        window.open(entry.postUrl, "_blank");
      }
    });

    // Check if subscribed by comparing both the exact URL and if the feed URL
    // starts with the blog URL (since RSS feeds are typically at blogUrl/feed, etc.)
    const isSubscribed = this.plugin.settings.feeds.some(
      (f: Feed) =>
        f.url === entry.blogUrl || f.url.startsWith(entry.blogUrl + "/"),
    );

    if (isSubscribed) {
      const followingBtn = rightSection.createEl("button", {
        cls: "rss-smallweb-following-btn",
      });
      setIcon(followingBtn, "check");
      followingBtn.createSpan({ text: " Following" });

      // Add hover effect for unfollow
      followingBtn.addEventListener("mouseenter", () => {
        followingBtn.empty();
        setIcon(followingBtn, "x");
        followingBtn.createSpan({ text: " Unfollow" });
        followingBtn.addClass("rss-smallweb-unfollow-hover");
      });

      followingBtn.addEventListener("mouseleave", () => {
        followingBtn.empty();
        setIcon(followingBtn, "check");
        followingBtn.createSpan({ text: " Following" });
        followingBtn.removeClass("rss-smallweb-unfollow-hover");
      });

      followingBtn.addEventListener("click", () => {
        void this.handleSmallwebUnfollow(entry);
      });
    } else {
      const followBtn = rightSection.createEl("button", {
        cls: "rss-discover-card-add-btn",
      });
      setIcon(followBtn, "plus");
      followBtn.createSpan({ text: " Follow" });

      // Get default folder from settings
      const defaultFolder =
        this.plugin.settings.media.defaultSmallwebFolder || "Smallweb";

      // Single click: Show folder selector popup
      followBtn.addEventListener("click", () => {
        // Show folder selector popup with default folder prioritized
        new FolderSelectorPopup(this.plugin, {
          anchorEl: followBtn,
          defaultFolder: defaultFolder,
          initialQuery: "Smallweb",
          onSelect: (folderName) => {
            void this.handleSmallwebSubscribeToFolder(entry, folderName);
          },
        });
      });

      // Double click: Add to default folder directly
      followBtn.addEventListener("dblclick", () => {
        void this.handleSmallwebSubscribeToFolder(entry, defaultFolder);
      });
    }
  }

  private generateSmallwebAvatar(
    container: HTMLElement,
    blogName: string,
    domain: string,
  ): void {
    const letter = blogName.charAt(0).toUpperCase();
    const color = this.getSmallwebColorFromDomain(domain);
    container.style.backgroundColor = color;
    container.createDiv({ cls: "rss-discover-card-initials", text: letter });
  }

  private getSmallwebColorFromDomain(domain: string): string {
    const colors = [
      "hsl(0, 50%, 70%)",
      "hsl(25, 50%, 70%)",
      "hsl(50, 50%, 70%)",
      "hsl(100, 50%, 70%)",
      "hsl(175, 50%, 70%)",
      "hsl(210, 50%, 70%)",
      "hsl(260, 50%, 70%)",
      "hsl(320, 50%, 70%)",
    ];

    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
      hash = domain.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }

    return colors[Math.abs(hash) % colors.length];
  }

  private getSmallwebTagColor(tag: string): string {
    let hash = 0;
    if (tag.length === 0) return "hsl(0, 0%, 80%)";
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash;
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 60%, 75%)`;
  }

  private getSmallwebRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60)
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }

  private async handleSmallwebSubscribe(entry: SmallwebEntry): Promise<void> {
    try {
      // Try to discover the RSS feed URL from the blog
      const feedUrl = await this.discoverRssFeed(entry.blogUrl);

      if (!feedUrl) {
        new Notice(`Could not find RSS feed for "${entry.blogName}"`);
        return;
      }

      const success = await this.plugin.addFeed(
        entry.blogName,
        feedUrl,
        "Uncategorized",
      );

      if (success) {
        new Notice(`Following "${entry.blogName}"`);
        // Force re-render to update all cards with the new following state
        this.render();
      } else {
        new Notice(`Failed to follow "${entry.blogName}"`);
      }
    } catch (err) {
      console.error("[Kagi Smallweb] Error subscribing:", err);
      new Notice("Failed to follow blog");
    }
  }

  /**
   * Handle subscribing to a feed with a specific folder selection
   */
  private async handleSmallwebSubscribeToFolder(
    entry: SmallwebEntry,
    folderName: string,
  ): Promise<void> {
    try {
      // Try to discover the RSS feed URL from the blog
      const feedUrl = await this.discoverRssFeed(entry.blogUrl);

      if (!feedUrl) {
        new Notice(`Could not find RSS feed for "${entry.blogName}"`);
        return;
      }

      // Ensure folder exists before adding feed
      const folderExists = this.plugin.settings.folders.some(
        (f) => f.name.toLowerCase() === folderName.toLowerCase(),
      );

      if (!folderExists) {
        await this.plugin.ensureFolderExists(folderName);
      }

      const success = await this.plugin.addFeed(
        entry.blogName,
        feedUrl,
        folderName,
      );

      if (success) {
        new Notice(`Following "${entry.blogName}" in "${folderName}"`);
        // Force re-render to update all cards with the new following state
        this.render();
      } else {
        new Notice(`Failed to follow "${entry.blogName}"`);
      }
    } catch (err) {
      console.error("[Kagi Smallweb] Error subscribing:", err);
      new Notice("Failed to follow blog");
    }
  }

  /**
   * Try to discover the RSS feed URL from a blog URL
   * by checking common feed paths and HTML link tags
   */
  private async discoverRssFeed(blogUrl: string): Promise<string | null> {
    const commonFeedPaths = [
      "/feed",
      "/rss",
      "/atom.xml",
      "/feed.xml",
      "/rss.xml",
      "/index.xml",
      "/atom",
      "/.rss",
    ];

    // Try common feed paths first
    for (const path of commonFeedPaths) {
      const feedUrl = `${blogUrl}${path}`;
      try {
        const response = await requestUrl({
          url: feedUrl,
          method: "HEAD",
        });
        const contentType = response.headers?.["content-type"] || "";
        if (
          response.status === 200 &&
          (contentType.includes("xml") ||
            contentType.includes("rss") ||
            contentType.includes("atom"))
        ) {
          return feedUrl;
        }
      } catch {
        // Continue to next path
      }
    }

    // Try to fetch the homepage and look for RSS link tags
    try {
      const response = await requestUrl({
        url: blogUrl,
        method: "GET",
      });

      const html = response.text;
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Look for <link rel="alternate" type="application/rss+xml" href="...">
      const rssLinks = Array.from(
        doc.querySelectorAll(
          'link[type="application/rss+xml"], link[type="application/atom+xml"]',
        ),
      );

      for (const link of rssLinks) {
        const href = link.getAttribute("href");
        if (href) {
          // Handle relative URLs
          if (href.startsWith("/")) {
            return `${blogUrl}${href}`;
          } else if (href.startsWith("http")) {
            return href;
          }
        }
      }
    } catch {
      // Failed to fetch homepage
    }

    return null;
  }

  private async handleSmallwebUnfollow(entry: SmallwebEntry): Promise<void> {
    try {
      // Find feed by matching blogUrl or feed URL starting with blogUrl
      const feedIndex = this.plugin.settings.feeds.findIndex(
        (f: Feed) =>
          f.url === entry.blogUrl || f.url.startsWith(entry.blogUrl + "/"),
      );

      if (feedIndex >= 0) {
        this.plugin.settings.feeds.splice(feedIndex, 1);
        await this.plugin.saveSettings();
        new Notice(`Unfollowed "${entry.blogName}"`);

        // Force re-render to update all cards
        this.render();
      }
    } catch (err) {
      console.error("[Kagi Smallweb] Error unfollowing:", err);
      new Notice("Failed to unfollow");
    }
  }

  private renderSmallwebFooter(container: HTMLElement): void {
    const footer = container.createDiv({ cls: "rss-smallweb-footer" });

    footer.createEl("a", {
      text: "View on kagi.com",
      attr: { href: "https://kagi.com/smallweb", target: "_blank" },
    });

    footer.appendText(" · ");

    footer.createEl("a", {
      text: "Browse all ~5,000 feeds",
      attr: { href: "https://kagi.com/smallweb/opml", target: "_blank" },
    });
  }
}
