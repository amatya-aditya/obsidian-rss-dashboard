import type { Feed, FeedItem, RssDashboardSettings, Tag } from "../types/types";
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
  type FreshRssPendingFacetMutation,
  type FreshRssLabelMapping,
  type FreshRssSidecarFile,
  type FreshRssSyncCheckpoint,
} from "./freshrss-connection-scope-repository";
import {
  isFreshRssPendingFacetMutation,
  withFreshRssSidecarMutationLock,
} from "./freshrss-article-state";
import {
  FreshRssSyncClient,
  type FreshRssSubscription,
  type FreshRssLabel,
  type FreshRssLabelList,
} from "./freshrss-sync-client";

/** Maximum recent article IDs requested for each FreshRSS subscription. */
export const FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION = 50;
/** Maximum item IDs requested in one FreshRSS state-stream page. */
export const FRESHRSS_SYNC_STATE_PAGE_SIZE = 1000;
/** Maximum item IDs reconciled from one FreshRSS state stream per cycle. */
export const FRESHRSS_SYNC_STATE_ID_CAP = 25_000;
const FRESHRSS_READ_STATE_STREAM = "user/-/state/com.google/read";
const FRESHRSS_UNREAD_STATE_STREAM = "user/-/state/com.google/unread";
const FRESHRSS_STARRED_STATE_STREAM = "user/-/state/com.google/starred";

export interface FreshRssSyncOwner {
  signal: AbortSignal;
  beginCommit(): void;
  throwIfInactive(): void;
}

export interface FreshRssPreviewArticle {
  remoteArticleId: string;
  title: string;
  link: string | null;
}

export interface FreshRssPreviewSubscription {
  remoteSubscriptionId: string;
  title: string;
  url: string;
  articles: FreshRssPreviewArticle[];
  partial: boolean;
}

export type FreshRssSyncPreviewOutcome =
  | {
      outcome: "ready";
      subscriptions: FreshRssPreviewSubscription[];
      pendingMutations: FreshRssPendingFacetMutation[];
      labelConflicts: string[];
      partial: boolean;
    }
  | {
      outcome: "credentials-rejected" | "scope-mismatch" | "server-unavailable";
    };

export type FreshRssSyncRunStatus =
  "completed" | "incomplete" | "failed" | "cancelled" | "not-started";

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
  | { outcome: "incomplete" }
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
  sidecarRepository: Pick<FreshRssConnectionScopeRepository, "read" | "write"> &
    Partial<
      Pick<FreshRssConnectionScopeRepository, "clearQuarantinedForScope">
    >;
  getView: () => Promise<FreshRssDashboardView | null>;
}

interface FreshRssSyncAccumulator {
  feeds: Feed[];
  feedBindings: FreshRssFeedBinding[];
  articleBindings: FreshRssArticleBinding[];
  labelMappings: FreshRssLabelMapping[];
  availableTags: Tag[];
  remoteLabels: FreshRssLabel[];
  checkpoints: FreshRssSyncCheckpoint[];
  pendingCheckpointSubscriptionIds: string[];
  createdFeedCount: number;
  linkedFeedCount: number;
  ambiguousSubscriptionCount: number;
  importedArticleCount: number;
  partial: boolean;
  settingsChanged: boolean;
}

interface FreshRssSyncCommitInput {
  settings: RssDashboardSettings;
  originalFeeds: Feed[];
  originalAvailableTags: Tag[];
  syncState: FreshRssSyncAccumulator;
  scope: FreshRssConnectionScope;
  sidecarRepository: Pick<FreshRssConnectionScopeRepository, "read" | "write">;
  saveSettings: () => Promise<void>;
  owner: FreshRssSyncOwner;
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
  if (view.refresh) {
    view.refresh();
    return;
  }
  if (view.refreshSidebarOnly) {
    view.refreshSidebarOnly();
    return;
  }
  view.render();
}

type FreshRssPreparedSync =
  | {
      outcome: "ready";
      client: FreshRssSyncClient;
      sidecarState: FreshRssSidecarFile;
      settings: RssDashboardSettings;
    }
  | {
      outcome: "credentials-rejected" | "scope-mismatch" | "server-unavailable";
    };

type FreshRssArticleStatePreparation =
  | {
      outcome: "ready";
      labelMappings: FreshRssLabelMapping[];
      remoteLabels: FreshRssLabel[];
      availableTags: Tag[];
    }
  | { outcome: "credentials-rejected" | "server-unavailable" };

async function prepareFreshRssSync(
  input: FreshRssSyncRunInput,
  deps: Pick<
    FreshRssSyncCoordinatorDeps,
    "httpClient" | "sidecarRepository" | "getSettings"
  >,
): Promise<FreshRssPreparedSync> {
  const { owner } = input;
  owner.throwIfInactive();
  const authResult = await authenticateFreshRss(
    deps.httpClient,
    input.endpoint,
    input.credentials,
    owner.signal,
  );
  owner.throwIfInactive();
  if (authResult.outcome !== "authenticated") {
    return { outcome: authResult.outcome };
  }

  const identityResult = await identifyFreshRssUser(
    deps.httpClient,
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
    deps.httpClient,
    input.endpoint,
    authResult.authToken,
    owner.signal,
  );
  const sidecarState = await deps.sidecarRepository.read(input.scope);
  owner.throwIfInactive();
  if (!sidecarState) return { outcome: "server-unavailable" };
  return {
    outcome: "ready",
    client,
    sidecarState,
    settings: deps.getSettings(),
  };
}

async function prepareFreshRssArticleState(
  client: FreshRssSyncClient,
  sidecarRepository: Pick<FreshRssConnectionScopeRepository, "read" | "write">,
  scope: FreshRssConnectionScope,
  sidecarState: FreshRssSidecarFile,
  settings: RssDashboardSettings,
  owner: FreshRssSyncOwner,
): Promise<FreshRssArticleStatePreparation> {
  let labelMappings = [...(sidecarState.labelMappings ?? [])];
  let remoteLabels: FreshRssLabel[] = [];
  const availableTags = settings.availableTags.map((tag) => ({ ...tag }));

  const pendingStateOutcome = await flushPendingFacetMutations(
    client,
    sidecarRepository,
    scope,
    sidecarState.pendingFacetMutations,
    labelMappings,
    owner,
    (mutation) => mutation.facet !== "labels",
  );
  if (pendingStateOutcome !== "complete") {
    return { outcome: pendingStateOutcome };
  }

  const labelsResult = await client.listLabels();
  owner.throwIfInactive();
  if (labelsResult.outcome !== "ok") {
    return {
      outcome:
        labelsResult.outcome === "auth-rejected"
          ? "credentials-rejected"
          : "server-unavailable",
    };
  }
  const remoteLabelList = labelsResult.data;
  remoteLabels = remoteLabelList.labels;
  const labelState = reconcileLabelMappings(
    remoteLabels,
    remoteLabelList.folders,
    labelMappings,
    availableTags,
  );
  labelMappings = labelState.mappings;
  const blockedPendingMutations = await markCategoryCollisionMutationsManual(
    sidecarRepository,
    scope,
    sidecarState.pendingFacetMutations,
    remoteLabelList.folders,
    owner,
  );
  if (!blockedPendingMutations) return { outcome: "server-unavailable" };

  const labelMutationOutcome = await flushPendingFacetMutations(
    client,
    sidecarRepository,
    scope,
    sidecarState.pendingFacetMutations,
    labelMappings,
    owner,
    (mutation) => mutation.facet === "labels",
  );
  if (labelMutationOutcome !== "complete") {
    return { outcome: labelMutationOutcome };
  }

  appendPendingRemoteLabels(
    remoteLabels,
    sidecarState.pendingFacetMutations,
    labelMappings,
  );
  return {
    outcome: "ready",
    labelMappings,
    remoteLabels,
    availableTags,
  };
}

/** Imports remote subscriptions and bounded article history into current Core storage. */
export class FreshRssSyncCoordinator {
  constructor(private readonly deps: FreshRssSyncCoordinatorDeps) {}

  /** Reads the bounded incoming change set without applying or persisting it. */
  public async preview(
    input: FreshRssSyncRunInput,
  ): Promise<FreshRssSyncPreviewOutcome> {
    const prepared = await prepareFreshRssSync(input, this.deps);
    if (prepared.outcome !== "ready") return prepared;
    const subscriptionsResult = await prepared.client.listSubscriptions();
    input.owner.throwIfInactive();
    if (subscriptionsResult.outcome !== "ok") {
      return {
        outcome:
          subscriptionsResult.outcome === "auth-rejected"
            ? "credentials-rejected"
            : "server-unavailable",
      };
    }

    const labelsResult = await prepared.client.listLabels();
    input.owner.throwIfInactive();
    if (labelsResult.outcome !== "ok") {
      return {
        outcome:
          labelsResult.outcome === "auth-rejected"
            ? "credentials-rejected"
            : "server-unavailable",
      };
    }
    const labelConflicts = findLabelCategoryConflicts(
      labelsResult.data,
      prepared.settings,
      prepared.sidecarState.pendingFacetMutations,
    );

    let partial = false;
    const subscriptions: FreshRssPreviewSubscription[] = [];
    for (const subscription of subscriptionsResult.data) {
      input.owner.throwIfInactive();
      const idsResult = await prepared.client.listItemIds(
        subscription.remoteSubscriptionId,
        FRESHRSS_SYNC_ARTICLES_PER_SUBSCRIPTION,
      );
      input.owner.throwIfInactive();
      if (idsResult.outcome === "auth-rejected") {
        return { outcome: "credentials-rejected" };
      }
      if (idsResult.outcome !== "ok") {
        partial = true;
        subscriptions.push({ ...subscription, articles: [], partial: true });
        continue;
      }

      const articlesResult = await prepared.client.getItemContents(
        idsResult.data.itemRefs,
      );
      input.owner.throwIfInactive();
      if (articlesResult.outcome === "auth-rejected") {
        return { outcome: "credentials-rejected" };
      }
      if (articlesResult.outcome !== "ok") {
        partial = true;
        subscriptions.push({ ...subscription, articles: [], partial: true });
        continue;
      }

      subscriptions.push({
        ...subscription,
        articles: articlesResult.data.map(
          ({ remoteArticleId, title, link }) => ({
            remoteArticleId,
            title,
            link,
          }),
        ),
        partial: idsResult.data.continuation !== null,
      });
      partial ||= idsResult.data.continuation !== null;
    }

    return {
      outcome: "ready",
      subscriptions,
      pendingMutations: prepared.sidecarState.pendingFacetMutations.filter(
        isFreshRssPendingFacetMutation,
      ),
      labelConflicts,
      partial,
    };
  }

  public async run(input: FreshRssSyncRunInput): Promise<FreshRssSyncOutcome> {
    const { owner } = input;
    const prepared = await prepareFreshRssSync(input, this.deps);
    if (prepared.outcome !== "ready") return prepared;
    const { client, sidecarState, settings } = prepared;
    let labelMappings = [...(sidecarState.labelMappings ?? [])];
    let remoteLabels: FreshRssLabel[] = [];
    let availableTags = settings.availableTags.map((tag) => ({ ...tag }));
    if (settings.freshRss.stateSyncMode === "two-way") {
      const articleState = await prepareFreshRssArticleState(
        client,
        this.deps.sidecarRepository,
        input.scope,
        sidecarState,
        settings,
        owner,
      );
      if (articleState.outcome !== "ready") return articleState;
      labelMappings = articleState.labelMappings;
      remoteLabels = articleState.remoteLabels;
      availableTags = articleState.availableTags;
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
      labelMappings,
      availableTags,
      remoteLabels,
      checkpoints: sidecarState.checkpoints.map((checkpoint) => ({
        ...checkpoint,
      })),
      pendingCheckpointSubscriptionIds: [],
      createdFeedCount: 0,
      linkedFeedCount: 0,
      ambiguousSubscriptionCount: 0,
      importedArticleCount: 0,
      partial: false,
      settingsChanged: availableTags.length !== settings.availableTags.length,
    };

    const subscriptionOutcome = await this.syncSubscriptions(
      subscriptionsResult.data,
      client,
      syncState,
      settings,
      owner,
    );
    if (subscriptionOutcome === "credentials-rejected") {
      return { outcome: "credentials-rejected" };
    }

    let articleStateReconciliationComplete = true;
    if (settings.freshRss.stateSyncMode === "two-way") {
      const readStateOutcome = await reconcileArticleStateAndCheckpoints(
        client,
        syncState,
        owner,
      );
      if (readStateOutcome === "credentials-rejected") {
        return { outcome: "credentials-rejected" };
      }
      if (readStateOutcome === "partial") {
        syncState.partial = true;
        articleStateReconciliationComplete = false;
      }
    }

    owner.throwIfInactive();
    const commitOutcome = await commitFreshRssSync({
      settings,
      originalFeeds,
      originalAvailableTags: settings.availableTags,
      syncState,
      scope: input.scope,
      sidecarRepository: this.deps.sidecarRepository,
      saveSettings: this.deps.saveSettings,
      owner,
    });
    if (commitOutcome !== "committed") {
      return { outcome: commitOutcome };
    }
    await refreshViewOnce(this.deps.getView);

    if (!articleStateReconciliationComplete) {
      return { outcome: "incomplete" };
    }

    if (!syncState.partial) {
      try {
        await this.deps.sidecarRepository.clearQuarantinedForScope?.(
          input.scope,
        );
      } catch {
        // Keep recovery copies if cleanup fails; the completed sync is durable.
      }
    }

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

    if (idsResult.data.continuation !== null) return "partial";
    if (settings.freshRss.stateSyncMode === "two-way") {
      syncState.pendingCheckpointSubscriptionIds.push(
        subscription.remoteSubscriptionId,
      );
    } else {
      upsertCheckpoint(
        syncState.checkpoints,
        subscription.remoteSubscriptionId,
      );
    }
    return "complete";
  }

  private async syncSubscriptions(
    subscriptions: FreshRssSubscription[],
    client: FreshRssSyncClient,
    syncState: FreshRssSyncAccumulator,
    settings: RssDashboardSettings,
    owner: FreshRssSyncOwner,
  ): Promise<"complete" | "credentials-rejected"> {
    for (const subscription of subscriptions) {
      owner.throwIfInactive();
      const result = await this.syncSubscription(
        subscription,
        client,
        syncState,
        settings,
        owner,
      );
      if (result === "credentials-rejected") return result;
      if (result === "partial") syncState.partial = true;
    }
    return "complete";
  }
}

async function commitFreshRssSync(
  input: FreshRssSyncCommitInput,
): Promise<"committed" | "server-unavailable"> {
  return withFreshRssSidecarMutationLock(async () => {
    const latestSidecar = await input.sidecarRepository.read(input.scope);
    input.owner.throwIfInactive();
    if (!latestSidecar) return "server-unavailable";
    if (
      applyPendingFacetOverrides(
        input.syncState.feeds,
        input.syncState.articleBindings,
        latestSidecar.pendingFacetMutations,
        input.syncState.availableTags,
        input.syncState.labelMappings,
      )
    ) {
      input.syncState.settingsChanged = true;
    }

    input.owner.beginCommit();
    if (input.syncState.settingsChanged) {
      input.settings.feeds = input.syncState.feeds;
      input.settings.availableTags = input.syncState.availableTags;
      try {
        await input.saveSettings();
      } catch (error) {
        input.settings.feeds = input.originalFeeds;
        input.settings.availableTags = input.originalAvailableTags;
        throw error;
      }
    }
    await input.sidecarRepository.write({
      ...latestSidecar,
      version: 2,
      scope: input.scope,
      feedBindings: input.syncState.feedBindings,
      articleBindings: input.syncState.articleBindings,
      checkpoints: input.syncState.checkpoints,
      labelMappings: input.syncState.labelMappings,
    });
    return "committed";
  });
}

async function syncBoundArticleStates(input: {
  client: FreshRssSyncClient;
  syncState: FreshRssSyncAccumulator;
  owner: FreshRssSyncOwner;
}): Promise<"complete" | "partial" | "credentials-rejected"> {
  if (input.syncState.articleBindings.length === 0) return "complete";

  const readScan = await scanReadStateIds(
    input.client,
    FRESHRSS_READ_STATE_STREAM,
    input.owner,
  );
  if (readScan.outcome === "credentials-rejected") return readScan.outcome;
  const unreadScan = await scanReadStateIds(
    input.client,
    FRESHRSS_UNREAD_STATE_STREAM,
    input.owner,
  );
  if (unreadScan.outcome === "credentials-rejected") return unreadScan.outcome;

  const starredScan = await scanReadStateIds(
    input.client,
    FRESHRSS_STARRED_STATE_STREAM,
    input.owner,
  );
  if (starredScan.outcome === "credentials-rejected")
    return starredScan.outcome;

  if (readScan.outcome === "complete" && unreadScan.outcome === "complete") {
    applyRemoteReadIds(input.syncState, readScan.itemIds, unreadScan.itemIds);
  }
  if (starredScan.outcome === "complete") {
    applyRemoteStarredIds(input.syncState, starredScan.itemIds);
  }

  let labelsComplete = true;
  const labelStates = new Map<string, Set<string>>();
  for (const label of input.syncState.remoteLabels) {
    const labelScan = await scanReadStateIds(
      input.client,
      label.remoteLabelId,
      input.owner,
    );
    if (labelScan.outcome === "credentials-rejected") {
      return labelScan.outcome;
    }
    if (labelScan.outcome === "complete") {
      labelStates.set(label.remoteLabelId, labelScan.itemIds);
    } else {
      labelsComplete = false;
    }
  }
  if (labelsComplete) applyRemoteLabelStates(input.syncState, labelStates);

  return readScan.outcome === "complete" &&
    unreadScan.outcome === "complete" &&
    starredScan.outcome === "complete" &&
    labelsComplete
    ? "complete"
    : "partial";
}

async function reconcileArticleStateAndCheckpoints(
  client: FreshRssSyncClient,
  syncState: FreshRssSyncAccumulator,
  owner: FreshRssSyncOwner,
): Promise<"complete" | "partial" | "credentials-rejected"> {
  const outcome = await syncBoundArticleStates({ client, syncState, owner });
  if (outcome === "complete") {
    for (const remoteSubscriptionId of syncState.pendingCheckpointSubscriptionIds) {
      upsertCheckpoint(syncState.checkpoints, remoteSubscriptionId);
    }
  }
  return outcome;
}

type FreshRssReadStateScanResult =
  | { outcome: "complete" | "partial"; itemIds: Set<string> }
  | { outcome: "credentials-rejected" };

async function scanReadStateIds(
  client: FreshRssSyncClient,
  streamId: string,
  owner: FreshRssSyncOwner,
): Promise<FreshRssReadStateScanResult> {
  const itemIds = new Set<string>();
  const seenContinuations = new Set<string>();
  let continuation: string | null = null;
  let scannedIds = 0;
  while (scannedIds < FRESHRSS_SYNC_STATE_ID_CAP) {
    owner.throwIfInactive();
    const requestedCount = Math.min(
      FRESHRSS_SYNC_STATE_PAGE_SIZE,
      FRESHRSS_SYNC_STATE_ID_CAP - scannedIds,
    );
    const stateResult = await client.listItemIds(
      streamId,
      requestedCount,
      continuation,
    );
    owner.throwIfInactive();
    if (stateResult.outcome === "auth-rejected") {
      return { outcome: "credentials-rejected" };
    }
    if (stateResult.outcome === "unavailable") {
      return { outcome: "partial", itemIds };
    }

    scannedIds += stateResult.data.itemRefs.length;
    for (const remoteId of stateResult.data.itemRefs) {
      itemIds.add(remoteId);
    }
    if (stateResult.data.continuation === null) {
      return { outcome: "complete", itemIds };
    }
    if (
      seenContinuations.has(stateResult.data.continuation) ||
      stateResult.data.itemRefs.length === 0
    ) {
      return { outcome: "partial", itemIds };
    }
    if (scannedIds >= FRESHRSS_SYNC_STATE_ID_CAP) {
      return { outcome: "partial", itemIds };
    }
    seenContinuations.add(stateResult.data.continuation);
    continuation = stateResult.data.continuation;
  }
  return { outcome: "partial", itemIds };
}

function applyRemoteReadIds(
  syncState: FreshRssSyncAccumulator,
  remoteReadIds: Set<string>,
  remoteUnreadIds: Set<string>,
): void {
  for (const binding of syncState.articleBindings) {
    const remoteIsRead = remoteReadIds.has(binding.remoteArticleId);
    const remoteIsUnread = remoteUnreadIds.has(binding.remoteArticleId);
    if (remoteIsRead === remoteIsUnread) continue;
    const localArticle = syncState.feeds
      .find((feed) => feed.feedId === binding.feedId)
      ?.items.find((item) => item.guid === binding.guid);
    if (localArticle && localArticle.read !== remoteIsRead) {
      localArticle.read = remoteIsRead;
      syncState.settingsChanged = true;
    }
  }
}

function applyRemoteStarredIds(
  syncState: FreshRssSyncAccumulator,
  remoteStarredIds: Set<string>,
): void {
  for (const binding of syncState.articleBindings) {
    const article = findBoundArticle(syncState.feeds, binding);
    if (!article) continue;
    const starred = remoteStarredIds.has(binding.remoteArticleId);
    if (article.starred !== starred) {
      article.starred = starred;
      syncState.settingsChanged = true;
    }
  }
}

function applyRemoteLabelStates(
  syncState: FreshRssSyncAccumulator,
  statesByRemoteId: Map<string, Set<string>>,
): void {
  const taggedArticleIds = new Map<string, Set<string>>();
  for (const mapping of syncState.labelMappings) {
    const articleIds = statesByRemoteId.get(mapping.remoteLabelId);
    if (!articleIds) continue;
    const key = normalizedLabelKey(mapping.localTagName);
    const aggregate = taggedArticleIds.get(key) ?? new Set<string>();
    for (const articleId of articleIds) aggregate.add(articleId);
    taggedArticleIds.set(key, aggregate);
  }
  for (const binding of syncState.articleBindings) {
    const article = findBoundArticle(syncState.feeds, binding);
    if (!article) continue;
    const preservedKeys = new Set<string>();
    const desiredTags: Tag[] = (article.tags ?? []).flatMap((tag) => {
      const key = normalizedLabelKey(tag.name);
      if (
        preservedKeys.has(key) ||
        syncState.labelMappings.some(
          (mapping) => normalizedLabelKey(mapping.localTagName) === key,
        )
      ) {
        return [];
      }
      preservedKeys.add(key);
      return [{ ...tag }];
    });
    for (const mapping of syncState.labelMappings) {
      const key = normalizedLabelKey(mapping.localTagName);
      if (
        !taggedArticleIds.get(key)?.has(binding.remoteArticleId) ||
        desiredTags.some((tag) => normalizedLabelKey(tag.name) === key)
      ) {
        continue;
      }
      const tag = resolveLocalTag(
        syncState,
        mapping.localTagName,
        article.tags,
      );
      if (tag) desiredTags.push(tag);
    }
    if (sameNormalizedLabelSet(article.tags ?? [], desiredTags)) continue;
    article.tags = desiredTags;
    syncState.settingsChanged = true;
  }
}

function resolveLocalTag(
  syncState: FreshRssSyncAccumulator,
  name: string,
  articleTags?: Tag[],
): Tag | undefined {
  const key = normalizedLabelKey(name);
  const existing =
    syncState.availableTags.find(
      (tag) => normalizedLabelKey(tag.name) === key,
    ) ??
    syncState.feeds
      .flatMap((feed) => feed.items)
      .flatMap((item) => item.tags ?? [])
      .find((tag) => normalizedLabelKey(tag.name) === key) ??
    articleTags?.find((tag) => normalizedLabelKey(tag.name) === key);
  return existing ? { ...existing, name: existing.name.trim() } : undefined;
}

function sameNormalizedLabelSet(left: Tag[], right: Tag[]): boolean {
  const leftKeys = new Set(left.map((tag) => normalizedLabelKey(tag.name)));
  const rightKeys = new Set(right.map((tag) => normalizedLabelKey(tag.name)));
  return (
    leftKeys.size === rightKeys.size &&
    [...leftKeys].every((key) => rightKeys.has(key))
  );
}

function normalizedLabelKey(name: string): string {
  return name.trim().toLowerCase();
}

function findLabelCategoryConflicts(
  labelList: FreshRssLabelList,
  settings: RssDashboardSettings,
  pendingValues: unknown[],
): string[] {
  const localNames = new Map<string, string>();
  const localTags = [
    ...settings.availableTags,
    ...settings.feeds.flatMap((feed) =>
      feed.items.flatMap((item) => item.tags ?? []),
    ),
  ];
  for (const tag of localTags) {
    const name = tag.name.trim();
    const key = normalizedLabelKey(name);
    if (name && !localNames.has(key)) localNames.set(key, name);
  }
  for (const value of pendingValues) {
    if (!isFreshRssPendingFacetMutation(value) || value.facet !== "labels") {
      continue;
    }
    for (const name of value.desiredState) {
      const trimmedName = name.trim();
      const key = normalizedLabelKey(trimmedName);
      if (trimmedName && !localNames.has(key)) {
        localNames.set(key, trimmedName);
      }
    }
  }

  const conflicts = new Map<string, string>();
  for (const folder of labelList.folders) {
    const key = normalizedLabelKey(folder.name);
    const localName = localNames.get(key);
    if (localName && !conflicts.has(key)) conflicts.set(key, localName);
  }
  return [...conflicts.values()];
}

async function markCategoryCollisionMutationsManual(
  repository: Pick<FreshRssConnectionScopeRepository, "read" | "write">,
  scope: FreshRssConnectionScope,
  pendingValues: unknown[],
  folders: FreshRssLabel[],
  owner: FreshRssSyncOwner,
): Promise<boolean> {
  const folderNames = new Map(
    folders.map((folder) => [normalizedLabelKey(folder.name), folder.name]),
  );
  const hasQueuedCollision = pendingValues.some(
    (value) =>
      isFreshRssPendingFacetMutation(value) &&
      value.facet === "labels" &&
      value.retryDisposition !== "manual" &&
      value.desiredState.some((name) =>
        folderNames.has(normalizedLabelKey(name)),
      ),
  );
  if (!hasQueuedCollision) return true;

  owner.throwIfInactive();
  return withFreshRssSidecarMutationLock(async () => {
    owner.throwIfInactive();
    const current = await repository.read(scope);
    if (!current) return false;
    let changed = false;
    const pendingFacetMutations = current.pendingFacetMutations.map((value) => {
      if (
        !isFreshRssPendingFacetMutation(value) ||
        value.facet !== "labels" ||
        value.retryDisposition === "manual"
      ) {
        return value;
      }
      const collision = value.desiredState.find((name) =>
        folderNames.has(normalizedLabelKey(name)),
      );
      if (!collision) return value;
      const folderName = folderNames.get(normalizedLabelKey(collision));
      changed = true;
      return {
        ...value,
        attemptCount: value.attemptCount + 1,
        retryDisposition: "manual",
        lastError: `FreshRSS category "${folderName}" cannot sync as an article label. Rename the category or Dashboard tag, then retry.`,
      } satisfies FreshRssPendingFacetMutation;
    });
    owner.throwIfInactive();
    if (changed) {
      await repository.write({ ...current, pendingFacetMutations });
    }
    pendingValues.splice(0, pendingValues.length, ...pendingFacetMutations);
    return true;
  });
}

function reconcileLabelMappings(
  remoteLabels: FreshRssLabel[],
  folders: FreshRssLabel[],
  previousMappings: FreshRssLabelMapping[],
  availableTags: Tag[],
): { mappings: FreshRssLabelMapping[]; availableTags: Tag[] } {
  const remoteLabelIds = new Set(
    remoteLabels.map((label) => label.remoteLabelId),
  );
  const folderIds = new Set(folders.map((folder) => folder.remoteLabelId));
  const mappings = previousMappings.flatMap((mapping) => {
    if (folderIds.has(mapping.remoteLabelId)) return [];
    if (remoteLabelIds.has(mapping.remoteLabelId)) {
      return [{ ...mapping, remoteType: "tag" as const }];
    }
    return mapping.remoteType === "tag" ? [{ ...mapping }] : [];
  });
  for (const remoteLabel of remoteLabels) {
    const previous = previousMappings.find(
      (mapping) => mapping.remoteLabelId === remoteLabel.remoteLabelId,
    );
    const localTag = availableTags.find(
      (tag) =>
        normalizedLabelKey(tag.name) === normalizedLabelKey(remoteLabel.name),
    );
    const localTagName =
      previous?.localTagName ?? localTag?.name ?? remoteLabel.name;
    const existingIndex = mappings.findIndex(
      (mapping) => mapping.remoteLabelId === remoteLabel.remoteLabelId,
    );
    if (existingIndex >= 0) {
      const existing = mappings[existingIndex];
      if (existing) {
        const resolvedName = existing.localTagName || localTagName;
        mappings[existingIndex] = {
          remoteLabelId: remoteLabel.remoteLabelId,
          localTagName: resolvedName,
          remoteType: "tag",
        };
      }
      continue;
    }
    mappings.push({
      remoteLabelId: remoteLabel.remoteLabelId,
      localTagName,
      remoteType: "tag",
    });
    if (!localTag) {
      availableTags.push({ name: localTagName, color: "#808080" });
    }
  }
  return { mappings, availableTags };
}

function appendPendingRemoteLabels(
  remoteLabels: FreshRssLabel[],
  pendingValues: unknown[],
  labelMappings: FreshRssLabelMapping[],
): void {
  for (const value of pendingValues) {
    if (!isFreshRssPendingFacetMutation(value) || value.facet !== "labels") {
      continue;
    }
    for (const name of value.desiredState) {
      const mapping = labelMappings.find(
        (candidate) =>
          normalizedLabelKey(candidate.localTagName) ===
          normalizedLabelKey(name),
      );
      if (
        mapping &&
        !remoteLabels.some(
          (label) => label.remoteLabelId === mapping.remoteLabelId,
        )
      ) {
        remoteLabels.push({
          remoteLabelId: mapping.remoteLabelId,
          name: mapping.localTagName,
        });
      }
    }
  }
}

function findBoundArticle(
  feeds: Feed[],
  binding: FreshRssArticleBinding | undefined,
): FeedItem | undefined {
  if (!binding) return undefined;
  return feeds
    .find((feed) => feed.feedId === binding.feedId)
    ?.items.find((item) => item.guid === binding.guid);
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

async function flushPendingFacetMutations(
  client: FreshRssSyncClient,
  repository: Pick<FreshRssConnectionScopeRepository, "read" | "write">,
  scope: FreshRssConnectionScope,
  pendingValues: unknown[],
  labelMappings: FreshRssLabelMapping[],
  owner: FreshRssSyncOwner,
  shouldFlush: (mutation: FreshRssPendingFacetMutation) => boolean = () => true,
): Promise<FreshRssMutationFlushOutcome> {
  const pending = pendingValues.filter(
    (value): value is FreshRssPendingFacetMutation =>
      isFreshRssPendingFacetMutation(value) &&
      value.retryDisposition !== "manual" &&
      shouldFlush(value),
  );
  if (pending.length === 0) return "complete";

  const tokenResult = await client.getModificationToken();
  owner.throwIfInactive();
  if (tokenResult.outcome === "auth-rejected") return "credentials-rejected";
  if (tokenResult.outcome !== "ok") return "server-unavailable";

  for (const mutation of pending) {
    const { addTags, removeTags } = getRemoteMutationTags(
      mutation,
      labelMappings,
    );
    if (mutation.facet === "labels") {
      for (const name of mutation.desiredState) {
        const key = normalizedLabelKey(name);
        if (
          !labelMappings.some(
            (mapping) => normalizedLabelKey(mapping.localTagName) === key,
          )
        ) {
          labelMappings.push({
            remoteLabelId: `user/-/label/${name}`,
            localTagName: name,
            remoteType: "tag",
          });
        }
      }
    }
    const operationIds = new Set([mutation.operationId]);
    owner.throwIfInactive();
    const result = await client.updateArticleState(
      [mutation.remoteArticleId],
      addTags,
      removeTags,
      tokenResult.data,
    );
    owner.throwIfInactive();
    if (result.outcome === "auth-rejected") return "credentials-rejected";

    let mutationOutcome: "acknowledged" | "server-unavailable";
    try {
      mutationOutcome = await withFreshRssSidecarMutationLock(async () => {
        const current = await repository.read(scope);
        if (!current) return "server-unavailable" as const;
        const currentPending = current.pendingFacetMutations;
        if (result.outcome === "ok") {
          await repository.write({
            ...current,
            labelMappings,
            pendingFacetMutations: currentPending.filter(
              (value) =>
                !isFreshRssPendingFacetMutation(value) ||
                !operationIds.has(value.operationId),
            ),
          });
          return "acknowledged" as const;
        }
        await repository.write({
          ...current,
          pendingFacetMutations: currentPending.map((value) => {
            if (
              !isFreshRssPendingFacetMutation(value) ||
              !operationIds.has(value.operationId)
            ) {
              return value;
            }
            return {
              ...value,
              attemptCount: value.attemptCount + 1,
              lastError:
                result.outcome === "terminal-error"
                  ? `FreshRSS rejected the ${value.facet}-state update (HTTP ${result.status}).`
                  : `FreshRSS did not acknowledge the ${value.facet}-state update.`,
              ...(result.outcome === "terminal-error"
                ? { retryDisposition: "manual" as const }
                : {}),
            } satisfies FreshRssPendingFacetMutation;
          }),
        });
        return "server-unavailable" as const;
      });
    } catch {
      return "server-unavailable";
    }
    if (mutationOutcome === "server-unavailable") return mutationOutcome;
  }
  return "complete";
}

function getRemoteMutationTags(
  mutation: FreshRssPendingFacetMutation,
  mappings: FreshRssLabelMapping[],
): { addTags: string[]; removeTags: string[] } {
  if (mutation.facet === "read") {
    return {
      addTags: mutation.desiredState ? ["user/-/state/com.google/read"] : [],
      removeTags: mutation.desiredState ? [] : ["user/-/state/com.google/read"],
    };
  }
  if (mutation.facet === "starred") {
    return {
      addTags: mutation.desiredState ? [FRESHRSS_STARRED_STATE_STREAM] : [],
      removeTags: mutation.desiredState ? [] : [FRESHRSS_STARRED_STATE_STREAM],
    };
  }

  const desired = new Set(mutation.desiredState.map(normalizedLabelKey));
  const addTags: string[] = [];
  const seenDesired = new Set<string>();
  for (const name of mutation.desiredState) {
    const key = normalizedLabelKey(name);
    if (seenDesired.has(key)) continue;
    seenDesired.add(key);
    const mapping = mappings.find(
      (candidate) => normalizedLabelKey(candidate.localTagName) === key,
    );
    addTags.push(mapping?.remoteLabelId ?? `user/-/label/${name}`);
  }
  const removeTags = mappings
    .filter((mapping) => !desired.has(normalizedLabelKey(mapping.localTagName)))
    .map((mapping) => mapping.remoteLabelId);
  return { addTags, removeTags };
}

function applyPendingFacetOverrides(
  feeds: Feed[],
  bindings: FreshRssArticleBinding[],
  pendingValues: unknown[],
  availableTags: Tag[],
  labelMappings: FreshRssLabelMapping[],
): boolean {
  const pendingByKey = new Map<string, FreshRssPendingFacetMutation>();
  for (const value of pendingValues) {
    if (isFreshRssPendingFacetMutation(value)) {
      pendingByKey.set(`${value.remoteArticleId}:${value.facet}`, value);
    }
  }

  let changed = false;
  for (const binding of bindings) {
    const article = findBoundArticle(feeds, binding);
    if (!article) continue;
    const starred = pendingByKey.get(`${binding.remoteArticleId}:starred`);
    if (
      starred &&
      starred.facet === "starred" &&
      article.starred !== starred.desiredState
    ) {
      article.starred = starred.desiredState;
      changed = true;
    }
    const labels = pendingByKey.get(`${binding.remoteArticleId}:labels`);
    if (labels?.facet === "labels") {
      const tags = labels.desiredState.flatMap((name) => {
        const mapping = labelMappings.find(
          (candidate) =>
            normalizedLabelKey(candidate.localTagName) ===
            normalizedLabelKey(name),
        );
        const key = normalizedLabelKey(name);
        const tag =
          availableTags.find(
            (candidate) => normalizedLabelKey(candidate.name) === key,
          ) ??
          article.tags?.find(
            (candidate) => normalizedLabelKey(candidate.name) === key,
          );
        return [
          {
            name: tag?.name ?? mapping?.localTagName ?? name,
            color: tag?.color ?? "#808080",
          },
        ];
      });
      if (!sameNormalizedLabelSet(article.tags ?? [], tags)) {
        article.tags = tags;
        changed = true;
      }
    }
    const read = pendingByKey.get(`${binding.remoteArticleId}:read`);
    if (read?.facet === "read" && article.read !== read.desiredState) {
      article.read = read.desiredState;
      changed = true;
    }
  }
  return changed;
}
