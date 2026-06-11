import type { FeedItem } from "../../../types/types";
import { formatArticleDate } from "../../../utils/platform-utils";
import {
  extractFirstImageSrc,
  getArticlePreviewSummaryText,
} from "../utils/article-preview-utils";
import { renderSingleRowCardTagChips } from "../utils/tag-layout-utils";
import type { BaseViewContext, ViewDeps } from "./view-types";

function resolveCoverImageSrc(article: FeedItem): string | undefined {
  let coverImgSrc = article.image || article.coverImage;
  if (!coverImgSrc && article.content) {
    const extracted = extractFirstImageSrc(article.content);
    if (extracted) coverImgSrc = extracted;
  }
  if (!coverImgSrc && article.summary) {
    const extracted = extractFirstImageSrc(article.summary);
    if (extracted) coverImgSrc = extracted;
  }
  if (
    !coverImgSrc &&
    article.enclosure?.type?.startsWith("image/") &&
    article.enclosure?.url
  ) {
    coverImgSrc = article.enclosure.url;
  }
  return coverImgSrc || undefined;
}

export function renderFeedView(
  container: HTMLElement,
  articles: FeedItem[],
  ctx: BaseViewContext,
  deps: ViewDeps,
): void {
  for (const article of articles) {
    const hasTags = !!article.tags?.length;
    const feedItem = container.createDiv({
      cls:
        "rss-dashboard-feed-item" +
        (ctx.selectedArticle && article.guid === ctx.selectedArticle.guid
          ? " active"
          : "") +
        (article.read ? " read" : " unread") +
        (article.starred ? " starred" : " unstarred") +
        (article.saved ? " saved" : "") +
        (article.mediaType === "video"
          ? " rss-dashboard-youtube-article"
          : "") +
        (article.mediaType === "podcast"
          ? " rss-dashboard-podcast-article"
          : ""),
      attr: {
        id: `article-${article.guid}`,
        "data-article-guid": article.guid,
      },
    });

    const feedContent = feedItem.createDiv({
      cls: "rss-dashboard-feed-content",
    });

    const coverImgSrc = resolveCoverImageSrc(article);
    if (coverImgSrc) {
      const previewRegion = feedContent.createDiv({
        cls: "rss-dashboard-feed-preview-region",
      });
      previewRegion.createDiv({
        cls: "rss-dashboard-feed-hero-blur",
        attr: {
          style: `background-image: url('${coverImgSrc}')`,
        },
      });
      previewRegion.createEl("img", {
        cls: "rss-dashboard-feed-hero-image",
        attr: {
          src: coverImgSrc,
          alt: article.title,
          loading: "lazy",
        },
      });
    }

    const textRegion = feedContent.createDiv({
      cls: "rss-dashboard-feed-text-region",
    });

    const header = textRegion.createDiv({
      cls: "rss-dashboard-feed-header",
    });

    const titleEl = header.createDiv({
      cls: "rss-dashboard-article-title",
    });

    if (ctx.highlightService && ctx.settings.highlights.highlightInTitles) {
      ctx.highlightService.setHighlightedText(titleEl, article.title);
    } else {
      titleEl.textContent = article.title;
    }

    if (ctx.showFeedSource) {
      const articleMeta = header.createDiv({
        cls: "rss-dashboard-article-meta",
      });
      const feedContainer = articleMeta.createDiv({
        cls: "rss-dashboard-article-feed-container",
      });
      deps.renderFeedIcon(feedContainer, article.feedUrl, article.mediaType);
      feedContainer.createDiv({
        cls: "rss-dashboard-article-feed",
        text: article.feedTitle,
        attr: { title: article.feedTitle },
      });
    }

    const feedPreviewText = getArticlePreviewSummaryText(article);
    if (feedPreviewText) {
      const summaryEl = textRegion.createDiv({
        cls: "rss-dashboard-feed-summary",
      });

      if (
        ctx.highlightService &&
        ctx.settings.highlights.highlightInSummaries
      ) {
        ctx.highlightService.setHighlightedText(summaryEl, feedPreviewText);
      } else {
        summaryEl.textContent = feedPreviewText;
      }
    }

    if (hasTags) {
      const tagsRegion = feedItem.createDiv({
        cls: "rss-dashboard-feed-tags-region",
      });
      const tagsContainer = tagsRegion.createDiv({
        cls: "rss-dashboard-tag-container",
      });
      renderSingleRowCardTagChips(tagsContainer, article.tags ?? []);
    }

    const feedFooter = feedItem.createEl("footer", {
      cls: "rss-dashboard-feed-footer",
    });
    const actionToolbar = feedFooter.createDiv({
      cls: "rss-dashboard-action-toolbar rss-dashboard-feed-toolbar",
    });
    deps.createArticleActionButtons(actionToolbar, article, "full");

    const dateEl = feedFooter.createDiv({
      cls: "rss-dashboard-article-date",
    });
    const dateInfo = formatArticleDate(
      article.pubDate,
      ctx.settings.display.articleDateStyle ?? "relative",
    );
    dateEl.textContent = dateInfo.text;
    dateEl.setAttribute("title", dateInfo.title);

    feedItem.addEventListener("click", () => {
      ctx.callbacks.onArticleClick(article);
    });

    feedItem.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      deps.showArticleContextMenu(e, article);
    });
  }
}
