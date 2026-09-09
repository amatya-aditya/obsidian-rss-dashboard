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
import {
  FRESHRSS_READ_STREAM_ID,
  FRESHRSS_STARRED_STREAM_ID,
  FreshRssSyncClient,
  type FreshRssSubscription,
} from "./freshrss-sync-client";
import {
  FreshRssSidecarRepository,
  type FreshRssArticleBinding,
  type FreshRssFeedBinding,
  type FreshRssSidecarFile,
  type FreshRssSyncCheckpoint,
} from "./freshrss-sidecar-repository";
import {
  markMutationAttemptFailed,
  removeAcknowledgedMutation,
  type FreshRssPendingFacetMutation,
  type FreshRssSynchronizableFacet,
} from "./freshrss-facet-mutations";

/** Every article facet the sync coordinator flushes and reconciles. */
const SYNCHRONIZABLE_FACETS: readonly FreshRssSynchronizableFacet[] = [
  "read",
  "starred",
];

/** The Google-Reader-API system stream backing one synchronizable facet. */
function facetStreamId(facet: FreshRssSynchronizableFacet): string {
  return facet === "read" ? FRESHRSS_READ_STREAM_ID : FRESHRSS_STARRED_STREAM_ID;
}

/** Applies a facet's desired boolean state to the matching FeedItem field. */
function setFacetOnItem(
  item: FeedItem,
  facet: FreshRssSynchronizableFacet,
  value: boolean,
): void {
  item[facet] = value;
}

/** Bounded per-subscription page size for a manual sync cycle. */
export const FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION = 50;

/** Page size used when enumerating a bounded item-ID stream (e.g. read state). */
export const FRESHRSS_ITEM_ID_PAGE_SIZE = 1000;

/** Default history/state bootstrap budget per relevant stream. */
export const FRESHRSS_STREAM_ID_BUDGET = 25000;

/** Maximum number of facet changes dispatched in one mutation request. */
export const FRESHRSS_MUTATION_BATCH_SIZE = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

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
  /** Injectable clock, primarily so tests can assert deterministic timestamps. */
  now?: () => number;
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
    let pendingFacetMutations: FreshRssPendingFacetMutation[] =
      sidecarState.pendingFacetMutations.map((m) => ({ ...m }));

    let partial = false;

    // Pending desired state remains authoritative in memory and on reload
    // until FreshRSS acknowledges the operation, so overlay it onto whatever
    // was hydrated from local storage before anything else runs.
    this.overlayPendingFacetState(feeds, articleBindings, pendingFacetMutations);

    // Flush every pending facet mutation (read and starred) before pulling
    // any remote state. A fresh modification token is fetched immediately
    // before dispatch; it is never reused from the earlier connection test or
    // a previous cycle.
    const anyPendingExists = pendingFacetMutations.some((m) =>
      SYNCHRONIZABLE_FACETS.includes(m.facet),
    );
    if (anyPendingExists) {
      const flushResult = await this.flushPendingFacetMutations(
        client,
        pendingFacetMutations,
        { ...sidecarState, feedBindings, articleBindings, checkpoints },
        owner,
      );
      pendingFacetMutations = flushResult.pendingFacetMutations;
      if (flushResult.authRejected) {
        return { outcome: "credentials-rejected" };
      }
      if (flushResult.partial) {
        partial = true;
      }
      owner.throwIfInactive();
    }

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

    let createdFeedCount = 0;
    let linkedFeedCount = 0;
    let ambiguousSubscriptionCount = 0;
    let importedArticleCount = 0;

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

    // Pull remote facet state (read, then starred) and reconcile it locally.
    // Only fully-enumerated streams may clear/change local state on absence;
    // a capped or interrupted enumeration leaves prior state untouched. A
    // still-pending local facet is never overridden by a pulled value.
    if (articleBindings.length > 0) {
      for (const facet of SYNCHRONIZABLE_FACETS) {
        const streamResult = await this.enumerateBoundedItemIds(
          client,
          facetStreamId(facet),
          owner,
        );
        if (streamResult.outcome === "auth-rejected") {
          return { outcome: "credentials-rejected" };
        }
        if (streamResult.outcome !== "complete") {
          partial = true;
        }
        if (streamResult.outcome === "complete") {
          this.reconcileRemoteFacetState(
            feeds,
            articleBindings,
            pendingFacetMutations,
            streamResult.itemIds,
            facet,
          );
        }
        owner.throwIfInactive();
      }
    }

    settings.feeds = feeds;
    await this.deps.saveSettings();
    owner.throwIfInactive();
    await this.deps.sidecarRepository.write({
      version: 2,
      scope: input.scope,
      pendingFacetMutations,
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

  /**
   * Forces every locally known article with a current pending facet
   * mutation (read and/or starred) to reflect that mutation's desired state.
   * Pending desired state remains authoritative in memory and on reload
   * until FreshRSS acknowledges the operation, independent of whatever value
   * was hydrated from `user-state.json` or a prior partial cycle.
   */
  private overlayPendingFacetState(
    feeds: Feed[],
    articleBindings: FreshRssArticleBinding[],
    pendingFacetMutations: FreshRssPendingFacetMutation[],
  ): void {
    if (pendingFacetMutations.length === 0) return;
    const pendingByRemoteId = new Map<string, FreshRssPendingFacetMutation[]>();
    for (const mutation of pendingFacetMutations) {
      if (!SYNCHRONIZABLE_FACETS.includes(mutation.facet)) continue;
      const existing = pendingByRemoteId.get(mutation.remoteArticleId);
      if (existing) {
        existing.push(mutation);
      } else {
        pendingByRemoteId.set(mutation.remoteArticleId, [mutation]);
      }
    }
    if (pendingByRemoteId.size === 0) return;

    for (const binding of articleBindings) {
      const pendingForArticle = pendingByRemoteId.get(binding.remoteArticleId);
      if (!pendingForArticle) continue;
      const feed = feeds.find((f) => f.feedId === binding.feedId);
      const item = feed?.items.find((candidate) => candidate.guid === binding.guid);
      if (!item) continue;
      for (const pending of pendingForArticle) {
        setFacetOnItem(item, pending.facet, pending.desiredState);
      }
    }
  }

  /**
   * Dispatches every current pending facet mutation (read and/or starred) in
   * deterministic same-facet, same-desired-state batches of at most
   * `FRESHRSS_MUTATION_BATCH_SIZE`, one request in flight. A single fresh
   * modification token covers the whole flush; it is never reused from the
   * earlier connection test or a previous cycle. The sidecar is persisted
   * immediately after each acknowledged batch so a crash mid-flush cannot
   * lose an acknowledgment. Terminal errors (HTTP 400/404/422) keep the
   * desired state with a terminal error instead of being retried
   * automatically.
   */
  private async flushPendingFacetMutations(
    client: FreshRssSyncClient,
    initialPending: FreshRssPendingFacetMutation[],
    sidecarSnapshot: FreshRssSidecarFile,
    owner: DataSyncLeaseOwner,
  ): Promise<{
    pendingFacetMutations: FreshRssPendingFacetMutation[];
    partial: boolean;
    authRejected: boolean;
  }> {
    let pending = initialPending;
    const dispatchablePending = pending.filter((m) =>
      SYNCHRONIZABLE_FACETS.includes(m.facet),
    );
    if (dispatchablePending.length === 0) {
      return { pendingFacetMutations: pending, partial: false, authRejected: false };
    }

    const tokenResult = await client.getModificationToken();
    owner.throwIfInactive();
    if (tokenResult.outcome === "auth-rejected") {
      return { pendingFacetMutations: pending, partial: true, authRejected: true };
    }
    if (tokenResult.outcome !== "ok") {
      return { pendingFacetMutations: pending, partial: true, authRejected: false };
    }
    const token = tokenResult.data;

    const persist = async (): Promise<void> => {
      await this.deps.sidecarRepository.write({
        ...sidecarSnapshot,
        pendingFacetMutations: pending,
      });
    };

    const groups: Array<{
      items: FreshRssPendingFacetMutation[];
      facet: FreshRssSynchronizableFacet;
      action: "add" | "remove";
    }> = [];
    for (const facet of SYNCHRONIZABLE_FACETS) {
      const facetPending = dispatchablePending.filter((m) => m.facet === facet);
      groups.push({
        items: facetPending.filter((m) => m.desiredState === true),
        facet,
        action: "add",
      });
      groups.push({
        items: facetPending.filter((m) => m.desiredState === false),
        facet,
        action: "remove",
      });
    }

    for (const group of groups) {
      for (const batch of chunk(group.items, FRESHRSS_MUTATION_BATCH_SIZE)) {
        owner.throwIfInactive();
        const result = await client.editTag(
          batch.map((m) => m.remoteArticleId),
          group.action,
          facetStreamId(group.facet),
          token,
        );
        owner.throwIfInactive();

        if (result.outcome === "acknowledged") {
          for (const mutation of batch) {
            pending = removeAcknowledgedMutation(pending, {
              remoteArticleId: mutation.remoteArticleId,
              facet: group.facet,
              operationId: mutation.operationId,
            });
          }
          await persist();
          continue;
        }

        if (result.outcome === "auth-rejected") {
          return { pendingFacetMutations: pending, partial: true, authRejected: true };
        }

        if (result.outcome === "terminal") {
          const now = this.deps.now?.() ?? Date.now();
          const message =
            group.facet === "read"
              ? "FreshRSS rejected this read/unread change."
              : "FreshRSS rejected this star/unstar change.";
          for (const mutation of batch) {
            pending = markMutationAttemptFailed(
              pending,
              {
                remoteArticleId: mutation.remoteArticleId,
                facet: group.facet,
                operationId: mutation.operationId,
              },
              now,
              {
                category: "terminal",
                message,
              },
            );
          }
          await persist();
          continue;
        }

        // Unavailable (network/timeout/5xx/408/429/malformed body): stop
        // dispatching further batches this cycle. Already-acknowledged
        // batches remain acknowledged; the rest retry on the next cycle.
        return { pendingFacetMutations: pending, partial: true, authRejected: false };
      }
    }

    return { pendingFacetMutations: pending, partial: false, authRejected: false };
  }

  /**
   * Pages a bounded item-ID stream (page size `FRESHRSS_ITEM_ID_PAGE_SIZE`,
   * budget `FRESHRSS_STREAM_ID_BUDGET`) and reports whether enumeration
   * completed. A malformed/repeated continuation cursor or a budget cap stops
   * the phase and reports `"partial"` rather than falsely claiming
   * completeness.
   */
  private async enumerateBoundedItemIds(
    client: FreshRssSyncClient,
    streamId: string,
    owner: DataSyncLeaseOwner,
  ): Promise<
    | { outcome: "complete"; itemIds: Set<string> }
    | { outcome: "partial"; itemIds: Set<string> }
    | { outcome: "auth-rejected"; itemIds: Set<string> }
    | { outcome: "unavailable"; itemIds: Set<string> }
  > {
    const itemIds = new Set<string>();
    const seenCursors = new Set<string>();
    let continuation: string | null = null;
    const maxPages = Math.ceil(FRESHRSS_STREAM_ID_BUDGET / FRESHRSS_ITEM_ID_PAGE_SIZE);

    for (let page = 0; page < maxPages; page++) {
      owner.throwIfInactive();
      const result = await client.listItemIds(streamId, FRESHRSS_ITEM_ID_PAGE_SIZE, continuation);
      if (result.outcome === "auth-rejected") {
        return { outcome: "auth-rejected", itemIds };
      }
      if (result.outcome !== "ok") {
        return { outcome: "unavailable", itemIds };
      }

      for (const id of result.data.itemRefs) {
        itemIds.add(id);
      }

      if (result.data.continuation === null) {
        return { outcome: "complete", itemIds };
      }
      if (seenCursors.has(result.data.continuation)) {
        return { outcome: "partial", itemIds };
      }
      seenCursors.add(result.data.continuation);
      continuation = result.data.continuation;
    }

    return { outcome: "partial", itemIds };
  }

  /**
   * Applies one remote facet stream's absence/presence to every locally
   * bound article whose facet is not protected by a still-pending local
   * mutation. Only called once that facet's stream has been fully
   * enumerated.
   */
  private reconcileRemoteFacetState(
    feeds: Feed[],
    articleBindings: FreshRssArticleBinding[],
    pendingFacetMutations: FreshRssPendingFacetMutation[],
    remoteFacetIds: Set<string>,
    facet: FreshRssSynchronizableFacet,
  ): void {
    const pendingRemoteIds = new Set(
      pendingFacetMutations
        .filter((m) => m.facet === facet)
        .map((m) => m.remoteArticleId),
    );

    for (const binding of articleBindings) {
      if (pendingRemoteIds.has(binding.remoteArticleId)) {
        continue;
      }
      const feed = feeds.find((f) => f.feedId === binding.feedId);
      const item = feed?.items.find((candidate) => candidate.guid === binding.guid);
      if (!item) continue;
      setFacetOnItem(item, facet, remoteFacetIds.has(binding.remoteArticleId));
    }
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
