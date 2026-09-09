import type { FreshRssHttpClient } from "./freshrss-connection-service";

/**
 * Read-only Google-Reader-API-compatible protocol client used by the FreshRSS
 * sync coordinator. Every remote identifier (subscription id, stream item id)
 * is treated as an opaque string — never parsed for meaning beyond equality.
 * Every method issues exactly one HTTP request; the coordinator awaits each
 * call before issuing the next, so at most one FreshRSS request is ever in
 * flight.
 */

export type FreshRssRequestOutcome<T> =
  | { outcome: "ok"; data: T }
  | { outcome: "auth-rejected" }
  | { outcome: "unavailable" };

/**
 * Outcome of a mutation-dispatch (edit-tag) request. `acknowledged` requires
 * both a successful HTTP response and a body that is exactly `OK` — transport
 * success alone is not an acknowledgment. `terminal` covers HTTP 400/404/422:
 * the request will not be retried automatically. `unavailable` covers
 * network failure, timeouts, HTTP 408/429/5xx, and a malformed/ambiguous
 * response body, all of which are safe to retry later.
 */
export type FreshRssEditTagOutcome =
  | { outcome: "acknowledged" }
  | { outcome: "auth-rejected" }
  | { outcome: "terminal" }
  | { outcome: "unavailable" };

/** Google-Reader-API stream ID for the FreshRSS system "read" state. */
export const FRESHRSS_READ_STREAM_ID = "user/-/state/com.google/read";

/** Google-Reader-API stream ID for the FreshRSS system "starred" state. */
export const FRESHRSS_STARRED_STREAM_ID = "user/-/state/com.google/starred";

export interface FreshRssSubscription {
  remoteSubscriptionId: string;
  title: string;
  url: string;
  categoryLabel: string | null;
}

export interface FreshRssItemIdsPage {
  itemRefs: string[];
  continuation: string | null;
}

/**
 * One remote tag/label/category entry as reported by FreshRSS tag discovery.
 * `kind` is `"system"` for the dedicated read/starred state streams (matched
 * by exact opaque stream ID, never inferred from label text), `"folder"`
 * when FreshRSS reports a category-shaped entry (`type: "folder"`), and
 * `"label"` for every other entry -- only `"label"` entries are eligible to
 * become dashboard tag mappings.
 */
export interface FreshRssRemoteLabel {
  remoteTagId: string;
  displayName: string;
  kind: "system" | "folder" | "label";
}

export interface FreshRssRemoteArticle {
  remoteArticleId: string;
  guid: string;
  title: string;
  link: string | null;
  content: string | null;
  author: string | null;
  publishedMs: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRejectedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function parseSubscriptionListResponse(text: string): FreshRssSubscription[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.subscriptions)) {
      return null;
    }

    const subscriptions: FreshRssSubscription[] = [];
    for (const entry of parsed.subscriptions) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
        return null;
      }
      const categories = Array.isArray(entry.categories) ? entry.categories : [];
      const firstCategory = categories.find(
        (category): category is Record<string, unknown> =>
          isRecord(category) && typeof category.label === "string" && Boolean(category.label),
      );

      subscriptions.push({
        remoteSubscriptionId: entry.id,
        title: typeof entry.title === "string" ? entry.title : entry.id,
        url: typeof entry.url === "string" ? entry.url : "",
        categoryLabel: firstCategory ? (firstCategory.label as string) : null,
      });
    }

    return subscriptions;
  } catch {
    return null;
  }
}

function classifyRemoteTagKind(
  remoteTagId: string,
  entry: Record<string, unknown>,
): FreshRssRemoteLabel["kind"] {
  if (remoteTagId === FRESHRSS_READ_STREAM_ID || remoteTagId === FRESHRSS_STARRED_STREAM_ID) {
    return "system";
  }
  if (entry.type === "folder") {
    return "folder";
  }
  return "label";
}

function parseTagListResponse(text: string): FreshRssRemoteLabel[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.tags)) {
      return null;
    }

    const labels: FreshRssRemoteLabel[] = [];
    for (const entry of parsed.tags) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
        continue;
      }
      const displayName = typeof entry.label === "string" && entry.label ? entry.label : entry.id;
      labels.push({
        remoteTagId: entry.id,
        displayName,
        kind: classifyRemoteTagKind(entry.id, entry),
      });
    }

    return labels;
  } catch {
    return null;
  }
}

function parseItemIdsResponse(text: string): FreshRssItemIdsPage | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.itemRefs)) {
      return null;
    }

    const itemRefs: string[] = [];
    for (const entry of parsed.itemRefs) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
        return null;
      }
      itemRefs.push(entry.id);
    }

    const continuation =
      typeof parsed.continuation === "string" && parsed.continuation
        ? parsed.continuation
        : null;

    return { itemRefs, continuation };
  } catch {
    return null;
  }
}

function firstHref(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const first = value.find(
    (entry): entry is Record<string, unknown> =>
      isRecord(entry) && typeof entry.href === "string" && Boolean(entry.href),
  );
  return first ? (first.href as string) : null;
}

function parseItemContentsResponse(text: string): FreshRssRemoteArticle[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.items)) {
      return null;
    }

    const articles: FreshRssRemoteArticle[] = [];
    for (const entry of parsed.items) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
        return null;
      }

      const content = isRecord(entry.content) && typeof entry.content.content === "string"
        ? entry.content.content
        : isRecord(entry.summary) && typeof entry.summary.content === "string"
          ? entry.summary.content
          : null;

      const publishedMs =
        typeof entry.published === "number" && Number.isFinite(entry.published)
          ? entry.published * 1000
          : null;

      articles.push({
        remoteArticleId: entry.id,
        guid: entry.id,
        title: typeof entry.title === "string" ? entry.title : "",
        link: firstHref(entry.alternate) ?? firstHref(entry.canonical),
        content,
        author: typeof entry.author === "string" ? entry.author : null,
        publishedMs,
      });
    }

    return articles;
  } catch {
    return null;
  }
}

export class FreshRssSyncClient {
  constructor(
    private readonly httpClient: FreshRssHttpClient,
    private readonly endpoint: string,
    private readonly authToken: string,
  ) {}

  private authHeaders(): Record<string, string> {
    return { Authorization: `GoogleLogin auth=${this.authToken}` };
  }

  public async listSubscriptions(): Promise<
    FreshRssRequestOutcome<FreshRssSubscription[]>
  > {
    try {
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/subscription/list?output=json`,
        method: "GET",
        headers: this.authHeaders(),
      });
      if (isRejectedStatus(response.status)) return { outcome: "auth-rejected" };
      if (response.status !== 200) return { outcome: "unavailable" };

      const subscriptions = parseSubscriptionListResponse(response.text);
      if (!subscriptions) return { outcome: "unavailable" };
      return { outcome: "ok", data: subscriptions };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  public async listTagLabels(): Promise<FreshRssRequestOutcome<FreshRssRemoteLabel[]>> {
    try {
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/tag/list?output=json`,
        method: "GET",
        headers: this.authHeaders(),
      });
      if (isRejectedStatus(response.status)) return { outcome: "auth-rejected" };
      if (response.status !== 200) return { outcome: "unavailable" };

      const labels = parseTagListResponse(response.text);
      if (!labels) return { outcome: "unavailable" };
      return { outcome: "ok", data: labels };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  public async listItemIds(
    remoteSubscriptionId: string,
    limit: number,
    continuation?: string | null,
  ): Promise<FreshRssRequestOutcome<FreshRssItemIdsPage>> {
    try {
      const continuationParam = continuation
        ? `&c=${encodeURIComponent(continuation)}`
        : "";
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/stream/items/ids?output=json&n=${limit}&s=${encodeURIComponent(remoteSubscriptionId)}${continuationParam}`,
        method: "GET",
        headers: this.authHeaders(),
      });
      if (isRejectedStatus(response.status)) return { outcome: "auth-rejected" };
      if (response.status !== 200) return { outcome: "unavailable" };

      const page = parseItemIdsResponse(response.text);
      if (!page) return { outcome: "unavailable" };
      return { outcome: "ok", data: page };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  public async getItemContents(
    remoteArticleIds: string[],
  ): Promise<FreshRssRequestOutcome<FreshRssRemoteArticle[]>> {
    if (remoteArticleIds.length === 0) {
      return { outcome: "ok", data: [] };
    }

    try {
      const body = [
        "output=json",
        ...remoteArticleIds.map((id) => `i=${encodeURIComponent(id)}`),
      ].join("&");
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/stream/items/contents`,
        method: "POST",
        body,
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      if (isRejectedStatus(response.status)) return { outcome: "auth-rejected" };
      if (response.status !== 200) return { outcome: "unavailable" };

      const articles = parseItemContentsResponse(response.text);
      if (!articles) return { outcome: "unavailable" };
      return { outcome: "ok", data: articles };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  /**
   * Fetches a fresh Google-Reader-API modification token (`T=` value). Must
   * be requested immediately before dispatching mutations; the coordinator
   * never reuses a token cached from the earlier connection test or a prior
   * cycle.
   */
  public async getModificationToken(): Promise<FreshRssRequestOutcome<string>> {
    try {
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/token`,
        method: "GET",
        headers: this.authHeaders(),
      });
      if (isRejectedStatus(response.status)) return { outcome: "auth-rejected" };
      if (response.status !== 200 || !response.text.trim()) {
        return { outcome: "unavailable" };
      }
      return { outcome: "ok", data: response.text.trim() };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  /**
   * Dispatches one batch facet-state mutation against one system stream
   * (`FRESHRSS_READ_STREAM_ID` or `FRESHRSS_STARRED_STREAM_ID`). `action:
   * "add"` adds the given stream tag (marks read / starred); `action:
   * "remove"` removes it (marks unread / unstarred). Only a successful
   * response whose body is exactly `OK` counts as an acknowledgment; every
   * other outcome (including a 200 with a different body) is treated as not
   * yet acknowledged so the pending record is retried or repaired instead of
   * being silently dropped.
   */
  public async editTag(
    remoteArticleIds: string[],
    action: "add" | "remove",
    streamId: string,
    modificationToken: string,
  ): Promise<FreshRssEditTagOutcome> {
    if (remoteArticleIds.length === 0) {
      return { outcome: "acknowledged" };
    }

    try {
      const tagParam = action === "add" ? "a" : "r";
      const body = [
        "output=json",
        `T=${encodeURIComponent(modificationToken)}`,
        ...remoteArticleIds.map((id) => `i=${encodeURIComponent(id)}`),
        `${tagParam}=${encodeURIComponent(streamId)}`,
      ].join("&");
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/edit-tag`,
        method: "POST",
        body,
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (isRejectedStatus(response.status)) return { outcome: "auth-rejected" };
      if (
        response.status === 400 ||
        response.status === 404 ||
        response.status === 422
      ) {
        return { outcome: "terminal" };
      }
      if (response.status !== 200) return { outcome: "unavailable" };
      if (response.text.trim() !== "OK") return { outcome: "unavailable" };
      return { outcome: "acknowledged" };
    } catch {
      return { outcome: "unavailable" };
    }
  }
}
