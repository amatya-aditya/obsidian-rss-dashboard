import type { Feed, Folder, Tag } from "../types/types";
import { collectFolderPaths } from "../utils/folder-paths";

export type SidebarSearchScope = "all" | "feeds" | "folders" | "tags";

export interface SidebarSearchQuery {
  raw: string;
  term: string;
  scope: SidebarSearchScope;
}

export interface SidebarSearchMatches {
  /** Available tag rows whose names match the query prefix. */
  matchingTags: Tag[];
  /** Folder paths that match directly, not ancestors shown only for context. */
  directFolderPaths: string[];
  /** Every feed the query reaches, including feeds hidden by display settings. */
  matchingFeedUrls: Set<string>;
}

const SCOPE_PREFIXES: Record<string, SidebarSearchScope> = {
  feed: "feeds",
  feeds: "feeds",
  folder: "folders",
  folders: "folders",
  path: "folders",
  tag: "tags",
  tags: "tags",
};

export class SidebarSearchService {
  static parseQuery(rawQuery: string): SidebarSearchQuery {
    const raw = rawQuery.trim();
    if (!raw) {
      return {
        raw: "",
        term: "",
        scope: "all",
      };
    }

    const match = raw.match(/^([a-z]+)\s*:\s*(.*)$/i);
    if (!match) {
      return {
        raw,
        term: raw.toLowerCase(),
        scope: "all",
      };
    }

    const prefix = match[1]?.toLowerCase() ?? "";
    const scope = SCOPE_PREFIXES[prefix];
    if (!scope) {
      return {
        raw,
        term: raw.toLowerCase(),
        scope: "all",
      };
    }

    const term = (match[2] || "").trim().toLowerCase();
    return {
      raw,
      term: scope === "tags" ? term.replace(/^#/, "") : term,
      scope,
    };
  }

  /**
   * A plain query filters at three characters; a qualified query filters at
   * one. Blank input, a bare qualifier, and a bare tag hash are inactive.
   */
  static isActive(query: SidebarSearchQuery): boolean {
    if (!query.term) return false;
    return query.scope === "all"
      ? query.term.length >= 3
      : query.term.length >= 1;
  }

  static matchesFeed(
    query: SidebarSearchQuery,
    feedTitle: string,
    feedFolderPath = "",
  ): boolean {
    if (!query.term) return true;
    if (query.scope !== "all" && query.scope !== "feeds") return false;
    return this.matchesAllTokens([feedTitle, feedFolderPath], query.term);
  }

  static matchesFolder(
    query: SidebarSearchQuery,
    folderName: string,
    folderPath = "",
  ): boolean {
    if (!query.term) return true;
    if (query.scope !== "all" && query.scope !== "folders") return false;
    return this.matchesAllTokens([folderName, folderPath], query.term);
  }

  static matchesTag(query: SidebarSearchQuery, tagName: string): boolean {
    if (!query.term) return true;
    if (query.scope !== "all" && query.scope !== "tags") return false;
    return tagName.toLowerCase().startsWith(query.term);
  }

  /**
   * Resolves one query into the tag rows, direct folders, and distinct feeds
   * it reaches. Ancestor folders are left to the caller's rendering.
   */
  static summarize(
    query: SidebarSearchQuery,
    feeds: Feed[],
    folders: Folder[],
    availableTags: Tag[],
  ): SidebarSearchMatches {
    if (!this.isActive(query)) {
      return {
        matchingTags: [],
        directFolderPaths: [],
        matchingFeedUrls: new Set<string>(),
      };
    }

    const matchingTags =
      query.scope === "all" || query.scope === "tags"
        ? availableTags.filter((tag) => this.matchesTag(query, tag.name))
        : [];

    const directFolderPaths =
      query.scope === "all" || query.scope === "folders"
        ? collectFolderPaths(folders, { sort: false }).filter((path) => {
            const name = path.slice(path.lastIndexOf("/") + 1);
            return this.matchesFolder(query, name, path);
          })
        : [];

    const matchingFeedUrls = new Set<string>();
    for (const feed of feeds) {
      if (this.feedMatchesQuery(query, feed, directFolderPaths) && feed.url) {
        matchingFeedUrls.add(feed.url);
      }
    }

    return { matchingTags, directFolderPaths, matchingFeedUrls };
  }

  private static feedMatchesQuery(
    query: SidebarSearchQuery,
    feed: Feed,
    directFolderPaths: string[],
  ): boolean {
    const folderPath = feed.folder ?? "";
    const isInMatchedFolder = directFolderPaths.some(
      (path) => folderPath === path || folderPath.startsWith(`${path}/`),
    );

    const hasMatchingTag =
      query.scope === "all" || query.scope === "tags"
        ? feed.items.some((item) =>
            item.tags?.some((tag) => this.matchesTag(query, tag.name)),
          )
        : false;

    switch (query.scope) {
      case "tags":
        return hasMatchingTag;
      case "folders":
        return isInMatchedFolder;
      case "feeds":
        return this.matchesFeed(query, feed.title, folderPath);
      case "all":
        return (
          this.matchesFeed(query, feed.title, folderPath) ||
          hasMatchingTag ||
          isInMatchedFolder
        );
    }
  }

  private static matchesAllTokens(targets: string[], term: string): boolean {
    const haystack = targets
      .map((value) => value.toLowerCase())
      .join(" ")
      .trim();
    if (!haystack) return false;

    const tokens = term.split(/\s+/).filter((token) => token.length > 0);
    if (tokens.length === 0) return true;

    return tokens.every((token) => haystack.includes(token));
  }
}
