import { Menu, MenuItem } from "obsidian";
import type { FeedItem } from "../../../types/types";

export interface ArticleContext {
  callbacks: {
    onOpenSavedArticle?: (article: FeedItem) => Promise<void> | void;
    onOpenInReaderView?: (article: FeedItem) => void;
    onArticleUpdate?: (
      article: FeedItem,
      updates: Partial<FeedItem>,
      shouldRerender?: boolean,
    ) => void;
    onArticleSave?: (article: FeedItem) => Promise<void> | void;
    onArticleClick?: (article: FeedItem) => void;
  };
  settings: {
    articleSaving: {
      saveFullContent: boolean;
    };
  };
}

export function showArticleContextMenu(
  event: MouseEvent,
  article: FeedItem,
  ctx: ArticleContext,
): void {
  const menu = new Menu();

  if (article.saved) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Open saved article")
        .setIcon("file-text")
        .onClick(() => {
          if (ctx.callbacks.onOpenSavedArticle) {
            void ctx.callbacks.onOpenSavedArticle(article);
          }
        });
    });

    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Open in reader view")
        .setIcon("book-open")
        .onClick(() => {
          if (ctx.callbacks.onOpenInReaderView) {
            ctx.callbacks.onOpenInReaderView(article);
          }
        });
    });

    menu.addSeparator();
  }

  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Open in browser")
      .setIcon("external-link")
      .onClick(() => {
        activeWindow.open(article.link, "_blank");
      });
  });

  menu.addItem((item: MenuItem) => {
    item
      .setTitle("Open in split view")
      .setIcon("panel-left")
      .onClick(() => {
        if (ctx.callbacks.onArticleClick) {
          ctx.callbacks.onArticleClick(article);
        }
      });
  });

  menu.addSeparator();

  menu.addItem((item: MenuItem) => {
    item
      .setTitle(article.read ? "Mark as unread" : "Mark as read")
      .setIcon(article.read ? "circle" : "check-circle")
      .onClick(() => {
        ctx.callbacks.onArticleUpdate?.(
          article,
          { read: !article.read },
          false,
        );
      });
  });

  menu.addItem((item: MenuItem) => {
    item
      .setTitle(article.starred ? "Unstar articles" : "Star articles")
      .setIcon("star")
      .onClick(() => {
        ctx.callbacks.onArticleUpdate?.(
          article,
          { starred: !article.starred },
          false,
        );
      });
  });

  if (!article.saved) {
    menu.addSeparator();
    menu.addItem((item: MenuItem) => {
      item
        .setTitle(
          ctx.settings.articleSaving.saveFullContent
            ? "Save full article"
            : "Save article summary",
        )
        .setIcon("save")
        .onClick(() => {
          if (ctx.callbacks.onArticleSave) {
            void ctx.callbacks.onArticleSave(article);
          }
        });
    });
  }

  menu.showAtMouseEvent(event);
}
