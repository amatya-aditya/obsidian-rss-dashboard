import type { FeedItem, RssDashboardSettings } from "../../../types/types";
import type { HighlightService } from "../../../services/highlight-service";

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
  settings: Pick<RssDashboardSettings, "highlights" | "display"> & {
    collapsedFeedSections?: string[];
  };
  resolveCachedImageUrl?: (remoteUrl: string) => string | null;
  highlightService: HighlightService | null;
  callbacks: ViewCallbacks;
}
