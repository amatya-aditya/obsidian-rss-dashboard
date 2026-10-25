import { isRecord, isRejectedStatus } from "./freshrss-type-guards";
import type { FreshRssHttpClient } from "./freshrss-connection-service";

/** One outcome shape shared by every read-only FreshRSS API call. */
export type FreshRssRequestOutcome<T> =
  | { outcome: "ok"; data: T }
  | { outcome: "auth-rejected" }
  | { outcome: "unavailable" };

export type FreshRssMutationOutcome =
  | { outcome: "ok"; data: void }
  | { outcome: "auth-rejected" }
  | { outcome: "terminal-error"; status: 400 | 404 | 422 }
  | { outcome: "unavailable" };

export interface FreshRssSubscription {
  remoteSubscriptionId: string;
  title: string;
  url: string;
  categoryLabel: string | null;
}

export interface FreshRssLabel {
  remoteLabelId: string;
  name: string;
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
  read: boolean | null;
}

function parseSubscriptionListResponse(
  text: string,
): FreshRssSubscription[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.subscriptions)) {
      return null;
    }

    const subscriptions: FreshRssSubscription[] = [];
    for (const entry of parsed.subscriptions) {
      if (
        !isRecord(entry) ||
        typeof entry.id !== "string" ||
        !entry.id ||
        typeof entry.url !== "string" ||
        !entry.url.trim()
      ) {
        return null;
      }
      const categories = Array.isArray(entry.categories)
        ? entry.categories
        : [];
      const firstCategory = categories.find(
        (category): category is Record<string, unknown> =>
          isRecord(category) &&
          typeof category.label === "string" &&
          Boolean(category.label),
      );

      subscriptions.push({
        remoteSubscriptionId: entry.id,
        title: typeof entry.title === "string" ? entry.title : entry.id,
        url: entry.url,
        categoryLabel:
          firstCategory && typeof firstCategory.label === "string"
            ? firstCategory.label
            : null,
      });
    }

    return subscriptions;
  } catch {
    return null;
  }
}

function parseItemIdsResponse(
  text: string,
  limit: number,
): FreshRssItemIdsPage | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.itemRefs)) return null;

    const itemRefs: string[] = [];
    for (const entry of parsed.itemRefs) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
        return null;
      }
      itemRefs.push(entry.id);
    }

    if (
      parsed.continuation !== undefined &&
      parsed.continuation !== null &&
      (typeof parsed.continuation !== "string" ||
        parsed.continuation.length === 0)
    ) {
      return null;
    }

    return {
      itemRefs: itemRefs.slice(0, Math.max(0, Math.floor(limit))),
      continuation:
        typeof parsed.continuation === "string" && parsed.continuation
          ? parsed.continuation
          : null,
    };
  } catch {
    return null;
  }
}

function parseLabelListResponse(text: string): FreshRssLabel[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.tags)) return null;
    const labels: FreshRssLabel[] = [];
    for (const entry of parsed.tags) {
      if (!isRecord(entry) || typeof entry.id !== "string") return null;
      if (!entry.id.startsWith("user/-/label/")) continue;
      let name = typeof entry.label === "string" ? entry.label.trim() : "";
      if (!name) {
        const encodedName = entry.id.slice("user/-/label/".length);
        try {
          name = decodeURIComponent(encodedName).trim();
        } catch {
          name = encodedName.trim();
        }
      }
      if (!name) continue;
      labels.push({ remoteLabelId: entry.id, name });
    }
    return labels;
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
  return first && typeof first.href === "string" ? first.href : null;
}

function parseItemContentsResponse(
  text: string,
): FreshRssRemoteArticle[] | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !Array.isArray(parsed.items)) return null;

    const articles: FreshRssRemoteArticle[] = [];
    for (const entry of parsed.items) {
      if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) {
        return null;
      }

      const content =
        isRecord(entry.content) && typeof entry.content.content === "string"
          ? entry.content.content
          : isRecord(entry.summary) && typeof entry.summary.content === "string"
            ? entry.summary.content
            : null;
      const candidatePublishedMs =
        typeof entry.published === "number" && Number.isFinite(entry.published)
          ? entry.published * 1000
          : null;
      const publishedMs =
        candidatePublishedMs !== null &&
        Number.isFinite(new Date(candidatePublishedMs).getTime())
          ? candidatePublishedMs
          : null;

      articles.push({
        remoteArticleId: entry.id,
        guid: entry.id,
        title: typeof entry.title === "string" ? entry.title : "",
        link: firstHref(entry.alternate) ?? firstHref(entry.canonical),
        content,
        author: typeof entry.author === "string" ? entry.author : null,
        publishedMs,
        read: Array.isArray(entry.categories)
          ? entry.categories.some((category) =>
              typeof category === "string"
                ? category === "user/-/state/com.google/read"
                : isRecord(category) &&
                  category.id === "user/-/state/com.google/read",
            )
          : null,
      });
    }

    return articles;
  } catch {
    return null;
  }
}

/**
 * Read-only Google Reader API client. Remote IDs are opaque strings, and each
 * method makes one request so its caller controls request ordering.
 */
export class FreshRssSyncClient {
  constructor(
    private readonly httpClient: FreshRssHttpClient,
    private readonly endpoint: string,
    private readonly authToken: string,
    private readonly signal?: AbortSignal,
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
        ...(this.signal ? { signal: this.signal } : {}),
      });
      if (isRejectedStatus(response.status))
        return { outcome: "auth-rejected" };
      if (response.status !== 200) return { outcome: "unavailable" };

      const subscriptions = parseSubscriptionListResponse(response.text);
      return subscriptions
        ? { outcome: "ok", data: subscriptions }
        : { outcome: "unavailable" };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  public async listLabels(): Promise<FreshRssRequestOutcome<FreshRssLabel[]>> {
    try {
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/tag/list?output=json`,
        method: "GET",
        headers: this.authHeaders(),
        ...(this.signal ? { signal: this.signal } : {}),
      });
      if (isRejectedStatus(response.status))
        return { outcome: "auth-rejected" };
      if (response.status !== 200) return { outcome: "unavailable" };
      const labels = parseLabelListResponse(response.text);
      return labels
        ? { outcome: "ok", data: labels }
        : { outcome: "unavailable" };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  public async listItemIds(
    remoteSubscriptionId: string,
    limit: number,
    continuation: string | null = null,
  ): Promise<FreshRssRequestOutcome<FreshRssItemIdsPage>> {
    try {
      const continuationParameter = continuation
        ? `&c=${encodeURIComponent(continuation)}`
        : "";
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/stream/items/ids?output=json&n=${limit}&s=${encodeURIComponent(remoteSubscriptionId)}${continuationParameter}`,
        method: "GET",
        headers: this.authHeaders(),
        ...(this.signal ? { signal: this.signal } : {}),
      });
      if (isRejectedStatus(response.status))
        return { outcome: "auth-rejected" };
      if (response.status !== 200) return { outcome: "unavailable" };

      const page = parseItemIdsResponse(response.text, limit);
      return page ? { outcome: "ok", data: page } : { outcome: "unavailable" };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  public async getItemContents(
    remoteArticleIds: string[],
  ): Promise<FreshRssRequestOutcome<FreshRssRemoteArticle[]>> {
    if (remoteArticleIds.length === 0) return { outcome: "ok", data: [] };

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
        ...(this.signal ? { signal: this.signal } : {}),
      });
      if (isRejectedStatus(response.status))
        return { outcome: "auth-rejected" };
      if (response.status !== 200) return { outcome: "unavailable" };

      const articles = parseItemContentsResponse(response.text);
      return articles
        ? { outcome: "ok", data: articles }
        : { outcome: "unavailable" };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  public async getModificationToken(): Promise<FreshRssRequestOutcome<string>> {
    try {
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/token`,
        method: "GET",
        headers: this.authHeaders(),
        ...(this.signal ? { signal: this.signal } : {}),
      });
      if (isRejectedStatus(response.status))
        return { outcome: "auth-rejected" };
      if (response.status !== 200 || !response.text.trim())
        return { outcome: "unavailable" };
      return { outcome: "ok", data: response.text.trim() };
    } catch {
      return { outcome: "unavailable" };
    }
  }

  public async updateReadState(
    remoteArticleIds: string[],
    read: boolean,
    modificationToken: string,
  ): Promise<FreshRssMutationOutcome> {
    return this.updateArticleState(
      remoteArticleIds,
      [read ? "user/-/state/com.google/read" : ""].filter(Boolean),
      [read ? "" : "user/-/state/com.google/read"].filter(Boolean),
      modificationToken,
    );
  }

  public async updateArticleState(
    remoteArticleIds: string[],
    addTags: string[],
    removeTags: string[],
    modificationToken: string,
  ): Promise<FreshRssMutationOutcome> {
    if (remoteArticleIds.length === 0)
      return { outcome: "ok", data: undefined };

    const params = new URLSearchParams();
    params.set("T", modificationToken);
    remoteArticleIds.forEach((id) => params.append("i", id));
    addTags.forEach((tag) => params.append("a", tag));
    removeTags.forEach((tag) => params.append("r", tag));

    try {
      const response = await this.httpClient.request({
        url: `${this.endpoint}/reader/api/0/edit-tag`,
        method: "POST",
        body: params.toString(),
        headers: {
          ...this.authHeaders(),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        ...(this.signal ? { signal: this.signal } : {}),
      });
      if (isRejectedStatus(response.status))
        return { outcome: "auth-rejected" };
      switch (response.status) {
        case 400:
        case 404:
        case 422:
          return { outcome: "terminal-error", status: response.status };
      }
      if (response.status !== 200 || response.text.trim() !== "OK")
        return { outcome: "unavailable" };
      return { outcome: "ok", data: undefined };
    } catch {
      return { outcome: "unavailable" };
    }
  }
}
