import type { Feed, FeedItem, RssDashboardSettings } from "../types/types";
import { mergeFeedHistoryItems, applyFeedRetentionLimits } from "./feed-parser";
import { normalizeUrlForComparison } from "../utils/url-utils";
import type { DataSyncLeaseOwner } from "./data-sync-lease";
import {
  authenticateFreshRss,
  type FreshRssConnectionScope,
  type FreshRssCredentialBundle,
  type FreshRssHttpClient,
} from "./freshrss-connection-service";
import { FreshRssSyncClient, type FreshRssSubscription } from "./freshrss-sync-client";
import {
  FreshRssSidecarRepository,
  type FreshRssArticleBinding,
  type FreshRssFeedBinding,
  type FreshRssSyncCheckpoint,
} from "./freshrss-sidecar-repository";

/** Bounded per-subscription page size for a manual sync cycle. */
export const FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION = 50;

export interface DashboardViewLike {
  render(): void;
  refreshSidebarOnly?: () => void;
  refresh?: () => void;
}

export type FreshRssSyncOutcome =
  | {
      outcome: "synced";
      createdFeedCount: number;
      linkedFeedCount: number;
      ambiguousSubscriptionCount: number;
      importedArticleCount: number;
      partial: boolean;
    }
  | { outcome: "credentials-rejected" }
  | { outcome: "server-unavailable" };

export interface FreshRssSyncRunInput {
  endpoint: string;
  credentials: FreshRssCredentialBundle;
  scope: FreshRssConnectionScope;
  owner: DataSyncLeaseOwner;
}

export interface FreshRssSyncCoordinatorDeps {
  httpClient: FreshRssHttpClient;
  getSettings: () => RssDashboardSettings;
  saveSettings: () => Promise<void>;
  sidecarRepository: FreshRssSidecarRepository;
  getView: () => Promise<DashboardViewLike | null>;
}

function createFeedId(): string {
  const randomUuid = window.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `feed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toFeedItem(article: {
  remoteArticleId: string;
  guid: string;
  title: string;
  link: string | null;
  content: string | null;
  author: string | null;
  publishedMs: number | null;
}, feed: Feed): FeedItem {
  return {
    title: article.title,
    link: article.link ?? "",
    description: article.content ?? "",
    pubDate: article.publishedMs
      ? new Date(article.publishedMs).toISOString()
      : new Date().toISOString(),
    guid: article.guid,
    feedTitle: feed.title,
    feedUrl: feed.url,
    coverImage: "",
    content: article.content ?? undefined,
    author: article.author ?? undefined,
  };
}

async function refreshViewOnce(getView: () => Promise<DashboardViewLike | null>): Promise<void> {
  const view = await getView();
  if (!view) return;
  if (view.refreshSidebarOnly) {
    view.refreshSidebarOnly();
    return;
  }
  if (view.refresh) {
    view.refresh();
    return;
  }
  view.render();
}

/**
 * Reads a connected FreshRSS account, links or creates FreshRSS-backed local
 * feeds, imports a bounded set of recent articles per subscription through
 * the existing content pipeline, and persists opaque bindings/checkpoints in
 * the sidecar. Never treats remote absence as local deletion, never touches
 * local-only feeds/articles, and never advances a checkpoint for a partial or
 * failed read.
 */
export class FreshRssSyncCoordinator {
  constructor(private readonly deps: FreshRssSyncCoordinatorDeps) {}

  public async run(input: FreshRssSyncRunInput): Promise<FreshRssSyncOutcome> {
    const { owner } = input;
    owner.throwIfInactive();

    const authResult = await authenticateFreshRss(
      this.deps.httpClient,
      input.endpoint,
      input.credentials,
    );
    if (authResult.outcome !== "authenticated") {
      return { outcome: authResult.outcome };
    }
    owner.throwIfInactive();

    const client = new FreshRssSyncClient(
      this.deps.httpClient,
      input.endpoint,
      authResult.authToken,
    );

    const subscriptionsResult = await client.listSubscriptions();
    if (subscriptionsResult.outcome !== "ok") {
      return mapFatalOutcome(subscriptionsResult.outcome);
    }
    owner.throwIfInactive();

    const tagLabelsResult = await client.listTagLabels();
    if (tagLabelsResult.outcome !== "ok") {
      return mapFatalOutcome(tagLabelsResult.outcome);
    }
    owner.throwIfInactive();

    const sidecarState = await this.deps.sidecarRepository.read(input.scope);
    if (!sidecarState) {
      // Sidecar must already be activated for this scope before a sync runs.
      return { outcome: "server-unavailable" };
    }

    const settings = this.deps.getSettings();
    const feeds: Feed[] = settings.feeds.map((feed) => ({ ...feed }));
    const feedBindings: FreshRssFeedBinding[] = sidecarState.feedBindings.map((b) => ({ ...b }));
    const articleBindings: FreshRssArticleBinding[] = sidecarState.articleBindings.map((b) => ({ ...b }));
    const checkpoints: FreshRssSyncCheckpoint[] = sidecarState.checkpoints.map((c) => ({ ...c }));

    let createdFeedCount = 0;
    let linkedFeedCount = 0;
    let ambiguousSubscriptionCount = 0;
    let importedArticleCount = 0;
    let partial = false;

    for (const subscription of subscriptionsResult.data) {
      owner.throwIfInactive();

      const resolvedFeedId = this.resolveFeedIdForSubscription(
        subscription,
        feeds,
        feedBindings,
      );
      if (resolvedFeedId.kind === "ambiguous") {
        ambiguousSubscriptionCount++;
        continue;
      }
      if (resolvedFeedId.kind === "stale-binding") {
        feedBindings.splice(feedBindings.indexOf(resolvedFeedId.binding), 1);
        continue;
      }
      if (resolvedFeedId.kind === "created") {
        createdFeedCount++;
      } else if (resolvedFeedId.kind === "linked") {
        linkedFeedCount++;
      }

      const feedIndex = feeds.findIndex((f) => f.feedId === resolvedFeedId.feedId);
      const feed = feeds[feedIndex];

      const alreadyBoundArticleIds = new Set(
        articleBindings
          .filter((b) => b.feedId === feed.feedId)
          .map((b) => b.remoteArticleId),
      );

      const itemIdsResult = await client.listItemIds(
        subscription.remoteSubscriptionId,
        FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION,
      );
      owner.throwIfInactive();
      if (itemIdsResult.outcome === "auth-rejected") {
        return { outcome: "credentials-rejected" };
      }
      if (itemIdsResult.outcome === "unavailable") {
        partial = true;
        continue;
      }

      const newIds = itemIdsResult.data.itemRefs.filter(
        (id) => !alreadyBoundArticleIds.has(id),
      );

      const contentsResult = await client.getItemContents(newIds);
      owner.throwIfInactive();
      if (contentsResult.outcome === "auth-rejected") {
        return { outcome: "credentials-rejected" };
      }
      if (contentsResult.outcome === "unavailable") {
        partial = true;
        continue;
      }

      const newItems = contentsResult.data.map((article) => toFeedItem(article, feed));
      feeds[feedIndex] = applyFeedRetentionLimits({
        ...feed,
        items: mergeFeedHistoryItems(feed.items, newItems),
        lastUpdated: newItems.length > 0 ? Date.now() : feed.lastUpdated,
      });

      for (const article of contentsResult.data) {
        articleBindings.push({
          feedId: feed.feedId as string,
          guid: article.guid,
          remoteArticleId: article.remoteArticleId,
        });
      }
      importedArticleCount += newItems.length;

      const isSubscriptionComplete = itemIdsResult.data.continuation === null;
      if (isSubscriptionComplete) {
        const existingCheckpointIndex = checkpoints.findIndex(
          (c) => c.remoteSubscriptionId === subscription.remoteSubscriptionId,
        );
        const checkpoint: FreshRssSyncCheckpoint = {
          remoteSubscriptionId: subscription.remoteSubscriptionId,
          completedAtMs: Date.now(),
        };
        if (existingCheckpointIndex >= 0) {
          checkpoints[existingCheckpointIndex] = checkpoint;
        } else {
          checkpoints.push(checkpoint);
        }
      } else {
        partial = true;
      }
    }

    owner.throwIfInactive();
    settings.feeds = feeds;
    await this.deps.saveSettings();
    owner.throwIfInactive();
    await this.deps.sidecarRepository.write({
      version: 2,
      scope: input.scope,
      pendingFacetMutations: sidecarState.pendingFacetMutations,
      feedBindings,
      articleBindings,
      checkpoints,
    });

    await refreshViewOnce(this.deps.getView);

    return {
      outcome: "synced",
      createdFeedCount,
      linkedFeedCount,
      ambiguousSubscriptionCount,
      importedArticleCount,
      partial,
    };
  }

  private resolveFeedIdForSubscription(
    subscription: FreshRssSubscription,
    feeds: Feed[],
    feedBindings: FreshRssFeedBinding[],
  ):
    | { kind: "linked" | "created"; feedId: string }
    | { kind: "ambiguous" }
    | { kind: "stale-binding"; binding: FreshRssFeedBinding } {
    const existingBinding = feedBindings.find(
      (b) => b.remoteSubscriptionId === subscription.remoteSubscriptionId,
    );
    if (existingBinding) {
      const boundFeed = feeds.find((f) => f.feedId === existingBinding.feedId);
      if (!boundFeed) {
        return { kind: "stale-binding", binding: existingBinding };
      }
      return { kind: "linked", feedId: existingBinding.feedId };
    }

    const normalizedSubscriptionUrl = normalizeUrlForComparison(subscription.url);
    const boundFeedIds = new Set(feedBindings.map((b) => b.feedId));
    const candidates = feeds.filter(
      (feed) =>
        !boundFeedIds.has(feed.feedId ?? "") &&
        normalizeUrlForComparison(feed.url) === normalizedSubscriptionUrl,
    );

    if (candidates.length > 1) {
      return { kind: "ambiguous" };
    }

    if (candidates.length === 1) {
      const feed = candidates[0];
      if (!feed.feedId) {
        feed.feedId = createFeedId();
      }
      feedBindings.push({
        feedId: feed.feedId,
        remoteSubscriptionId: subscription.remoteSubscriptionId,
      });
      return { kind: "linked", feedId: feed.feedId };
    }

    const newFeed: Feed = {
      feedId: createFeedId(),
      title: subscription.title,
      url: subscription.url,
      folder: subscription.categoryLabel || "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      excludeFromRefresh: true,
    };
    feeds.push(newFeed);
    feedBindings.push({
      feedId: newFeed.feedId as string,
      remoteSubscriptionId: subscription.remoteSubscriptionId,
    });
    return { kind: "created", feedId: newFeed.feedId as string };
  }
}

function mapFatalOutcome(
  outcome: "auth-rejected" | "unavailable",
): FreshRssSyncOutcome {
  return outcome === "auth-rejected"
    ? { outcome: "credentials-rejected" }
    : { outcome: "server-unavailable" };
}
