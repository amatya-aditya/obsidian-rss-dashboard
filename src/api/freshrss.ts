import { requestUrl, RequestUrlParam } from "obsidian";
import { Feed, FeedItem } from "../types/types";

/**
 * FreshRSS API client using the Google Reader compatible API.
 *
 * Auth flow:
 *   POST /accounts/ClientLogin  →  returns Auth token
 *   GET  /reader/api/0/token    →  returns action token (for write ops)
 *
 * Read ops use the Auth header; write ops additionally need the action token.
 */

export interface FreshRSSConfig {
  serverUrl: string;
  username: string;
  password: string;
}

interface AuthState {
  authToken: string;
  actionToken: string;
  expiresAt: number;
}

interface GReaderSubscription {
  id: string; // "feed/https://example.com/rss"
  title: string;
  categories: { id: string; label: string }[];
  url: string;
  htmlUrl: string;
  iconUrl: string;
}

interface GReaderStreamItem {
  id: string;
  title: string;
  published: number;
  updated?: number;
  canonical: { href: string }[];
  alternate?: { href: string }[];
  summary?: { content: string };
  content?: { content: string };
  author?: string;
  origin?: { streamId: string; title: string; htmlUrl: string };
  categories: string[];
  enclosure?: { href: string; type: string; length?: string }[];
}

interface GReaderStreamResponse {
  items: GReaderStreamItem[];
  continuation?: string;
}

const AUTH_TTL_MS = 23 * 60 * 60 * 1000; // refresh auth every 23h
const API_BASE = "/api/greader.php";

export class FreshRSSClient {
  private config: FreshRSSConfig;
  private auth: AuthState | null = null;

  constructor(config: FreshRSSConfig) {
    this.config = config;
  }

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

  private get baseUrl(): string {
    return this.config.serverUrl.replace(/\/+$/, "") + API_BASE;
  }

  private async request(
    path: string,
    options: Partial<RequestUrlParam> = {},
  ): Promise<string> {
    await this.ensureAuth();
    const url = `${this.baseUrl}${path}`;
    const resp = await requestUrl({
      url,
      method: options.method ?? "GET",
      headers: {
        Authorization: `GoogleLogin auth=${this.auth!.authToken}`,
        ...((options.headers as Record<string, string>) ?? {}),
      },
      body: options.body as string | undefined,
      contentType: options.contentType,
    });
    return resp.text;
  }

  private async requestJson<T>(
    path: string,
    options: Partial<RequestUrlParam> = {},
  ): Promise<T> {
    const text = await this.request(
      path + (path.includes("?") ? "&" : "?") + "output=json",
      options,
    );
    return JSON.parse(text) as T;
  }

  private async postAction(
    path: string,
    params: Record<string, string>,
  ): Promise<string> {
    await this.ensureAuth();
    const actionToken = await this.getActionToken();
    const body = new URLSearchParams({ ...params, T: actionToken }).toString();
    return this.request(path, {
      method: "POST",
      body,
      contentType: "application/x-www-form-urlencoded",
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Authentication                                                     */
  /* ------------------------------------------------------------------ */

  private async ensureAuth(): Promise<void> {
    if (this.auth && Date.now() < this.auth.expiresAt) return;
    await this.login();
  }

  async login(): Promise<void> {
    const url = `${this.baseUrl}/accounts/ClientLogin`;
    const body = new URLSearchParams({
      Email: this.config.username,
      Passwd: this.config.password,
    }).toString();

    const resp = await requestUrl({
      url,
      method: "POST",
      body,
      contentType: "application/x-www-form-urlencoded",
    });

    const text = resp.text;
    const authMatch = text.match(/Auth=(.+)/);
    if (!authMatch) {
      throw new Error("FreshRSS login failed — no Auth token in response");
    }

    this.auth = {
      authToken: authMatch[1].trim(),
      actionToken: "",
      expiresAt: Date.now() + AUTH_TTL_MS,
    };
  }

  private async getActionToken(): Promise<string> {
    if (this.auth?.actionToken) return this.auth.actionToken;
    const token = await this.request("/reader/api/0/token");
    if (this.auth) this.auth.actionToken = token.trim();
    return token.trim();
  }

  /** Test connection — returns true if login succeeds. */
  async testConnection(): Promise<boolean> {
    try {
      await this.login();
      return true;
    } catch {
      return false;
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Subscriptions (feeds)                                              */
  /* ------------------------------------------------------------------ */

  async getSubscriptions(): Promise<GReaderSubscription[]> {
    const data = await this.requestJson<{
      subscriptions: GReaderSubscription[];
    }>("/reader/api/0/subscription/list");
    return data.subscriptions;
  }

  async addSubscription(feedUrl: string, folder?: string): Promise<void> {
    const params: Record<string, string> = {
      ac: "subscribe",
      s: `feed/${feedUrl}`,
    };
    if (folder) {
      params.a = `user/-/label/${folder}`;
    }
    await this.postAction("/reader/api/0/subscription/edit", params);
  }

  async removeSubscription(feedUrl: string): Promise<void> {
    await this.postAction("/reader/api/0/subscription/edit", {
      ac: "unsubscribe",
      s: `feed/${feedUrl}`,
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Stream contents (articles)                                         */
  /* ------------------------------------------------------------------ */

  async getStreamContents(
    streamId: string,
    count = 50,
    continuation?: string,
  ): Promise<GReaderStreamResponse> {
    let path = `/reader/api/0/stream/contents/${encodeURIComponent(streamId)}?n=${count}`;
    if (continuation) path += `&c=${continuation}`;
    return this.requestJson<GReaderStreamResponse>(path);
  }

  async getAllItems(count = 200): Promise<GReaderStreamResponse> {
    return this.getStreamContents(
      "user/-/state/com.google/reading-list",
      count,
    );
  }

  async getUnreadItems(count = 200): Promise<GReaderStreamResponse> {
    let path = `/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=${count}&xt=user/-/state/com.google/read`;
    return this.requestJson<GReaderStreamResponse>(path);
  }

  async getStarredItems(count = 200): Promise<GReaderStreamResponse> {
    return this.getStreamContents(
      "user/-/state/com.google/starred",
      count,
    );
  }

  async getFeedItems(
    feedUrl: string,
    count = 50,
  ): Promise<GReaderStreamResponse> {
    return this.getStreamContents(`feed/${feedUrl}`, count);
  }

  /* ------------------------------------------------------------------ */
  /*  Item state mutations                                               */
  /* ------------------------------------------------------------------ */

  async markAsRead(itemIds: string[]): Promise<void> {
    for (const id of itemIds) {
      await this.postAction("/reader/api/0/edit-tag", {
        i: id,
        a: "user/-/state/com.google/read",
      });
    }
  }

  async markAsUnread(itemIds: string[]): Promise<void> {
    for (const id of itemIds) {
      await this.postAction("/reader/api/0/edit-tag", {
        i: id,
        r: "user/-/state/com.google/read",
      });
    }
  }

  async starItem(itemId: string): Promise<void> {
    await this.postAction("/reader/api/0/edit-tag", {
      i: itemId,
      a: "user/-/state/com.google/starred",
    });
  }

  async unstarItem(itemId: string): Promise<void> {
    await this.postAction("/reader/api/0/edit-tag", {
      i: itemId,
      r: "user/-/state/com.google/starred",
    });
  }

  async markFeedAsRead(feedUrl: string): Promise<void> {
    await this.postAction("/reader/api/0/mark-all-as-read", {
      s: `feed/${feedUrl}`,
      ts: String(Date.now() * 1000), // microseconds
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Categories / labels (folders)                                      */
  /* ------------------------------------------------------------------ */

  async getCategories(): Promise<{ id: string; label: string }[]> {
    const data = await this.requestJson<{
      tags: { id: string; type?: string }[];
    }>("/reader/api/0/tag/list");

    return data.tags
      .filter((t) => t.id.includes("/label/"))
      .map((t) => ({
        id: t.id,
        label: t.id.replace(/^user\/-\/label\//, ""),
      }));
  }

  /* ------------------------------------------------------------------ */
  /*  Conversion helpers — map GReader data to plugin types              */
  /* ------------------------------------------------------------------ */

  /**
   * Convert a GReader stream item to the plugin's FeedItem format.
   * The `existingItems` map is keyed by guid and used to preserve
   * local state (tags, saved, savedFilePath) across syncs.
   */
  streamItemToFeedItem(
    item: GReaderStreamItem,
    existingItems?: Map<string, FeedItem>,
  ): FeedItem {
    const link =
      item.canonical?.[0]?.href ??
      item.alternate?.[0]?.href ??
      "";
    const guid = item.id;
    const feedUrl = item.origin?.streamId?.replace(/^feed\//, "") ?? "";
    const feedTitle = item.origin?.title ?? "";

    const isRead = item.categories.some((c) =>
      c.includes("state/com.google/read"),
    );
    const isStarred = item.categories.some((c) =>
      c.includes("state/com.google/starred"),
    );

    const existing = existingItems?.get(guid);

    const description =
      item.summary?.content ?? item.content?.content ?? "";
    const content = item.content?.content ?? item.summary?.content ?? "";

    // Extract first image from content for cover
    let coverImage = "";
    const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (imgMatch) coverImage = imgMatch[1];

    // Handle enclosures
    let enclosure: FeedItem["enclosure"] | undefined;
    if (item.enclosure && item.enclosure.length > 0) {
      const enc = item.enclosure[0];
      enclosure = {
        url: enc.href,
        type: enc.type,
        length: enc.length ?? "0",
      };
      // Use image enclosure as cover fallback
      if (!coverImage && enc.type?.startsWith("image/")) {
        coverImage = enc.href;
      }
    }

    return {
      title: item.title ?? "Untitled",
      link,
      description: this.stripHtml(description).slice(0, 500),
      pubDate: new Date(item.published * 1000).toISOString(),
      guid,
      read: isRead,
      starred: isStarred,
      tags: existing?.tags ?? [],
      feedTitle,
      feedUrl,
      coverImage,
      author: item.author,
      content,
      summary: this.stripHtml(description).slice(0, 300),
      saved: existing?.saved ?? false,
      savedFilePath: existing?.savedFilePath,
      enclosure,
    };
  }

  /**
   * Convert GReader subscriptions to the plugin's Feed format,
   * merging with existing feeds to preserve local items/state.
   */
  subscriptionsToFeeds(
    subs: GReaderSubscription[],
    existingFeeds: Feed[],
  ): Feed[] {
    const existingMap = new Map(existingFeeds.map((f) => [f.url, f]));

    return subs.map((sub) => {
      const feedUrl = sub.url || sub.id.replace(/^feed\//, "");
      const existing = existingMap.get(feedUrl);
      const folder =
        sub.categories.length > 0
          ? sub.categories[0].label
          : "Uncategorized";

      return {
        title: sub.title,
        url: feedUrl,
        folder,
        items: existing?.items ?? [],
        lastUpdated: existing?.lastUpdated ?? 0,
        author: existing?.author,
        mediaType: existing?.mediaType,
        autoDetect: existing?.autoDetect ?? true,
        customTemplate: existing?.customTemplate,
        customFolder: existing?.customFolder,
        customTags: existing?.customTags,
        autoDeleteDuration: existing?.autoDeleteDuration,
        maxItemsLimit: existing?.maxItemsLimit,
        scanInterval: existing?.scanInterval,
        iconUrl: sub.iconUrl || existing?.iconUrl,
        filters: existing?.filters,
      };
    });
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }
}
