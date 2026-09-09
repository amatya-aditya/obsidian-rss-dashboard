import type { FreshRssConnectionScope } from "./freshrss-connection-service";
import {
  isSynchronizableFacet,
  type FreshRssLabelMapping,
  type FreshRssPendingFacetMutation,
} from "./freshrss-facet-mutations";
import {
  initialFreshRssSyncHealth,
  type FreshRssSyncHealth,
} from "./freshrss-backoff";

export type { FreshRssSyncHealth } from "./freshrss-backoff";

export type { FreshRssLabelMapping } from "./freshrss-facet-mutations";

const FRESHRSS_SIDECAR_VERSION = 2;

export interface FreshRssSidecarStore {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
}

/** A local feed bound to a FreshRSS subscription, both sides opaque remote references. */
export interface FreshRssFeedBinding {
  feedId: string;
  remoteSubscriptionId: string;
}

/** A local feed item bound to a FreshRSS article, both sides opaque remote references. */
export interface FreshRssArticleBinding {
  feedId: string;
  guid: string;
  remoteArticleId: string;
}

/** Recorded only once a subscription's bounded read completes without a continuation. */
export interface FreshRssSyncCheckpoint {
  remoteSubscriptionId: string;
  completedAtMs: number;
  /**
   * The continuation cursor an interrupted or budget-capped "Fetch more
   * history" invocation (ticket 10) last persisted, so the next invocation
   * resumes deeper into this subscription's content stream instead of
   * re-walking already-processed pages. Optional on the wire so a checkpoint
   * written before this field existed still parses and activates losslessly;
   * absent/null means either the subscription is already fully enumerated
   * (`completedAtMs` set) or no "Fetch more history" invocation has made
   * partial progress yet.
   */
  historyFetchCursor?: string | null;
}

export interface FreshRssSidecarFile {
  version: number;
  scope: FreshRssConnectionScope;
  pendingFacetMutations: FreshRssPendingFacetMutation[];
  feedBindings: FreshRssFeedBinding[];
  articleBindings: FreshRssArticleBinding[];
  checkpoints: FreshRssSyncCheckpoint[];
  /**
   * Currently known FreshRSS label mappings (normalized name -> exact opaque
   * remote tag reference + kind), rebuilt from tag discovery each successful
   * cycle. Optional on the wire so a sidecar written before this field
   * existed (ticket 04/05's version-2 shape) still parses and activates; a
   * missing key loads losslessly as an empty list rather than blocking
   * activation or bumping the schema version, matching how ticket 05 widened
   * the facet union without a version bump.
   */
  labelMappings: FreshRssLabelMapping[];
  /**
   * Durable cross-cycle retry/backoff bookkeeping for this scope: consecutive
   * cycles ending with an exhausted transient failure, and the earliest time
   * an automatic cycle should next be attempted (see `freshrss-backoff.ts`).
   * Optional on the wire for the same reason `labelMappings` is: a sidecar
   * written before this field existed still parses and activates losslessly,
   * defaulting to "no backoff owed", rather than being quarantined or
   * bumping the schema version.
   */
  syncHealth: FreshRssSyncHealth;
}

export type FreshRssSidecarActivationResult =
  | { outcome: "activated" }
  | { outcome: "sidecar-invalid" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isConnectionScope(value: unknown): value is FreshRssConnectionScope {
  return (
    isRecord(value) &&
    typeof value.endpoint === "string" &&
    Boolean(value.endpoint) &&
    typeof value.remoteUserId === "string" &&
    Boolean(value.remoteUserId)
  );
}

function isMutationError(value: unknown): boolean {
  if (value === null) return true;
  return (
    isRecord(value) &&
    (value.category === "auth-rejected" ||
      value.category === "terminal" ||
      value.category === "unavailable") &&
    typeof value.message === "string"
  );
}

function isPendingFacetMutation(
  value: unknown,
): value is FreshRssPendingFacetMutation {
  return (
    isRecord(value) &&
    typeof value.operationId === "string" &&
    Boolean(value.operationId) &&
    typeof value.remoteArticleId === "string" &&
    Boolean(value.remoteArticleId) &&
    isSynchronizableFacet(value.facet) &&
    typeof value.desiredState === "boolean" &&
    typeof value.createdAtMs === "number" &&
    Number.isFinite(value.createdAtMs) &&
    (value.lastAttemptAtMs === null || typeof value.lastAttemptAtMs === "number") &&
    typeof value.attemptCount === "number" &&
    Number.isFinite(value.attemptCount) &&
    isMutationError(value.error)
  );
}

function isLabelMapping(value: unknown): value is FreshRssLabelMapping {
  return (
    isRecord(value) &&
    typeof value.normalizedName === "string" &&
    Boolean(value.normalizedName) &&
    typeof value.remoteTagId === "string" &&
    Boolean(value.remoteTagId) &&
    typeof value.kind === "string" &&
    Boolean(value.kind) &&
    typeof value.displayName === "string"
  );
}

function isFeedBinding(value: unknown): value is FreshRssFeedBinding {
  return (
    isRecord(value) &&
    typeof value.feedId === "string" &&
    Boolean(value.feedId) &&
    typeof value.remoteSubscriptionId === "string" &&
    Boolean(value.remoteSubscriptionId)
  );
}

function isArticleBinding(value: unknown): value is FreshRssArticleBinding {
  return (
    isRecord(value) &&
    typeof value.feedId === "string" &&
    Boolean(value.feedId) &&
    typeof value.guid === "string" &&
    Boolean(value.guid) &&
    typeof value.remoteArticleId === "string" &&
    Boolean(value.remoteArticleId)
  );
}

function isSyncHealth(value: unknown): value is FreshRssSyncHealth {
  return (
    isRecord(value) &&
    typeof value.consecutiveTransientFailureCount === "number" &&
    Number.isFinite(value.consecutiveTransientFailureCount) &&
    (value.backoffUntilMs === null ||
      (typeof value.backoffUntilMs === "number" && Number.isFinite(value.backoffUntilMs)))
  );
}

function isSyncCheckpoint(value: unknown): value is FreshRssSyncCheckpoint {
  return (
    isRecord(value) &&
    typeof value.remoteSubscriptionId === "string" &&
    Boolean(value.remoteSubscriptionId) &&
    typeof value.completedAtMs === "number" &&
    Number.isFinite(value.completedAtMs) &&
    (value.historyFetchCursor === undefined ||
      value.historyFetchCursor === null ||
      typeof value.historyFetchCursor === "string")
  );
}

function parseSidecar(contents: string): FreshRssSidecarFile | null {
  try {
    const parsed: unknown = JSON.parse(contents);
    // `labelMappings` is optional on the wire: a sidecar written before this
    // field existed (ticket 04/05's version-2 shape) has no key for it at
    // all, and that must still parse and activate losslessly as an empty
    // list rather than being quarantined as invalid.
    const rawLabelMappings = isRecord(parsed) ? parsed.labelMappings : undefined;
    const rawSyncHealth = isRecord(parsed) ? parsed.syncHealth : undefined;
    if (
      !isRecord(parsed) ||
      parsed.version !== FRESHRSS_SIDECAR_VERSION ||
      !isConnectionScope(parsed.scope) ||
      !Array.isArray(parsed.pendingFacetMutations) ||
      !parsed.pendingFacetMutations.every(isPendingFacetMutation) ||
      !Array.isArray(parsed.feedBindings) ||
      !parsed.feedBindings.every(isFeedBinding) ||
      !Array.isArray(parsed.articleBindings) ||
      !parsed.articleBindings.every(isArticleBinding) ||
      !Array.isArray(parsed.checkpoints) ||
      !parsed.checkpoints.every(isSyncCheckpoint) ||
      !(rawLabelMappings === undefined ||
        (Array.isArray(rawLabelMappings) && rawLabelMappings.every(isLabelMapping))) ||
      !(rawSyncHealth === undefined || isSyncHealth(rawSyncHealth))
    ) {
      return null;
    }

    return {
      version: FRESHRSS_SIDECAR_VERSION,
      scope: parsed.scope,
      pendingFacetMutations: parsed.pendingFacetMutations,
      feedBindings: parsed.feedBindings,
      articleBindings: parsed.articleBindings,
      checkpoints: parsed.checkpoints,
      labelMappings: Array.isArray(rawLabelMappings) ? rawLabelMappings : [],
      syncHealth: isSyncHealth(rawSyncHealth) ? rawSyncHealth : initialFreshRssSyncHealth(),
    };
  } catch {
    return null;
  }
}

function hasSameScope(
  left: FreshRssConnectionScope,
  right: FreshRssConnectionScope,
): boolean {
  return (
    left.endpoint === right.endpoint && left.remoteUserId === right.remoteUserId
  );
}

function createEmptySidecar(scope: FreshRssConnectionScope): FreshRssSidecarFile {
  return {
    version: FRESHRSS_SIDECAR_VERSION,
    scope,
    pendingFacetMutations: [],
    feedBindings: [],
    articleBindings: [],
    checkpoints: [],
    labelMappings: [],
    syncHealth: initialFreshRssSyncHealth(),
  };
}

export class FreshRssSidecarRepository {
  constructor(
    private readonly store: FreshRssSidecarStore,
    private readonly paths: {
      sidecarPath: string;
      createQuarantinePath(): string;
    },
  ) {}

  public async activate(
    scope: FreshRssConnectionScope,
  ): Promise<FreshRssSidecarActivationResult> {
    if (!(await this.store.exists(this.paths.sidecarPath))) {
      await this.writeEmptyNamespace(scope);
      return { outcome: "activated" };
    }

    const currentContents = await this.store.read(this.paths.sidecarPath);
    const currentSidecar = parseSidecar(currentContents);
    if (!currentSidecar) {
      await this.store.write(this.paths.createQuarantinePath(), currentContents);
      return { outcome: "sidecar-invalid" };
    }

    if (hasSameScope(currentSidecar.scope, scope)) {
      return { outcome: "activated" };
    }

    await this.store.write(this.paths.createQuarantinePath(), currentContents);
    await this.writeEmptyNamespace(scope);
    return { outcome: "activated" };
  }

  /**
   * Reads whichever scope is currently active in the sidecar, without
   * requiring the caller to already know it. Used to bootstrap a sync cycle
   * from disk (e.g. after an app restart) before any scope can be confirmed
   * against a live connection test.
   */
  public async readActiveScope(): Promise<FreshRssConnectionScope | null> {
    if (!(await this.store.exists(this.paths.sidecarPath))) {
      return null;
    }

    const contents = await this.store.read(this.paths.sidecarPath);
    const sidecar = parseSidecar(contents);
    return sidecar ? sidecar.scope : null;
  }

  /**
   * Reads the sidecar's durable state for the given scope. Returns null when
   * the sidecar is missing, invalid, or bound to a different scope — callers
   * are expected to have called `activate()` for this scope first.
   */
  public async read(
    scope: FreshRssConnectionScope,
  ): Promise<FreshRssSidecarFile | null> {
    if (!(await this.store.exists(this.paths.sidecarPath))) {
      return null;
    }

    const contents = await this.store.read(this.paths.sidecarPath);
    const sidecar = parseSidecar(contents);
    if (!sidecar || !hasSameScope(sidecar.scope, scope)) {
      return null;
    }

    return sidecar;
  }

  /** Persists the full sidecar state. Callers own merging bindings/checkpoints. */
  public async write(file: FreshRssSidecarFile): Promise<void> {
    await this.store.write(
      this.paths.sidecarPath,
      JSON.stringify({ ...file, version: FRESHRSS_SIDECAR_VERSION }, null, 2),
    );
  }

  private async writeEmptyNamespace(scope: FreshRssConnectionScope): Promise<void> {
    await this.store.write(
      this.paths.sidecarPath,
      JSON.stringify(createEmptySidecar(scope), null, 2),
    );
  }
}
