import type { FreshRssConnectionScope } from "./freshrss-connection-service";

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
}

export interface FreshRssSidecarFile {
  version: number;
  scope: FreshRssConnectionScope;
  pendingFacetMutations: unknown[];
  feedBindings: FreshRssFeedBinding[];
  articleBindings: FreshRssArticleBinding[];
  checkpoints: FreshRssSyncCheckpoint[];
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

function isPendingFacetMutation(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.articleId === "string" &&
    Boolean(value.articleId) &&
    (value.facet === "read" ||
      value.facet === "starred" ||
      value.facet === "label") &&
    (typeof value.value === "boolean" || typeof value.value === "string")
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

function isSyncCheckpoint(value: unknown): value is FreshRssSyncCheckpoint {
  return (
    isRecord(value) &&
    typeof value.remoteSubscriptionId === "string" &&
    Boolean(value.remoteSubscriptionId) &&
    typeof value.completedAtMs === "number" &&
    Number.isFinite(value.completedAtMs)
  );
}

function parseSidecar(contents: string): FreshRssSidecarFile | null {
  try {
    const parsed: unknown = JSON.parse(contents);
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
      !parsed.checkpoints.every(isSyncCheckpoint)
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
