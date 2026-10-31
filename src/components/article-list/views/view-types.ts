import type { FeedItem, RssDashboardSettings } from "../../../types/types";
import type { HighlightService } from "../../../services/highlight-service";
import type { TagAppearanceSettings } from "../../../utils/tag-colors";

export interface ViewCallbacks {
  onArticleClick: (article: FeedItem) => void;
}

export interface ViewDeps {
  renderFeedIcon(
    container: HTMLElement,
    feedUrl: string,
    mediaType?: "article" | "video" | "podcast",
  ): void;
  createArticleActionButtons(
    actionToolbar: HTMLElement,
    article: FeedItem,
    mode: "full" | "minimal-read",
  ): void;
  showArticleContextMenu(event: MouseEvent, article: FeedItem): void;
  /**
   * Fetches the article page's cover image and stores it (#1314). Resolves true
   * when a usable image was stored. Absent when the dashboard cannot fetch.
   */
  fetchCoverImage?(article: FeedItem): Promise<boolean>;
  /**
   * Puts the feed's own cover image back after a manual fetch replaced it
   * (#1330). Local and offline; resolves true when the article was rewritten.
   * Absent when the dashboard cannot restore.
   */
  restoreCoverImage?(article: FeedItem): Promise<boolean>;
  /** Rebuilds one article's rendered element in place, after its data changed. */
  replaceArticle?(article: FeedItem): void;
  scheduleMathRendering?(element: HTMLElement): void;
  scheduleCardTagLayout?(card: HTMLElement): void;
  onToggleFeedSectionCollapse?(
    feedSourceName: string,
    isCollapsed: boolean,
  ): void;
}

export interface BaseViewContext {
  selectedArticle: FeedItem | null;
  showFeedSource: boolean;
  settings: Pick<
    RssDashboardSettings,
    "highlights" | "display" | "useFirstSeenDateFallback"
  > & {
    articleGroupBy?: RssDashboardSettings["articleGroupBy"];
    collapsedFeedSections?: string[];
  };
  tagAppearanceSettings?: TagAppearanceSettings;
  resolveCachedImageUrl?: (remoteUrl: string) => string | null;
  highlightService: HighlightService | null;
  callbacks: ViewCallbacks;
}
