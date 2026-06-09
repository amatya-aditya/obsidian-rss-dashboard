import type { FeedItem } from "../../../types/types";
import { formatArticleDate } from "../../../utils/platform-utils";
import { MAX_VISIBLE_TAGS } from "../utils/tag-layout-utils";
import type { BaseViewContext, ViewDeps } from "./view-types";

export interface ListViewContext extends BaseViewContext {
  showListToolbar: boolean;
  listToolbarStyle: "left-grid" | "bottom-row" | "minimal";
}

export function renderListView(
  container: HTMLElement,
  articles: FeedItem[],
  ctx: ListViewContext,
  deps: ViewDeps,
): void {
  for (const article of articles) {
    const articleEl = container.createDiv({
      cls:
        "rss-dashboard-article-item" +
        (ctx.selectedArticle && article.guid === ctx.selectedArticle.guid
          ? " active"
          : "") +
        (article.read ? " read" : " unread") +
        (article.starred ? " starred" : " unstarred") +
        (article.saved ? " saved" : "") +
        (article.mediaType === "video" ? " video" : "") +
        (article.mediaType === "podcast" ? " podcast" : ""),
      attr: { id: `article-${article.guid}` },
    });
    const useBottomRow =
      ctx.showListToolbar && ctx.listToolbarStyle === "bottom-row";
    const useMinimal =
      ctx.showListToolbar && ctx.listToolbarStyle === "minimal";
    if (useBottomRow) {
      articleEl.addClass("rss-dashboard-list-item-bottom-row");
    }
    const contentEl = articleEl.createDiv("rss-dashboard-article-content");
    const mainGrid = contentEl.createDiv("rss-dashboard-article-grid");
    if (ctx.showFeedSource) {
      mainGrid.addClass("rss-dashboard-list-has-source");
    }
    if (ctx.showListToolbar && !useBottomRow) {
      mainGrid.addClass("rss-dashboard-list-has-actions");
    }
    const headlineEl = mainGrid.createDiv("rss-dashboard-grid-headline");
    const titleEl = headlineEl.createDiv({
      cls: "rss-dashboard-article-title rss-dashboard-list-title",
    });
    if (ctx.highlightService && ctx.settings.highlights.highlightInTitles) {
      ctx.highlightService.setHighlightedText(titleEl, article.title);
    } else {
      titleEl.textContent = article.title;
    }
    const dateInfo = formatArticleDate(
      article.pubDate,
      ctx.settings.display.articleDateStyle ?? "relative",
    );
    if (!useBottomRow) {
      const timeEl = mainGrid.createDiv("rss-dashboard-grid-time");
      const dateEl = timeEl.createSpan("rss-dashboard-article-date");
      dateEl.textContent = dateInfo.text;
      dateEl.setAttribute("title", dateInfo.title);
    }
    const actionsEl = mainGrid.createDiv("rss-dashboard-grid-actions");
    if (ctx.showListToolbar && !useBottomRow) {
      const actionToolbar = actionsEl.createDiv(
        "rss-dashboard-action-toolbar rss-dashboard-list-toolbar",
      );
      deps.createArticleActionButtons(
        actionToolbar,
        article,
        useMinimal ? "minimal-read" : "full",
      );
      if (!useMinimal && article.tags && article.tags.length > 0) {
        const articleTags = actionToolbar.createDiv(
          "rss-dashboard-tag-container",
        );
        article.tags.forEach((tag) => {
          const tagEl = articleTags.createDiv({
            cls: "rss-dashboard-tag-badge",
            text: tag.name,
          });
          tagEl.style.setProperty(
            "--tag-color",
            tag.color || "var(--interactive-accent)",
          );
        });
      }
    } else {
      actionsEl.addClass("rss-dashboard-grid-actions-empty");
    }
    if (ctx.showFeedSource) {
      const sourceEl = mainGrid.createDiv("rss-dashboard-grid-source");
      const metaEl = sourceEl.createDiv("rss-dashboard-article-meta");
      deps.renderFeedIcon(metaEl, article.feedUrl, article.mediaType);
      const sourceSpan = metaEl.createSpan("rss-dashboard-article-source");
      sourceSpan.setText(article.feedTitle);
      sourceSpan.setAttribute("title", article.feedTitle);
    }
    if (ctx.showListToolbar && useBottomRow) {
      if (article.tags && article.tags.length > 0) {
        const bodyTags = contentEl.createDiv(
          "rss-dashboard-tag-container rss-dashboard-list-body-tags",
        );
        const tagsToShow = article.tags.slice(0, MAX_VISIBLE_TAGS);
        tagsToShow.forEach((tag) => {
          const tagEl = bodyTags.createDiv({
            cls: "rss-dashboard-tag-badge",
            text: tag.name,
          });
          tagEl.style.setProperty(
            "--tag-color",
            tag.color || "var(--interactive-accent)",
          );
        });
        if (article.tags.length > MAX_VISIBLE_TAGS) {
          const overflowTag = bodyTags.createDiv({
            cls: "rss-dashboard-tag-overflow",
            text: `+${article.tags.length - MAX_VISIBLE_TAGS}`,
          });
          overflowTag.title = article.tags
            .slice(MAX_VISIBLE_TAGS)
            .map((t) => t.name)
            .join(", ");
        }
      }

      const listFooter = contentEl.createEl("footer", {
        cls: "rss-dashboard-list-footer",
      });
      const footerToolbar = listFooter.createDiv(
        "rss-dashboard-action-toolbar rss-dashboard-list-toolbar rss-dashboard-list-toolbar-bottom-row",
      );
      deps.createArticleActionButtons(
        footerToolbar,
        article,
        useMinimal ? "minimal-read" : "full",
      );
      const footerDateEl = listFooter.createDiv({
        cls: "rss-dashboard-article-date rss-dashboard-list-footer-date",
      });
      footerDateEl.textContent = dateInfo.text;
      footerDateEl.setAttribute("title", dateInfo.title);
    }
    articleEl.addEventListener("click", () => {
      ctx.callbacks.onArticleClick(article);
    });
    articleEl.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      deps.showArticleContextMenu(e, article);
    });
  }
}
