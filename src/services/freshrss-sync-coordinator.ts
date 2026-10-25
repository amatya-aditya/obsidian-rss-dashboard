import type { Feed, FeedItem, RssDashboardSettings } from "../types/types";
import { normalizeUrlForComparison } from "../utils/url-utils";
import { applyFeedRetentionLimits, mergeFeedHistoryItems } from "./feed-parser";
import {
  authenticateFreshRss,
  identifyFreshRssUser,
  type FreshRssConnectionScope,
  type FreshRssCredentialBundle,
  type FreshRssHttpClient,
} from "./freshrss-connection-service";
import {
  FreshRssConnectionScopeRepository,
  type FreshRssArticleBinding,
  type FreshRssFeedBinding,
  type FreshRssPendingReadMutation,
  type FreshRssSyncCheckpoint,
} from "./freshrss-connection-scope-repository";
import {
  isFreshRssPendingReadMutation,
  withFreshRssSidecarMutationLock,
} from "./freshrss-article-state";
import {
  FreshRssSyncClient,
  type FreshRssSubscription,
} from "./freshrss-sync-client";

/** Maximum recent article IDs requested for each FreshRSS subscription. */
export const FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION = 50;

export interface FreshRssSyncOwner {
  signal: AbortSignal;
  beginCommit(): void;
  throwIfInactive(): void;
}

export class FreshRssSyncCancelledError extends Error {
  constructor() {
    super("FreshRSS sync was cancelled or unloaded.");
    this.name = "FreshRssSyncCancelledError";
  }
}

export interface FreshRssDashboardView {
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
  | { outcome: "scope-mismatch" }
  | { outcome: "server-unavailable" };

export interface FreshRssSyncRunInput {
  endpoint: string;
  credentials: FreshRssCredentialBundle;
  scope: FreshRssConnectionScope;
  owner: FreshRssSyncOwner;
}

export interface FreshRssSyncCoordinatorDeps {
  httpClient: FreshRssHttpClient;
  getSettings: () => RssDashboardSettings;
  saveSettings: () => Promise<void>;
  sidecarRepository: Pick<FreshRssConnectionScopeRepository, "read" | "write">;
  getView: () => Promise<FreshRssDashboardView | null>;
}

interface FreshRssSyncAccumulator {
  feeds: Feed[];
  feedBindings: FreshRssFeedBinding[];
  articleBindings: FreshRssArticleBinding[];
  checkpoints: FreshRssSyncCheckpoint[];
  createdFeedCount: number;
  linkedFeedCount: number;
  ambiguousSubscriptionCount: number;
  importedArticleCount: number;
  partial: boolean;
  settingsChanged: boolean;
}

type FreshRssSubscriptionResult =
  "complete" | "partial" | "credentials-rejected";

function createFeedId(): string {
  const randomUuid = window.crypto?.randomUUID?.();
  return (
    randomUuid ||
    `feed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
}

function toFeedItem(
  article: {
    guid: string;
    title: string;
    link: string | null;
    content: string | null;
    author: string | null;
    publishedMs: number | null;
    read: boolean | null;
  },
  feed: Feed,
  includeRemoteReadState: boolean,
): FeedItem {
  const publishedMs = article.publishedMs;
  return {
    title: article.title,
    link: article.link ?? "",
    description: article.content ?? "",
    pubDate:
      publishedMs !== null
        ? new Date(publishedMs).toISOString()
        : new Date().toISOString(),
    guid: article.guid,
    feedTitle: feed.title,
    feedUrl: feed.url,
    coverImage: "",
    content: article.content ?? undefined,
    author: article.author ?? undefined,
    read: includeRemoteReadState ? (article.read ?? false) : false,
  };
}

async function refreshViewOnce(
  getView: () => Promise<FreshRssDashboardView | null>,
): Promise<void> {
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

/** Imports remote subscriptions and bounded article history into current Core storage. */
export class FreshRssSyncCoordinator {
  constructor(private readonly deps: FreshRssSyncCoordinatorDeps) {}

  public async run(input: FreshRssSyncRunInput): Promise<FreshRssSyncOutcome> {
    const { owner } = input;
    owner.throwIfInactive();

    const authResult = await authenticateFreshRss(
      this.deps.httpClient,
      input.endpoint,
      input.credentials,
      owner.signal,
    );
    owner.throwIfInactive();
    if (authResult.outcome !== "authenticated") {
      return { outcome: authResult.outcome };
    }

    const identityResult = await identifyFreshRssUser(
      this.deps.httpClient,
      input.endpoint,
      authResult.authToken,
      owner.signal,
    );
    owner.throwIfInactive();
    if (identityResult.outcome !== "identified") {
      return { outcome: identityResult.outcome };
    }
    if (
      input.scope.endpoint !== input.endpoint ||
      identityResult.remoteUserId !== input.scope.remoteUserId
    ) {
      return { outcome: "scope-mismatch" };
    }

    const client = new FreshRssSyncClient(
      this.deps.httpClient,
      input.endpoint,
      authResult.authToken,
      owner.signal,
    );
    const sidecarState = await this.deps.sidecarRepository.read(input.scope);
    owner.throwIfInactive();
    if (!sidecarState) return { outcome: "server-unavailable" };

    const settings = this.deps.getSettings();
    if (settings.freshRss.stateSyncMode === "two-way") {
      const flushOutcome = await flushPendingReadMutations(
        client,
        this.deps.sidecarRepository,
        input.scope,
        sidecarState.pendingFacetMutations,
        owner,
      );
      if (flushOutcome === "credentials-rejected") {
        return { outcome: "credentials-rejected" };
      }
      if (flushOutcome === "server-unavailable") {
        return { outcome: "server-unavailable" };
      }
    }

    const subscriptionsResult = await client.listSubscriptions();
    owner.throwIfInactive();
    if (subscriptionsResult.outcome !== "ok") {
      return mapFatalOutcome(subscriptionsResult.outcome);
    }

    const originalFeeds = settings.feeds;
    const syncState: FreshRssSyncAccumulator = {
      feeds: settings.feeds.map((feed) => ({
        ...feed,
        items: [...feed.items],
      })),
      feedBindings: sidecarState.feedBindings.map((binding) => ({
        ...binding,
      })),
      articleBindings: sidecarState.articleBindings.map((binding) => ({
        ...binding,
      })),
      checkpoints: sidecarState.checkpoints.map((checkpoint) => ({
        ...checkpoint,
      })),
      createdFeedCount: 0,
      linkedFeedCount: 0,
      ambiguousSubscriptionCount: 0,
      importedArticleCount: 0,
      partial: false,
      settingsChanged: false,
    };

    for (const subscription of subscriptionsResult.data) {
      owner.throwIfInactive();
      const result = await this.syncSubscription(
        subscription,
        client,
        syncState,
        settings,
        owner,
      );
      if (result === "credentials-rejected") {
        return { outcome: "credentials-rejected" };
      }
      if (result === "partial") syncState.partial = true;
    }

    owner.throwIfInactive();
    const commitOutcome = await withFreshRssSidecarMutationLock(async () => {
      const latestSidecar = await this.deps.sidecarRepository.read(input.scope);
      owner.throwIfInactive();
      if (!latestSidecar) return "server-unavailable" as const;
      if (
        applyPendingReadOverrides(
          syncState.feeds,
          syncState.articleBindings,
          latestSidecar.pendingFacetMutations,
        )
      ) {
        syncState.settingsChanged = true;
      }

      owner.beginCommit();
      if (syncState.settingsChanged) {
        settings.feeds = syncState.feeds;
        try {
          await this.deps.saveSettings();
        } catch (error) {
          settings.feeds = originalFeeds;
          throw error;
        }
      }
      await this.deps.sidecarRepository.write({
        ...latestSidecar,
        version: 2,
        scope: input.scope,
        feedBindings: syncState.feedBindings,
        articleBindings: syncState.articleBindings,
        checkpoints: syncState.checkpoints,
      });
      return "committed" as const;
    });
    if (commitOutcome !== "committed") {
      return { outcome: commitOutcome };
    }
    await refreshViewOnce(this.deps.getView);

    return {
      outcome: "synced",
      createdFeedCount: syncState.createdFeedCount,
      linkedFeedCount: syncState.linkedFeedCount,
      ambiguousSubscriptionCount: syncState.ambiguousSubscriptionCount,
      importedArticleCount: syncState.importedArticleCount,
      partial: syncState.partial,
    };
  }

  private async syncSubscription(
    subscription: FreshRssSubscription,
    client: FreshRssSyncClient,
    syncState: FreshRssSyncAccumulator,
    settings: RssDashboardSettings,
    owner: FreshRssSyncOwner,
  ): Promise<FreshRssSubscriptionResult> {
    const resolution = resolveFeedForSubscription(
      subscription,
      syncState.feeds,
      syncState.feedBindings,
      settings,
    );
    if (resolution.kind === "ambiguous") {
      syncState.ambiguousSubscriptionCount++;
      return "complete";
    }
    if (resolution.kind === "created") {
      syncState.createdFeedCount++;
      syncState.settingsChanged = true;
    } else {
      syncState.linkedFeedCount++;
      if (resolution.changed) syncState.settingsChanged = true;
    }

    const feedIndex = syncState.feeds.findIndex(
      (feed) => feed.feedId === resolution.feedId,
    );
    const feed = syncState.feeds[feedIndex];
    if (!feed) return "complete";

    const boundIds = new Set(
      syncState.articleBindings
        .filter((binding) => binding.feedId === feed.feedId)
        .map((binding) => binding.remoteArticleId),
    );
    const idsResult = await client.listItemIds(
      subscription.remoteSubscriptionId,
      FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION,
    );
    owner.throwIfInactive();
    if (idsResult.outcome === "auth-rejected") return "credentials-rejected";
    if (idsResult.outcome === "unavailable") return "partial";

    const requestedIds = [...new Set(idsResult.data.itemRefs)].filter(
      (id) => !boundIds.has(id),
    );
    const contentsResult = await client.getItemContents(requestedIds);
    owner.throwIfInactive();
    if (contentsResult.outcome === "auth-rejected")
      return "credentials-rejected";
    if (contentsResult.outcome === "unavailable") return "partial";

    const requestedIdSet = new Set(requestedIds);
    const importedArticles = contentsResult.data.filter((article) =>
      requestedIdSet.has(article.remoteArticleId),
    );
    const newItems = importedArticles.map((article) =>
      toFeedItem(article, feed, settings.freshRss.stateSyncMode === "two-way"),
    );
    syncState.feeds[feedIndex] = applyFeedRetentionLimits(
      {
        ...feed,
        items: mergeFeedHistoryItems(feed.items, newItems),
        lastUpdated: newItems.length > 0 ? Date.now() : feed.lastUpdated,
      },
      {
        protections: {
          protectStarred: settings.protectStarred,
          protectSaved: settings.protectSaved,
          protectTagged: settings.protectTagged,
          protectUnread: settings.protectUnread,
        },
        useFirstSeenDateFallback: settings.useFirstSeenDateFallback,
      },
    );

    for (const article of importedArticles) {
      syncState.articleBindings.push({
        feedId: feed.feedId as string,
        guid: article.guid,
        remoteArticleId: article.remoteArticleId,
      });
    }
    if (newItems.length > 0) {
      syncState.importedArticleCount += newItems.length;
      syncState.settingsChanged = true;
    }

    if (settings.freshRss.stateSyncMode === "two-way") {
      const result = await syncBoundReadStates({
        client,
        syncState,
        feedId: feed.feedId ?? "",
        feedIndex,
        importedRemoteIds: requestedIds,
        owner,
      });
      if (result === "credentials-rejected") return result;
    }

    if (idsResult.data.continuation !== null) return "partial";
    upsertCheckpoint(syncState.checkpoints, subscription.remoteSubscriptionId);
    return "complete";
  }
}

async function syncBoundReadStates(input: {
  client: FreshRssSyncClient;
  syncState: FreshRssSyncAccumulator;
  feedId: string;
  feedIndex: number;
  importedRemoteIds: string[];
  owner: FreshRssSyncOwner;
}): Promise<"complete" | "credentials-rejected"> {
  const existingBindings = input.syncState.articleBindings.filter(
    (binding) => binding.feedId === input.feedId,
  );
  const importedRemoteIds = new Set(input.importedRemoteIds);
  const boundIdsToRead = existingBindings
    .map((binding) => binding.remoteArticleId)
    .filter((remoteId) => !importedRemoteIds.has(remoteId));

  for (let offset = 0; offset < boundIdsToRead.length; offset += 100) {
    input.owner.throwIfInactive();
    const stateResult = await input.client.getItemContents(
      boundIdsToRead.slice(offset, offset + 100),
    );
    input.owner.throwIfInactive();
    if (stateResult.outcome === "auth-rejected") return "credentials-rejected";
    if (stateResult.outcome === "unavailable") {
      input.syncState.partial = true;
      continue;
    }

    const remoteById = new Map(
      stateResult.data.map((article) => [article.remoteArticleId, article]),
    );
    for (const binding of existingBindings) {
      const remoteArticle = remoteById.get(binding.remoteArticleId);
      const localArticle = input.syncState.feeds[input.feedIndex]?.items.find(
        (item) => item.guid === binding.guid,
      );
      if (
        remoteArticle?.read !== null &&
        remoteArticle !== undefined &&
        localArticle &&
        localArticle.read !== remoteArticle.read
      ) {
        localArticle.read = remoteArticle.read;
        input.syncState.settingsChanged = true;
      }
    }
  }
  return "complete";
}

function resolveFeedForSubscription(
  subscription: FreshRssSubscription,
  feeds: Feed[],
  bindings: FreshRssFeedBinding[],
  settings: RssDashboardSettings,
):
  | { kind: "linked"; feedId: string; changed: boolean }
  | { kind: "created"; feedId: string }
  | { kind: "ambiguous" } {
  const bindingIndex = bindings.findIndex(
    (candidate) =>
      candidate.remoteSubscriptionId === subscription.remoteSubscriptionId,
  );
  if (bindingIndex >= 0) {
    const binding = bindings[bindingIndex];
    if (!binding) return { kind: "ambiguous" };
    const feed = feeds.find((candidate) => candidate.feedId === binding.feedId);
    if (feed) return { kind: "linked", feedId: binding.feedId, changed: false };
    bindings.splice(bindingIndex, 1);
  }

  const normalizedUrl = normalizeUrlForComparison(subscription.url);
  const boundFeedIds = new Set(bindings.map((candidate) => candidate.feedId));
  const candidates = feeds.filter(
    (feed) =>
      !boundFeedIds.has(feed.feedId ?? "") &&
      normalizeUrlForComparison(feed.url) === normalizedUrl,
  );
  if (candidates.length > 1) return { kind: "ambiguous" };

  if (candidates.length === 1) {
    const feed = candidates[0];
    if (!feed) return { kind: "ambiguous" };
    const changed = !feed.feedId;
    feed.feedId ||= createFeedId();
    bindings.push({
      feedId: feed.feedId,
      remoteSubscriptionId: subscription.remoteSubscriptionId,
    });
    return { kind: "linked", feedId: feed.feedId, changed };
  }

  const feed: Feed = {
    feedId: createFeedId(),
    title: subscription.title,
    url: subscription.url,
    folder: settings.media.defaultRssFolder || "RSS",
    items: [],
    lastUpdated: Date.now(),
    autoDeleteDuration: settings.defaultAutoDeleteDuration,
    maxItemsLimit: settings.maxItems,
    excludeFromRefresh: true,
  };
  feeds.push(feed);
  bindings.push({
    feedId: feed.feedId as string,
    remoteSubscriptionId: subscription.remoteSubscriptionId,
  });
  return { kind: "created", feedId: feed.feedId as string };
}

function upsertCheckpoint(
  checkpoints: FreshRssSyncCheckpoint[],
  remoteSubscriptionId: string,
): void {
  const checkpoint: FreshRssSyncCheckpoint = {
    remoteSubscriptionId,
    completedAtMs: Date.now(),
  };
  const index = checkpoints.findIndex(
    (current) => current.remoteSubscriptionId === remoteSubscriptionId,
  );
  if (index < 0) checkpoints.push(checkpoint);
  else checkpoints[index] = checkpoint;
}

function mapFatalOutcome(
  outcome: "auth-rejected" | "unavailable",
): FreshRssSyncOutcome {
  return outcome === "auth-rejected"
    ? { outcome: "credentials-rejected" }
    : { outcome: "server-unavailable" };
}

type FreshRssMutationFlushOutcome =
  "complete" | "credentials-rejected" | "server-unavailable";

async function flushPendingReadMutations(
  client: FreshRssSyncClient,
  repository: Pick<FreshRssConnectionScopeRepository, "read" | "write">,
  scope: FreshRssConnectionScope,
  pendingValues: unknown[],
  owner: FreshRssSyncOwner,
): Promise<FreshRssMutationFlushOutcome> {
  const pending = pendingValues.filter(isFreshRssPendingReadMutation);
  if (pending.length === 0) return "complete";

  const tokenResult = await client.getModificationToken();
  owner.throwIfInactive();
  if (tokenResult.outcome === "auth-rejected") return "credentials-rejected";
  if (tokenResult.outcome !== "ok") return "server-unavailable";

  for (let offset = 0; offset < pending.length; offset += 50) {
    const batch = pending.slice(offset, offset + 50);
    const groups = [
      {
        read: true,
        mutations: batch.filter((mutation) => mutation.desiredState),
      },
      {
        read: false,
        mutations: batch.filter((mutation) => !mutation.desiredState),
      },
    ];
    for (const group of groups) {
      if (group.mutations.length === 0) continue;
      owner.throwIfInactive();
      const result = await client.updateReadState(
        group.mutations.map((mutation) => mutation.remoteArticleId),
        group.read,
        tokenResult.data,
      );
      owner.throwIfInactive();
      if (result.outcome === "auth-rejected") return "credentials-rejected";

      const operationIds = new Set(
        group.mutations.map((mutation) => mutation.operationId),
      );
      const mutationOutcome = await withFreshRssSidecarMutationLock(
        async () => {
          const current = await repository.read(scope);
          if (!current) return "server-unavailable" as const;
          const currentPending = current.pendingFacetMutations;
          if (result.outcome === "ok") {
            await repository.write({
              ...current,
              pendingFacetMutations: currentPending.filter(
                (value) =>
                  !isFreshRssPendingReadMutation(value) ||
                  !operationIds.has(value.operationId),
              ),
            });
            return "acknowledged" as const;
          }
          await repository.write({
            ...current,
            pendingFacetMutations: currentPending.map((value) => {
              if (
                !isFreshRssPendingReadMutation(value) ||
                !operationIds.has(value.operationId)
              ) {
                return value;
              }
              return {
                ...value,
                attemptCount: value.attemptCount + 1,
                lastError:
                  "FreshRSS did not acknowledge the read-state update.",
              } satisfies FreshRssPendingReadMutation;
            }),
          });
          return "server-unavailable" as const;
        },
      );
      if (mutationOutcome === "server-unavailable") return mutationOutcome;
    }
  }
  return "complete";
}

function applyPendingReadOverrides(
  feeds: Feed[],
  bindings: FreshRssArticleBinding[],
  pendingValues: unknown[],
): boolean {
  const pendingByRemoteId = new Map<string, FreshRssPendingReadMutation>();
  for (const value of pendingValues) {
    if (isFreshRssPendingReadMutation(value)) {
      pendingByRemoteId.set(value.remoteArticleId, value);
    }
  }

  let changed = false;
  for (const binding of bindings) {
    const pending = pendingByRemoteId.get(binding.remoteArticleId);
    if (!pending) continue;
    const article = feeds
      .find((feed) => feed.feedId === binding.feedId)
      ?.items.find((item) => item.guid === binding.guid);
    if (!article || article.read === pending.desiredState) continue;
    article.read = pending.desiredState;
    changed = true;
  }
  return changed;
}
