import type { FeedItem } from "../../../types/types";
import { formatArticleDate } from "../../../utils/platform-utils";
import {
  getArticlePreviewSummaryText,
  shouldHighlightCardPreviewSummary,
  resolveArticlePreviewImage,
} from "../utils/article-preview-utils";
import { renderSingleRowCardTagChips } from "../utils/tag-layout-utils";
import type { BaseViewContext, ViewDeps } from "./view-types";

export interface CardViewContext extends BaseViewContext {
  showCardToolbar: boolean;
}

export function renderCardView(
  container: HTMLElement,
  articles: FeedItem[],
  ctx: CardViewContext,

  deps: ViewDeps,
): void {
  for (const article of articles) {
    const hasTags = !!article.tags?.length;
    const card = container.createDiv({
      cls:
        "rss-dashboard-article-card" +
        (hasTags ? " rss-dashboard-article-card--has-tags" : "") +
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

    const cardContent = card.createDiv({
      cls: "rss-dashboard-card-content",
    });

    const cardHeader = cardContent.createDiv({
      cls: "rss-dashboard-card-header",
    });

    const cardTitleEl = cardHeader.createDiv({
      cls: "rss-dashboard-article-title",
    });

    if (ctx.highlightService && ctx.settings.highlights.highlightInTitles) {
      ctx.highlightService.setHighlightedText(cardTitleEl, article.title);
    } else {
      cardTitleEl.textContent = article.title;
    }
    cardTitleEl.dataset.articleTitle = article.title;
    deps.scheduleMathRendering?.(cardTitleEl);

    if (ctx.showFeedSource) {
      const articleMeta = cardHeader.createDiv({
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

    const coverImgSrc = ctx.settings.display.showCoverImage
      ? resolveArticlePreviewImage(article, ["coverImage", "image"])
      : undefined;
    const displayedCoverImgSrc =
      coverImgSrc && ctx.settings.display.allowImageCaching
        ? (ctx.resolveCachedImageUrl?.(coverImgSrc) ?? coverImgSrc)
        : coverImgSrc;
    const previewSummaryText = ctx.settings.display.showSummary
      ? getArticlePreviewSummaryText(article)
      : "";

    if (displayedCoverImgSrc) {
      const previewRegion = cardContent.createDiv({
        cls: "rss-dashboard-card-preview-region",
      });
      const coverContainer = previewRegion.createDiv({
        cls:
          "rss-dashboard-cover-container" +
          (previewSummaryText ? " has-summary" : ""),
      });
      const coverImg = coverContainer.createEl("img", {
        cls: "rss-dashboard-cover-image",
        attr: {
          src: displayedCoverImgSrc,
          alt: article.title,
          loading: "lazy",
          decoding: "async",
        },
      });
      coverImg.onerror = () => {
        if (
          displayedCoverImgSrc !== coverImgSrc &&
          coverImgSrc &&
          coverImg.dataset.rssCacheRemoteFallback !== "true"
        ) {
          coverImg.dataset.rssCacheRemoteFallback = "true";
          coverImg.setAttribute("src", coverImgSrc);
          return;
        }

        previewRegion.empty();

        if (previewSummaryText) {
          const summaryOnlyContainer = previewRegion.createDiv({
            cls: "rss-dashboard-cover-summary-only",
          });
          if (
            ctx.highlightService &&
            ctx.settings.highlights.highlightInSummaries &&
            shouldHighlightCardPreviewSummary(previewSummaryText)
          ) {
            ctx.highlightService.setHighlightedText(
              summaryOnlyContainer,
              previewSummaryText,
            );
          } else {
            summaryOnlyContainer.textContent = previewSummaryText;
          }
        } else {
          previewRegion.remove();
        }

        deps.scheduleCardTagLayout?.(card);
      };

      if (previewSummaryText) {
        const summaryOverlay = coverContainer.createDiv({
          cls: "rss-dashboard-summary-overlay",
        });
        if (
          ctx.highlightService &&
          ctx.settings.highlights.highlightInSummaries &&
          shouldHighlightCardPreviewSummary(previewSummaryText)
        ) {
          ctx.highlightService.setHighlightedText(
            summaryOverlay,
            previewSummaryText,
          );
        } else {
          summaryOverlay.textContent = previewSummaryText;
        }
      }
    } else if (previewSummaryText) {
      const previewRegion = cardContent.createDiv({
        cls: "rss-dashboard-card-preview-region",
      });
      const summaryOnlyContainer = previewRegion.createDiv({
        cls: "rss-dashboard-cover-summary-only",
      });
      if (
        ctx.highlightService &&
        ctx.settings.highlights.highlightInSummaries &&
        shouldHighlightCardPreviewSummary(previewSummaryText)
      ) {
        ctx.highlightService.setHighlightedText(
          summaryOnlyContainer,
          previewSummaryText,
        );
      } else {
        summaryOnlyContainer.textContent = previewSummaryText;
      }
    }

    if (hasTags) {
      const tagsRegion = card.createDiv({
        cls: "rss-dashboard-card-tags-region",
      });
      const tagsContainer = tagsRegion.createDiv({
        cls: "rss-dashboard-tag-container",
      });
      renderSingleRowCardTagChips(tagsContainer, article.tags ?? []);
    }

    if (ctx.showCardToolbar) {
      const cardFooter = card.createEl("footer", {
        cls: "rss-dashboard-card-footer",
      });
      const actionToolbar = cardFooter.createDiv({
        cls: "rss-dashboard-action-toolbar rss-dashboard-card-toolbar",
      });
      deps.createArticleActionButtons(actionToolbar, article, "full");

      const dateEl = cardFooter.createDiv({
        cls: "rss-dashboard-article-date",
      });
      const dateInfo = formatArticleDate(
        article.pubDate,
        ctx.settings.display.articleDateStyle ?? "relative",
      );
      dateEl.textContent = dateInfo.text;
      dateEl.setAttribute("title", dateInfo.title);
    }

    card.addEventListener("click", () => {
      ctx.callbacks.onArticleClick(article);
    });

    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      deps.showArticleContextMenu(e, article);
    });

    deps.scheduleCardTagLayout?.(card);
  }
}
