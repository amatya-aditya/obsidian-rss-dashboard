import { Menu, MenuItem, Notice } from "obsidian";
import type { FeedItem, SaveVersion } from "../../../types/types";
import { addSaveOptionItems, type CustomSaveHooks } from "./save-options-menu";
import type { CoverImageAction } from "./cover-image-action";

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
    onArticleCustomSave?: (
      article: FeedItem,
      hooks: CustomSaveHooks,
    ) => Promise<void> | void;
    onArticleClick?: (article: FeedItem) => void;
    /**
     * Fetches the article page's cover image (#1314). Resolves true when a
     * usable image was stored on the article, false otherwise.
     */
    onFetchCoverImage?: (article: FeedItem) => Promise<boolean>;
    /**
     * Puts the feed's own cover image back, locally and with no request
     * (#1330). Resolves true when the article was rewritten.
     */
    onRestoreCoverImage?: (article: FeedItem) => Promise<boolean>;
    /** Rebuilds whatever rendered the article, once its cover changed. */
    onCoverImageChanged?: (article: FeedItem) => void;
  };
  /**
   * The cover-image action this article is offered, already resolved by the
   * view's single helper (#1330): its label, icon and role, or absent when the
   * surface offers none.
   */
  coverImageAction?: CoverImageAction;
  settings: {
    articleSaving: {
      saveVersion: SaveVersion;
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

  if (article.link) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Open in browser")
        .setIcon("external-link")
        .onClick(() => {
          activeWindow.open(article.link, "_blank");
        });
    });
  }

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

  if (article.link) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Copy article URL")
        .setIcon("link")
        .onClick(() => {
          void navigator.clipboard.writeText(article.link);
          new Notice("Article URL copied to clipboard");
        });
    });
  }

  if (article.feedUrl) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle("Copy feed URL")
        .setIcon("rss")
        .onClick(() => {
          void navigator.clipboard.writeText(article.feedUrl);
          new Notice("Feed URL copied to clipboard");
        });
    });
  }

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

  const coverAction = ctx.coverImageAction;
  const runCoverAction =
    coverAction?.role === "restore"
      ? ctx.callbacks.onRestoreCoverImage
      : ctx.callbacks.onFetchCoverImage;
  if (coverAction && runCoverAction) {
    menu.addItem((item: MenuItem) => {
      item
        .setTitle(coverAction.label)
        .setIcon(coverAction.icon)
        .onClick(() => {
          void runCoverAction(article).then((changed) => {
            if (changed) ctx.callbacks.onCoverImageChanged?.(article);
          });
        });
    });
  }

  if (!article.saved) {
    menu.addSeparator();
    addSaveOptionItems(menu, {
      onDefaultSave: () => {
        if (ctx.callbacks.onArticleSave) {
          void ctx.callbacks.onArticleSave(article);
        }
      },
      onCustomSave: () => {
        if (ctx.callbacks.onArticleCustomSave) {
          void ctx.callbacks.onArticleCustomSave(article, {
            onSavingChange: () => {},
          });
        }
      },
    });
  }

  menu.showAtMouseEvent(event);
}
