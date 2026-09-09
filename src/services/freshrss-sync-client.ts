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

function parseTagListResponse(text: string): Map<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.tags)) {
      return null;
    }

    const labelsById = new Map<string, string>();
    for (const entry of parsed.tags) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
        continue;
      }
      if (typeof entry.label === "string" && entry.label) {
        labelsById.set(entry.id, entry.label);
      }
    }

    return labelsById;
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

  public async listTagLabels(): Promise<FreshRssRequestOutcome<Map<string, string>>> {
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
  ): Promise<FreshRssRequestOutcome<FreshRssItemIdsPage>> {
    try {
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/stream/items/ids?output=json&n=${limit}&s=${encodeURIComponent(remoteSubscriptionId)}`,
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
}
