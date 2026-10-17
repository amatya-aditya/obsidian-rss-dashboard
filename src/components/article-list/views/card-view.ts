import { setTooltip } from "obsidian";
import type { FeedItem } from "../../../types/types";
import { formatArticleDate } from "../../../utils/platform-utils";
import {
  getPubDateMs,
  resolveDisplayDate,
} from "../../../services/feed-parser/feed-retention";
import {
  getArticlePreviewSummaryText,
  shouldHighlightCardPreviewSummary,
  resolveArticlePreviewImage,
} from "../../../utils/article-preview-utils";
import { renderSingleRowCardTagChips } from "../utils/tag-layout-utils";
import { createIconButton } from "../../../utils/icon-button";
import type { BaseViewContext, ViewDeps } from "./view-types";
import {
  renderPreviewPlaceholder,
  shouldShowPreviewPlaceholder,
} from "./preview-placeholder";

export interface CardViewContext extends BaseViewContext {
  showCardToolbar: boolean;
}

function keepTextStopEnterLocal(element: HTMLElement): void {
  element.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.stopPropagation();
    }
  });
}

function renderCardPlaceholder(
  previewRegion: HTMLElement,
  openButton: HTMLElement,
  descriptionId: string,
): void {
  const placeholder = renderPreviewPlaceholder(
    previewRegion,
    "rss-dashboard-cover-summary-only rss-dashboard-card-preview-placeholder",
    descriptionId,
  );
  placeholder.tabIndex = 0;
  keepTextStopEnterLocal(placeholder);
  openButton.setAttribute("aria-describedby", descriptionId);
}

/**
 * The card's cover-image fetch control (#1314): the discoverable path to the
 * same action the context menu offers. Revealed by the stylesheet on card
 * hover and on focus within the card, so it stays out of the way but is never
 * hidden from the keyboard.
 */
function renderFetchCoverButton(
  card: HTMLElement,
  article: FeedItem,
  deps: ViewDeps,
): void {
  if (!deps.fetchCoverImage) return;

  const runFetch = async (): Promise<void> => {
    card.classList.add("rss-dashboard-card-cover-fetching");
    card.setAttribute("aria-busy", "true");
    try {
      const fetched = await deps.fetchCoverImage?.(article);
      if (fetched) deps.replaceArticle?.(article);
    } finally {
      card.classList.remove("rss-dashboard-card-cover-fetching");
      card.removeAttribute("aria-busy");
    }
  };

  const button = createIconButton({
    label: article.coverImage
      ? "Replace cover image from page"
      : "Fetch cover image from page",
    icon: "download",
    parent: card,
    cls: "rss-dashboard-fetch-cover-button",
    action: "fetch-cover-image",
    region: "article-card",
  });
  button.addEventListener("click", (event: MouseEvent) => {
    // The card itself opens the article on click.
    event.stopPropagation();
    void runFetch();
  });
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
        (ctx.selectedArticle &&
        article.guid === ctx.selectedArticle.guid &&
        article.feedUrl === ctx.selectedArticle.feedUrl
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
        "data-feed-url": article.feedUrl,
      },
    });

    const openButton = card.createEl("button", {
      cls: "rss-dashboard-card-open-button",
      attr: {
        type: "button",
        "aria-label": `Open article: ${article.title}. Feed: ${article.feedTitle}`,
      },
    });
    openButton.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        // Keep dashboard-wide shortcuts from taking over native button activation.
        event.stopPropagation();
      }
    });

    const cardContent = card.createDiv({
      cls: "rss-dashboard-card-content",
    });

    const cardHeader = cardContent.createDiv({
      cls: "rss-dashboard-card-header",
    });

    const cardTitleEl = cardHeader.createDiv({
      cls: "rss-dashboard-article-title",
      attr: {
        role: "heading",
        "aria-level": "3",
        tabindex: "0",
      },
    });
    keepTextStopEnterLocal(cardTitleEl);

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
      const feedName = feedContainer.createDiv({
        cls: "rss-dashboard-article-feed",
        text: article.feedTitle,
        attr: {
          "aria-label": `Feed: ${article.feedTitle}`,
          tabindex: "0",
        },
      });
      keepTextStopEnterLocal(feedName);
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
    const cardDescriptionId = `${card.id}-description`;
    if (previewSummaryText) {
      openButton.setAttribute("aria-describedby", cardDescriptionId);
    }

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
            attr: {
              id: cardDescriptionId,
              role: "note",
              tabindex: "0",
            },
          });
          keepTextStopEnterLocal(summaryOnlyContainer);
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
        } else if (
          shouldShowPreviewPlaceholder(
            ctx.settings.display.showSummary,
            previewSummaryText,
            false,
          )
        ) {
          renderCardPlaceholder(previewRegion, openButton, cardDescriptionId);
        } else {
          previewRegion.remove();
        }

        deps.scheduleCardTagLayout?.(card);
      };

      if (previewSummaryText) {
        const summaryOverlay = coverContainer.createDiv({
          cls: "rss-dashboard-summary-overlay",
          attr: {
            id: cardDescriptionId,
            role: "note",
            tabindex: "0",
          },
        });
        keepTextStopEnterLocal(summaryOverlay);
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
        attr: {
          id: cardDescriptionId,
          role: "note",
          tabindex: "0",
        },
      });
      keepTextStopEnterLocal(summaryOnlyContainer);
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
    } else if (
      shouldShowPreviewPlaceholder(
        ctx.settings.display.showSummary,
        previewSummaryText,
        false,
      )
    ) {
      const previewRegion = cardContent.createDiv({
        cls: "rss-dashboard-card-preview-region",
      });
      renderCardPlaceholder(previewRegion, openButton, cardDescriptionId);
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

    if (
      deps.fetchCoverImage &&
      ctx.settings.display.showCoverImage &&
      article.link
    ) {
      renderFetchCoverButton(card, article, deps);
    }

    if (ctx.showCardToolbar) {
      // A div, not a <footer>: a footer outside an article or main is exposed
      // as a `contentinfo` landmark, one per card (WCAG 2.2 1.3.1).
      const cardFooter = card.createDiv({
        cls: "rss-dashboard-card-footer",
      });
      const actionToolbar = cardFooter.createDiv({
        cls: "rss-dashboard-action-toolbar rss-dashboard-card-toolbar",
      });
      deps.createArticleActionButtons(actionToolbar, article, "full");

      const dateEl = cardFooter.createDiv({
        cls: "rss-dashboard-article-date",
      });
      const displayDate = resolveDisplayDate(
        article,
        ctx.settings.useFirstSeenDateFallback,
      );
      const dateInfo = formatArticleDate(
        displayDate,
        ctx.settings.display.articleDateStyle ?? "relative",
        {
          isFirstSeenFallback:
            getPubDateMs(article.pubDate) <= 0 && !!displayDate,
        },
      );
      dateEl.textContent = dateInfo.text;
      setTooltip(dateEl, dateInfo.title);
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
