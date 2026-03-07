export type SidebarSearchScope = "all" | "feeds" | "folders" | "tags";

export interface SidebarSearchQuery {
  raw: string;
  term: string;
  scope: SidebarSearchScope;
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

    const prefix = match[1].toLowerCase();
    const scope = SCOPE_PREFIXES[prefix];
    if (!scope) {
      return {
        raw,
        term: raw.toLowerCase(),
        scope: "all",
      };
    }

    return {
      raw,
      term: (match[2] || "").trim().toLowerCase(),
      scope,
    };
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
    return this.matchesAllTokens([tagName], query.term);
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

