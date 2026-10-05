import type { Feed, FeedItem, RssDashboardSettings } from "../types/types";
import { getEffectiveDateMs } from "./feed-parser/feed-retention.js";

export interface ArticleScopeState {
  readonly currentFeed: Feed | null;
  readonly currentFolder: string | null;
  readonly selectedFolders: readonly string[];
  readonly selectedFeeds: readonly string[];
  readonly selectedTags: readonly string[];
  readonly settings: Readonly<{
    feeds: readonly Feed[];
    sidebarTagFilterMode: RssDashboardSettings["sidebarTagFilterMode"];
    articleFilter: Readonly<RssDashboardSettings["articleFilter"]>;
    useFirstSeenDateFallback: boolean;
  }>;
  readonly getAllDescendantFolders: (path: string) => string[];
}

export function getFilteredArticleScope(state: ArticleScopeState): FeedItem[] {
  let articles = getFilteredPool(state);

  if (state.selectedTags.length > 0) {
    const mode = state.settings.sidebarTagFilterMode || "or";
    articles = articles.filter((item) => {
      const itemTags = (item.tags ?? []).map((t) => t.name);
      if (mode === "or") {
        return state.selectedTags.some((tag) => itemTags.includes(tag));
      } else if (mode === "and") {
        return state.selectedTags.every((tag) => itemTags.includes(tag));
      } else if (mode === "not") {
        return !state.selectedTags.some((tag) => itemTags.includes(tag));
      }
      return false;
    });
  }

  return articles;
}

function getFilteredPool(state: ArticleScopeState): FeedItem[] {
  let articles: FeedItem[] = [];

  if (state.currentFeed) {
    const currentFeed = state.currentFeed;
    articles = state.currentFeed.items.map((item) => ({
      ...item,
      feedTitle: item.feedTitle || currentFeed.title,
      feedUrl: item.feedUrl || currentFeed.url,
    }));
  } else if (
    (state.selectedFolders && state.selectedFolders.length > 0) ||
    (state.selectedFeeds && state.selectedFeeds.length > 0)
  ) {
    const allFolders = new Set<string>();
    if (state.selectedFolders) {
      for (const path of state.selectedFolders) {
        allFolders.add(path);
        for (const f of state.getAllDescendantFolders(path)) {
          allFolders.add(f);
        }
      }
    }
    for (const feed of state.settings.feeds) {
      if (
        (feed.folder && allFolders.has(feed.folder)) ||
        (state.selectedFeeds && state.selectedFeeds.includes(feed.url))
      ) {
        articles = articles.concat(
          feed.items.map((item) => ({
            ...item,
            feedTitle: feed.title,
            feedUrl: feed.url,
          })),
        );
      }
    }
  } else if (state.currentFolder) {
    articles = getFilteredFolderPool(state, state.currentFolder);
  } else {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(
        feed.items.map((item) => ({
          ...item,
          feedTitle: feed.title,
          feedUrl: feed.url,
        })),
      );
    }
  }

  return articles;
}

function getFilteredFolderPool(
  state: ArticleScopeState,
  currentFolder: string,
): FeedItem[] {
  let articles: FeedItem[] = [];
  const specialFolders = [
    "read",
    "unread",
    "starred",
    "saved",
    "videos",
    "podcasts",
  ];
  if (specialFolders.includes(currentFolder)) {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(
        feed.items
          .filter((item) => {
            if (currentFolder === "starred") return item.starred;
            if (currentFolder === "unread") return !item.read;
            if (currentFolder === "read") return item.read;
            if (currentFolder === "saved") return item.saved;
            if (currentFolder === "videos") return item.mediaType === "video";
            if (currentFolder === "podcasts")
              return item.mediaType === "podcast";
            return true;
          })
          .map((item) => ({
            ...item,
            feedTitle: feed.title,
            feedUrl: feed.url,
          })),
      );
    }
  } else {
    const allFolders = state.getAllDescendantFolders(currentFolder);
    allFolders.push(currentFolder);
    for (const feed of state.settings.feeds) {
      if (feed.folder && allFolders.includes(feed.folder)) {
        articles = articles.concat(
          feed.items.map((item) => ({
            ...item,
            feedTitle: feed.title,
            feedUrl: feed.url,
          })),
        );
      }
    }
  }
  return articles;
}

export function getUnfilteredArticleScope(
  state: ArticleScopeState,
): FeedItem[] {
  let articles = getUnfilteredPool(state);

  if (state.selectedTags.length > 0) {
    const mode = state.settings.sidebarTagFilterMode || "or";
    articles = articles.filter((item) => {
      const itemTags = (item.tags ?? []).map((t) => t.name);
      if (mode === "or") {
        return state.selectedTags.some((tag) => itemTags.includes(tag));
      } else if (mode === "and") {
        return state.selectedTags.every((tag) => itemTags.includes(tag));
      } else if (mode === "not") {
        return !state.selectedTags.some((tag) => itemTags.includes(tag));
      }
      return false;
    });
  }

  return articles;
}

function getUnfilteredPool(state: ArticleScopeState): FeedItem[] {
  let articles: FeedItem[] = [];

  if (state.currentFeed) {
    const currentFeed = state.currentFeed;
    articles = state.currentFeed.items.map((item) => ({
      ...item,
      feedTitle: item.feedTitle || currentFeed.title,
      feedUrl: item.feedUrl || currentFeed.url,
    }));
  } else if (
    (state.selectedFolders && state.selectedFolders.length > 0) ||
    (state.selectedFeeds && state.selectedFeeds.length > 0)
  ) {
    const allFolders = new Set<string>();
    if (state.selectedFolders) {
      for (const path of state.selectedFolders) {
        allFolders.add(path);
        for (const f of state.getAllDescendantFolders(path)) {
          allFolders.add(f);
        }
      }
    }
    for (const feed of state.settings.feeds) {
      if (
        (feed.folder && allFolders.has(feed.folder)) ||
        (state.selectedFeeds && state.selectedFeeds.includes(feed.url))
      ) {
        articles = articles.concat(
          feed.items.map((item) => ({
            ...item,
            feedTitle: feed.title,
            feedUrl: feed.url,
          })),
        );
      }
    }
  } else if (state.currentFolder) {
    articles = getUnfilteredFolderPool(state, state.currentFolder);
  } else {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(
        feed.items.map((item) => ({
          ...item,
          feedTitle: feed.title,
          feedUrl: feed.url,
        })),
      );
    }
  }

  return articles;
}

function getUnfilteredFolderPool(
  state: ArticleScopeState,
  currentFolder: string,
): FeedItem[] {
  let articles: FeedItem[] = [];
  const specialFolders = [
    "read",
    "unread",
    "starred",
    "saved",
    "videos",
    "podcasts",
  ];
  if (specialFolders.includes(currentFolder)) {
    // Special folders are view filters, not scope reducers, for empty-state
    // detection. Keep the full article pool here so the empty state can
    // explain that items exist but none match the active view filter.
    for (const feed of state.settings.feeds) {
      articles = articles.concat(
        feed.items.map((item) => ({
          ...item,
          feedTitle: feed.title,
          feedUrl: feed.url,
        })),
      );
    }
  } else {
    const allFolders = state.getAllDescendantFolders(currentFolder);
    allFolders.push(currentFolder);
    for (const feed of state.settings.feeds) {
      if (feed.folder && allFolders.includes(feed.folder)) {
        articles = articles.concat(
          feed.items.map((item) => ({
            ...item,
            feedTitle: feed.title,
            feedUrl: feed.url,
          })),
        );
      }
    }
  }
  return articles;
}

export function getTotalArticleScopeCount(state: ArticleScopeState): number {
  if (state.currentFeed) {
    return state.currentFeed.items.length;
  }

  let articles = getTotalScopePool(state);
  if (
    state.settings.articleFilter.type === "age" &&
    typeof state.settings.articleFilter.value === "number" &&
    state.settings.articleFilter.value > 0
  ) {
    const maxAge = Date.now() - state.settings.articleFilter.value;
    articles = articles.filter(
      (a) =>
        getEffectiveDateMs(a, state.settings.useFirstSeenDateFallback) > maxAge,
    );
  }

  return articles.length;
}

function getTotalScopePool(state: ArticleScopeState): FeedItem[] {
  let articles: FeedItem[] = [];
  const specialFolders = [
    "starred",
    "unread",
    "read",
    "saved",
    "videos",
    "podcasts",
  ];
  if (state.currentFolder && specialFolders.includes(state.currentFolder)) {
    articles = getSpecialTotalPool(state);
  } else if (state.selectedTags.length > 0) {
    const mode = state.settings.sidebarTagFilterMode || "or";
    for (const feed of state.settings.feeds) {
      articles = articles.concat(
        feed.items.filter((item) => {
          const itemTags = (item.tags ?? []).map((t) => t.name);
          if (mode === "or") {
            return state.selectedTags.some((tag) => itemTags.includes(tag));
          } else if (mode === "and") {
            return state.selectedTags.every((tag) => itemTags.includes(tag));
          } else if (mode === "not") {
            return !state.selectedTags.some((tag) => itemTags.includes(tag));
          }
          return false;
        }),
      );
    }
  } else if (state.currentFolder) {
    const allFolders = state.getAllDescendantFolders(state.currentFolder);
    for (const feed of state.settings.feeds) {
      if (feed.folder && allFolders.includes(feed.folder)) {
        articles = articles.concat(feed.items);
      }
    }
  } else {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(feed.items);
    }
  }

  return articles;
}

function getSpecialTotalPool(state: ArticleScopeState): FeedItem[] {
  let articles: FeedItem[] = [];
  if (state.currentFolder === "starred") {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(feed.items.filter((item) => item.starred));
    }
  } else if (state.currentFolder === "unread") {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(feed.items.filter((item) => !item.read));
    }
  } else if (state.currentFolder === "read") {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(feed.items.filter((item) => item.read));
    }
  } else if (state.currentFolder === "saved") {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(feed.items.filter((item) => item.saved));
    }
  } else if (state.currentFolder === "videos") {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(
        feed.items.filter((item) => item.mediaType === "video"),
      );
    }
  } else if (state.currentFolder === "podcasts") {
    for (const feed of state.settings.feeds) {
      articles = articles.concat(
        feed.items.filter((item) => item.mediaType === "podcast"),
      );
    }
  }
  return articles;
}
