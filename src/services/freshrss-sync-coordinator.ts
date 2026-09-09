import type { Feed, FeedItem, RssDashboardSettings, Tag } from "../types/types";
import { mergeFeedHistoryItems, applyFeedRetentionLimits } from "./feed-parser";
import { normalizeUrlForComparison } from "../utils/url-utils";
import type { DataSyncLeaseOwner } from "./data-sync-lease";
import {
  authenticateFreshRss,
  type FreshRssAuthenticationResult,
  type FreshRssConnectionScope,
  type FreshRssCredentialBundle,
  type FreshRssHttpClient,
} from "./freshrss-connection-service";
import {
  FRESHRSS_READ_STREAM_ID,
  FRESHRSS_STARRED_STREAM_ID,
  FreshRssSyncClient,
  type FreshRssRemoteArticle,
  type FreshRssSubscription,
} from "./freshrss-sync-client";
import {
  FreshRssSidecarRepository,
  type FreshRssArticleBinding,
  type FreshRssFeedBinding,
  type FreshRssLabelMapping,
  type FreshRssSidecarFile,
  type FreshRssSyncCheckpoint,
} from "./freshrss-sidecar-repository";
import {
  applyLabelMembership,
  buildLabelMappings,
  dispatchableFacetMutations,
  isSynchronizableFacet,
  isTerminalMutation,
  labelNameFromFacet,
  makeLabelFacet,
  markMutationAttemptFailed,
  removeAcknowledgedMutation,
  type FreshRssPendingFacetMutation,
  type FreshRssSynchronizableFacet,
} from "./freshrss-facet-mutations";
import {
  createRetryingFreshRssHttpClient,
  type FreshRssRetryDeps,
} from "./freshrss-retry";
import {
  initialFreshRssSyncHealth,
  nextFreshRssSyncHealth,
  type FreshRssSyncHealth,
} from "./freshrss-backoff";

/** The two fixed system-stream facets, always flushed and reconciled. */
const SYSTEM_FACETS: readonly ("read" | "starred")[] = ["read", "starred"];

/**
 * The complete set of article facets this cycle flushes and reconciles: the
 * two fixed system-stream facets plus one dynamic `label:<normalized name>`
 * facet per currently known FreshRSS label mapping.
 */
function synchronizableFacetsFor(
  labelMappings: readonly FreshRssLabelMapping[],
): FreshRssSynchronizableFacet[] {
  return [...SYSTEM_FACETS, ...labelMappings.map((m) => makeLabelFacet(m.normalizedName))];
}

/**
 * The Google-Reader-API stream/tag ID backing one synchronizable facet.
 * Returns null for a label facet whose mapping is not currently known (e.g.
 * a pending mutation recorded before the label was ever discovered, or for a
 * label whose remote mapping later disappeared): such a facet cannot be
 * dispatched or pulled this cycle and is left untouched rather than guessed.
 */
function facetStreamId(
  facet: FreshRssSynchronizableFacet,
  labelMappings: readonly FreshRssLabelMapping[],
): string | null {
  if (facet === "read") return FRESHRSS_READ_STREAM_ID;
  if (facet === "starred") return FRESHRSS_STARRED_STREAM_ID;
  const normalizedName = labelNameFromFacet(facet);
  return labelMappings.find((m) => m.normalizedName === normalizedName)?.remoteTagId ?? null;
}

/**
 * Applies a facet's desired boolean state to an article. `read`/`starred`
 * set the matching scalar `FeedItem` field directly; a mapped-label facet
 * instead adds or removes a matching local tag by normalized name, matching
 * `applyLabelMembership`'s guarantee that an existing local tag's chosen
 * display spelling and color are never overwritten by remote membership.
 */
function setFacetOnItem(
  item: FeedItem,
  facet: FreshRssSynchronizableFacet,
  value: boolean,
  labelMappings: readonly FreshRssLabelMapping[],
  availableTags: readonly Tag[],
): void {
  if (facet === "read" || facet === "starred") {
    item[facet] = value;
    return;
  }
  const normalizedName = labelNameFromFacet(facet);
  const mapping = labelMappings.find((m) => m.normalizedName === normalizedName);
  item.tags = applyLabelMembership(item.tags, normalizedName, value, {
    availableTags,
    remoteDisplayName: mapping?.displayName ?? normalizedName,
  });
}

/** A user-facing rejection message for one synchronizable facet's terminal error. */
function facetRejectionMessage(facet: FreshRssSynchronizableFacet): string {
  if (facet === "read") return "FreshRSS rejected this read/unread change.";
  if (facet === "starred") return "FreshRSS rejected this star/unstar change.";
  return "FreshRSS rejected this tag change.";
}

/** Bounded per-subscription page size for a manual sync cycle. */
export const FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION = 50;

/** Page size used when enumerating a bounded item-ID stream (e.g. read state). */
export const FRESHRSS_ITEM_ID_PAGE_SIZE = 1000;

/** Default history/state bootstrap budget per relevant stream. */
export const FRESHRSS_STREAM_ID_BUDGET = 25000;

/** Maximum number of facet changes dispatched in one mutation request. */
export const FRESHRSS_MUTATION_BATCH_SIZE = 50;

/** Maximum number of remote article IDs requested in one item-content batch. */
export const FRESHRSS_CONTENT_BATCH_SIZE = 100;

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
      /**
       * True when any phase this cycle did not fully complete: a budget-capped
       * or malformed/repeated-cursor stream, or an exhausted transient
       * request failure. Distinguished from `hasTerminalMutations`, which
       * reports an unrelated non-retryable per-mutation rejection.
       */
      partial: boolean;
      /**
       * True when at least one pending facet mutation ended this cycle in a
       * terminal error state (HTTP 400/404/422, unknown binding, or an
       * invalid label operation) and needs explicit user repair -- the
       * "success-with-terminal-actions" durable outcome. Such a mutation is
       * never replayed automatically; see `dispatchableFacetMutations`.
       */
      hasTerminalMutations: boolean;
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
  /** Injectable in-cycle transient-retry delay/jitter, primarily for deterministic tests. */
  retry?: FreshRssRetryDeps;
}

/**
 * A mutable holder for the currently authenticated protocol client. Held by
 * reference (rather than a local `const client`) so `reauthenticateClient`
 * can swap in a freshly authenticated client after a mid-cycle auth
 * rejection, and every subsequent call site automatically observes it.
 */
interface FreshRssClientHolder {
  client: FreshRssSyncClient;
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

    // Every request issued through this client (login, reads, and the
    // idempotent absolute-state mutation dispatch below) gets up to
    // FRESHRSS_MAX_REQUEST_ATTEMPTS in-cycle attempts on a network
    // failure/timeout or a retryable status (408/429/5xx), with bounded
    // delay/jitter -- decorating once here means neither the protocol client
    // nor the connection-service login helper needs to know about retry.
    const retryingHttpClient = createRetryingFreshRssHttpClient(
      this.deps.httpClient,
      this.deps.retry,
    );

    // On a rejected login, perform exactly one fresh retry from the same
    // SecretStorage-sourced credentials before giving up -- matching the
    // "one fresh login, a second rejection pauses" rule applied uniformly to
    // every auth-rejected event in this cycle (see `withOneReauth` below for
    // the mid-cycle case).
    const authResult = await this.authenticateWithOneRetry(retryingHttpClient, input);
    if (authResult.outcome !== "authenticated") {
      return { outcome: authResult.outcome };
    }
    owner.throwIfInactive();

    const holder: FreshRssClientHolder = {
      client: new FreshRssSyncClient(retryingHttpClient, input.endpoint, authResult.authToken),
    };

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
    // The label mappings known BEFORE this cycle's own tag discovery runs.
    // Overlay and flush deliberately use this persisted snapshot (not a
    // freshly-discovered one) per the ordered cycle: pending mutations flush
    // before subscription/tag lists are even read, so a label facet can only
    // be dispatched once its mapping has survived at least one prior
    // discovery. It is replaced with a freshly rebuilt list below, right
    // after tag discovery, for the remote pull/reconcile phase and for what
    // gets persisted at the end of this cycle.
    let labelMappings: FreshRssLabelMapping[] = sidecarState.labelMappings.map((m) => ({ ...m }));
    const previousSyncHealth = sidecarState.syncHealth ?? initialFreshRssSyncHealth();

    let partial = false;
    // Distinct from `partial`: true only once an exhausted in-cycle
    // transient retry (network failure/timeout/408/429/5xx) is actually
    // observed, so cross-cycle backoff engages for real transport trouble
    // and not for an expected budget cap or a malformed/repeated cursor.
    let transientFailureOccurred = false;

    // Pending desired state remains authoritative in memory and on reload
    // until FreshRSS acknowledges the operation, so overlay it onto whatever
    // was hydrated from local storage before anything else runs.
    this.overlayPendingFacetState(feeds, articleBindings, pendingFacetMutations, labelMappings, settings.availableTags);

    // Flush every DISPATCHABLE pending facet mutation (read, starred, and any
    // known mapped label) before pulling any remote state. A record whose
    // last attempt ended in a terminal error is retained for repair but
    // never replayed automatically -- see `dispatchableFacetMutations`. A
    // fresh modification token is fetched immediately before dispatch; it is
    // never reused from the earlier connection test or a previous cycle.
    const anyDispatchablePendingExists = dispatchableFacetMutations(pendingFacetMutations).length > 0;
    if (anyDispatchablePendingExists) {
      const flushResult = await this.flushPendingFacetMutations(
        holder,
        input,
        pendingFacetMutations,
        { ...sidecarState, feedBindings, articleBindings, checkpoints, labelMappings },
        labelMappings,
        owner,
      );
      pendingFacetMutations = flushResult.pendingFacetMutations;
      if (flushResult.authRejected) {
        return { outcome: "credentials-rejected" };
      }
      if (flushResult.partial) {
        partial = true;
      }
      if (flushResult.transientFailureOccurred) {
        transientFailureOccurred = true;
      }
      owner.throwIfInactive();
    }

    const subscriptionsResult = await this.withOneReauth(input, holder, (c) => c.listSubscriptions());
    if (subscriptionsResult.outcome !== "ok") {
      if (subscriptionsResult.outcome === "unavailable") {
        await this.persistBackoffOnly(input, previousSyncHealth, {
          ...sidecarState,
          pendingFacetMutations,
          feedBindings,
          articleBindings,
          checkpoints,
          labelMappings,
        });
      }
      return mapFatalOutcome(subscriptionsResult.outcome);
    }
    owner.throwIfInactive();

    const tagLabelsResult = await this.withOneReauth(input, holder, (c) => c.listTagLabels());
    if (tagLabelsResult.outcome !== "ok") {
      if (tagLabelsResult.outcome === "unavailable") {
        await this.persistBackoffOnly(input, previousSyncHealth, {
          ...sidecarState,
          pendingFacetMutations,
          feedBindings,
          articleBindings,
          checkpoints,
          labelMappings,
        });
      }
      return mapFatalOutcome(tagLabelsResult.outcome);
    }
    owner.throwIfInactive();

    // Rebuild the known label mappings from this cycle's tag discovery. Read
    // and starred system streams and FreshRSS category/folder entries are
    // never exposed as dashboard label tags; a mapping-name collision between
    // two distinct remote labels excludes both from the rebuilt list rather
    // than guessing which one owns the name.
    labelMappings = buildLabelMappings(tagLabelsResult.data).mappings;

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

      const itemIdsResult = await this.withOneReauth(input, holder, (c) =>
        c.listItemIds(subscription.remoteSubscriptionId, FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION),
      );
      owner.throwIfInactive();
      if (itemIdsResult.outcome === "auth-rejected") {
        return { outcome: "credentials-rejected" };
      }
      if (itemIdsResult.outcome === "unavailable") {
        partial = true;
        transientFailureOccurred = true;
        continue;
      }

      const newIds = itemIdsResult.data.itemRefs.filter(
        (id) => !alreadyBoundArticleIds.has(id),
      );

      // Defensively bounded to FRESHRSS_CONTENT_BATCH_SIZE even though
      // FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION is already well under it
      // today: a batch failing partway through stops content import for
      // this subscription this cycle (marked partial) rather than losing
      // track of which articles were actually fetched.
      let contentBatchFailed = false;
      const collectedArticles: FreshRssRemoteArticle[] = [];
      for (const idBatch of chunk(newIds, FRESHRSS_CONTENT_BATCH_SIZE)) {
        const contentsResult = await this.withOneReauth(input, holder, (c) => c.getItemContents(idBatch));
        owner.throwIfInactive();
        if (contentsResult.outcome === "auth-rejected") {
          return { outcome: "credentials-rejected" };
        }
        if (contentsResult.outcome === "unavailable") {
          partial = true;
          transientFailureOccurred = true;
          contentBatchFailed = true;
          break;
        }
        collectedArticles.push(...contentsResult.data);
      }
      if (contentBatchFailed) {
        continue;
      }

      const newItems = collectedArticles.map((article) => toFeedItem(article, feed));
      feeds[feedIndex] = applyFeedRetentionLimits({
        ...feed,
        items: mergeFeedHistoryItems(feed.items, newItems),
        lastUpdated: newItems.length > 0 ? Date.now() : feed.lastUpdated,
      });

      for (const article of collectedArticles) {
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

    // Pull remote facet state (read, starred, then each known mapped label)
    // and reconcile it locally. Only fully-enumerated streams may
    // clear/change local state on absence; a capped or interrupted
    // enumeration leaves prior state untouched. A still-pending local facet
    // is never overridden by a pulled value.
    if (articleBindings.length > 0) {
      for (const facet of synchronizableFacetsFor(labelMappings)) {
        const streamId = facetStreamId(facet, labelMappings);
        if (streamId === null) {
          // A label facet whose mapping isn't (or is no longer) known can't
          // be pulled this cycle; leave existing local membership untouched.
          continue;
        }
        const streamResult = await this.enumerateBoundedItemIds(input, holder, streamId, owner);
        if (streamResult.outcome === "auth-rejected") {
          return { outcome: "credentials-rejected" };
        }
        if (streamResult.outcome !== "complete") {
          partial = true;
        }
        if (streamResult.outcome === "unavailable") {
          transientFailureOccurred = true;
        }
        if (streamResult.outcome === "complete") {
          this.reconcileRemoteFacetState(
            feeds,
            articleBindings,
            pendingFacetMutations,
            streamResult.itemIds,
            facet,
            labelMappings,
            settings.availableTags,
          );
        }
        owner.throwIfInactive();
      }
    }

    settings.feeds = feeds;
    await this.deps.saveSettings();
    owner.throwIfInactive();
    const nowMs = this.deps.now?.() ?? Date.now();
    const syncHealth = nextFreshRssSyncHealth(previousSyncHealth, {
      transientFailureOccurred,
      nowMs,
    });
    await this.deps.sidecarRepository.write({
      version: 2,
      scope: input.scope,
      pendingFacetMutations,
      feedBindings,
      articleBindings,
      checkpoints,
      labelMappings,
      syncHealth,
    });

    await refreshViewOnce(this.deps.getView);

    const hasTerminalMutations = pendingFacetMutations.some(isTerminalMutation);

    return {
      outcome: "synced",
      createdFeedCount,
      linkedFeedCount,
      ambiguousSubscriptionCount,
      importedArticleCount,
      partial,
      hasTerminalMutations,
    };
  }

  /**
   * Attempts login; on a rejected credential/session, performs exactly one
   * additional fresh login attempt before giving up. Used for the initial
   * cycle authentication, matching the same "one fresh login, a second
   * rejection is final" rule `withOneReauth` applies to a mid-cycle
   * rejection.
   */
  private async authenticateWithOneRetry(
    retryingHttpClient: FreshRssHttpClient,
    input: FreshRssSyncRunInput,
  ): Promise<FreshRssAuthenticationResult> {
    const first = await authenticateFreshRss(retryingHttpClient, input.endpoint, input.credentials);
    if (first.outcome !== "credentials-rejected") {
      return first;
    }
    return authenticateFreshRss(retryingHttpClient, input.endpoint, input.credentials);
  }

  /**
   * Performs exactly one fresh login from `input.credentials` and, on
   * success, swaps `holder.client` to a freshly authenticated client.
   * Returns whether reauthentication succeeded.
   */
  private async reauthenticateClient(
    input: FreshRssSyncRunInput,
    holder: FreshRssClientHolder,
  ): Promise<boolean> {
    const retryingHttpClient = createRetryingFreshRssHttpClient(this.deps.httpClient, this.deps.retry);
    const reauth = await authenticateFreshRss(retryingHttpClient, input.endpoint, input.credentials);
    if (reauth.outcome !== "authenticated") {
      return false;
    }
    holder.client = new FreshRssSyncClient(retryingHttpClient, input.endpoint, reauth.authToken);
    return true;
  }

  /**
   * Executes one client operation against the current `holder.client`. On an
   * `auth-rejected` result, performs exactly one fresh login (see
   * `reauthenticateClient`) and retries the SAME operation once against the
   * reauthenticated client. A rejection on that retry -- or a failed
   * reauthentication attempt itself -- is returned as-is: the caller enters
   * FreshRSS authentication pause rather than looping. This is the mid-cycle
   * counterpart to `authenticateWithOneRetry`, applied uniformly to every
   * request this cycle issues (subscription/tag reads, item-ID/content
   * paging, the modification token, and mutation dispatch).
   */
  private async withOneReauth<T extends { outcome: string }>(
    input: FreshRssSyncRunInput,
    holder: FreshRssClientHolder,
    operation: (client: FreshRssSyncClient) => Promise<T>,
  ): Promise<T> {
    const result = await operation(holder.client);
    if (result.outcome !== "auth-rejected") {
      return result;
    }
    const reauthenticated = await this.reauthenticateClient(input, holder);
    if (!reauthenticated) {
      return result;
    }
    return operation(holder.client);
  }

  /** Persists only the cross-cycle backoff bookkeeping, used on a fatal unavailable outcome that ends the cycle early. */
  private async persistBackoffOnly(
    input: FreshRssSyncRunInput,
    previousSyncHealth: FreshRssSyncHealth,
    sidecarSnapshot: FreshRssSidecarFile,
  ): Promise<void> {
    const nowMs = this.deps.now?.() ?? Date.now();
    const syncHealth = nextFreshRssSyncHealth(previousSyncHealth, {
      transientFailureOccurred: true,
      nowMs,
    });
    await this.deps.sidecarRepository.write({ ...sidecarSnapshot, scope: input.scope, syncHealth });
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
    labelMappings: readonly FreshRssLabelMapping[],
    availableTags: readonly Tag[],
  ): void {
    if (pendingFacetMutations.length === 0) return;
    const pendingByRemoteId = new Map<string, FreshRssPendingFacetMutation[]>();
    for (const mutation of pendingFacetMutations) {
      if (!isSynchronizableFacet(mutation.facet)) continue;
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
        setFacetOnItem(item, pending.facet, pending.desiredState, labelMappings, availableTags);
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
   * automatically. Every request this flush issues (the modification token
   * and each edit-tag batch) goes through `withOneReauth`, matching every
   * other request this cycle issues: on a mid-flush auth rejection, one
   * fresh login is attempted and the same request retried once before the
   * cycle gives up and enters FreshRSS authentication pause.
   */
  private async flushPendingFacetMutations(
    holder: FreshRssClientHolder,
    input: FreshRssSyncRunInput,
    initialPending: FreshRssPendingFacetMutation[],
    sidecarSnapshot: FreshRssSidecarFile,
    labelMappings: readonly FreshRssLabelMapping[],
    owner: DataSyncLeaseOwner,
  ): Promise<{
    pendingFacetMutations: FreshRssPendingFacetMutation[];
    partial: boolean;
    authRejected: boolean;
    transientFailureOccurred: boolean;
  }> {
    let pending = initialPending;
    const dispatchablePending = dispatchableFacetMutations(pending);
    if (dispatchablePending.length === 0) {
      return {
        pendingFacetMutations: pending,
        partial: false,
        authRejected: false,
        transientFailureOccurred: false,
      };
    }

    // Iterate the facets actually present in this cycle's pending records
    // (the two fixed system facets plus whichever mapped-label facets have a
    // pending change), rather than a fixed list, since label facets are
    // dynamic. A label facet whose mapping isn't currently known is skipped
    // entirely -- its records stay pending, untouched, for a later cycle
    // once the mapping is (re)discovered, rather than being attempted,
    // marked failed, or counted as a partial-cycle failure. This is resolved
    // BEFORE fetching a modification token, so a cycle with only
    // not-yet-mapped label mutations makes no network request at all.
    const facetsPresent = Array.from(new Set(dispatchablePending.map((m) => m.facet)));
    const groups: Array<{
      items: FreshRssPendingFacetMutation[];
      facet: FreshRssSynchronizableFacet;
      action: "add" | "remove";
      streamId: string;
    }> = [];
    for (const facet of facetsPresent) {
      const streamId = facetStreamId(facet, labelMappings);
      if (streamId === null) continue;
      const facetPending = dispatchablePending.filter((m) => m.facet === facet);
      groups.push({
        items: facetPending.filter((m) => m.desiredState === true),
        facet,
        action: "add",
        streamId,
      });
      groups.push({
        items: facetPending.filter((m) => m.desiredState === false),
        facet,
        action: "remove",
        streamId,
      });
    }
    if (groups.length === 0) {
      return {
        pendingFacetMutations: pending,
        partial: false,
        authRejected: false,
        transientFailureOccurred: false,
      };
    }

    const tokenResult = await this.withOneReauth(input, holder, (c) => c.getModificationToken());
    owner.throwIfInactive();
    if (tokenResult.outcome === "auth-rejected") {
      return {
        pendingFacetMutations: pending,
        partial: true,
        authRejected: true,
        transientFailureOccurred: false,
      };
    }
    if (tokenResult.outcome !== "ok") {
      return {
        pendingFacetMutations: pending,
        partial: true,
        authRejected: false,
        transientFailureOccurred: true,
      };
    }
    const token = tokenResult.data;

    const persist = async (): Promise<void> => {
      await this.deps.sidecarRepository.write({
        ...sidecarSnapshot,
        pendingFacetMutations: pending,
      });
    };

    for (const group of groups) {
      for (const batch of chunk(group.items, FRESHRSS_MUTATION_BATCH_SIZE)) {
        owner.throwIfInactive();
        const result = await this.withOneReauth(input, holder, (c) =>
          c.editTag(batch.map((m) => m.remoteArticleId), group.action, group.streamId, token),
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
          return {
            pendingFacetMutations: pending,
            partial: true,
            authRejected: true,
            transientFailureOccurred: false,
          };
        }

        if (result.outcome === "terminal") {
          const now = this.deps.now?.() ?? Date.now();
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
                message: facetRejectionMessage(group.facet),
              },
            );
          }
          await persist();
          continue;
        }

        // Unavailable (network/timeout/5xx/408/429/malformed body): stop
        // dispatching further batches this cycle. Already-acknowledged
        // batches remain acknowledged; the rest retry on the next cycle.
        return {
          pendingFacetMutations: pending,
          partial: true,
          authRejected: false,
          transientFailureOccurred: true,
        };
      }
    }

    return {
      pendingFacetMutations: pending,
      partial: false,
      authRejected: false,
      transientFailureOccurred: false,
    };
  }

  /**
   * Pages a bounded item-ID stream (page size `FRESHRSS_ITEM_ID_PAGE_SIZE`,
   * budget `FRESHRSS_STREAM_ID_BUDGET`) and reports whether enumeration
   * completed. A malformed/repeated continuation cursor or a budget cap stops
   * the phase and reports `"partial"` rather than falsely claiming
   * completeness. Each page request goes through `withOneReauth`, matching
   * every other request this cycle issues.
   */
  private async enumerateBoundedItemIds(
    input: FreshRssSyncRunInput,
    holder: FreshRssClientHolder,
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
      const result = await this.withOneReauth(input, holder, (c) =>
        c.listItemIds(streamId, FRESHRSS_ITEM_ID_PAGE_SIZE, continuation),
      );
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
    labelMappings: readonly FreshRssLabelMapping[],
    availableTags: readonly Tag[],
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
      setFacetOnItem(
        item,
        facet,
        remoteFacetIds.has(binding.remoteArticleId),
        labelMappings,
        availableTags,
      );
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
