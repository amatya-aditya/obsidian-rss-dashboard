import { isRecord } from "./freshrss-type-guards";
import type { FreshRssConnectionScope } from "./freshrss-connection-service";

const FRESHRSS_SIDECAR_VERSION = 2;

export interface FreshRssConnectionScopeStore {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
}

export interface FreshRssFeedBinding {
  feedId: string;
  remoteSubscriptionId: string;
}

export interface FreshRssArticleBinding {
  feedId: string;
  guid: string;
  remoteArticleId: string;
}

export interface FreshRssSyncCheckpoint {
  remoteSubscriptionId: string;
  completedAtMs: number;
}

export interface FreshRssPendingReadMutation {
  operationId: string;
  remoteArticleId: string;
  facet: "read";
  desiredState: boolean;
  createdAtMs: number;
  attemptCount: number;
  lastError: string | null;
}

export interface FreshRssSidecarFile {
  version: number;
  scope: FreshRssConnectionScope;
  pendingFacetMutations: unknown[];
  feedBindings: FreshRssFeedBinding[];
  articleBindings: FreshRssArticleBinding[];
  checkpoints: FreshRssSyncCheckpoint[];
  [key: string]: unknown;
}

export type FreshRssConnectionScopeActivationResult =
  { outcome: "activated" } | { outcome: "sidecar-invalid" };

function isConnectionScope(value: unknown): value is FreshRssConnectionScope {
  return (
    isRecord(value) &&
    typeof value.endpoint === "string" &&
    Boolean(value.endpoint) &&
    typeof value.remoteUserId === "string" &&
    Boolean(value.remoteUserId)
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
      !Array.isArray(parsed.feedBindings) ||
      !parsed.feedBindings.every(isFeedBinding) ||
      !Array.isArray(parsed.articleBindings) ||
      !parsed.articleBindings.every(isArticleBinding) ||
      !Array.isArray(parsed.checkpoints) ||
      !parsed.checkpoints.every(isSyncCheckpoint)
    ) {
      return null;
    }

    return parsed as unknown as FreshRssSidecarFile;
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

function createEmptySidecar(scope: FreshRssConnectionScope): string {
  return JSON.stringify(
    {
      version: FRESHRSS_SIDECAR_VERSION,
      scope,
      pendingFacetMutations: [],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
      labelMappings: [],
      syncHealth: {
        consecutiveTransientFailureCount: 0,
        backoffUntilMs: null,
      },
    },
    null,
    2,
  );
}

/** Keeps the connection scope in the version-2 FreshRSS sidecar namespace. */
export class FreshRssConnectionScopeRepository {
  constructor(
    private readonly store: FreshRssConnectionScopeStore,
    private readonly paths: {
      sidecarPath: string;
      createQuarantinePath(): string;
    },
  ) {}

  public async activate(
    scope: FreshRssConnectionScope,
  ): Promise<FreshRssConnectionScopeActivationResult> {
    if (!(await this.store.exists(this.paths.sidecarPath))) {
      await this.writeEmptySidecar(scope);
      return { outcome: "activated" };
    }

    let contents: string;
    try {
      contents = await this.store.read(this.paths.sidecarPath);
    } catch {
      return { outcome: "sidecar-invalid" };
    }

    const current = parseSidecar(contents);
    if (!current) {
      await this.store.write(this.paths.createQuarantinePath(), contents);
      return { outcome: "sidecar-invalid" };
    }

    if (hasSameScope(current.scope, scope)) {
      return { outcome: "activated" };
    }

    await this.store.write(this.paths.createQuarantinePath(), contents);
    await this.writeEmptySidecar(scope);
    return { outcome: "activated" };
  }

  public async readActiveScope(): Promise<FreshRssConnectionScope | null> {
    if (!(await this.store.exists(this.paths.sidecarPath))) return null;
    const contents = await this.store.read(this.paths.sidecarPath);
    return parseSidecar(contents)?.scope ?? null;
  }

  public async read(
    scope: FreshRssConnectionScope,
  ): Promise<FreshRssSidecarFile | null> {
    if (!(await this.store.exists(this.paths.sidecarPath))) return null;
    const contents = await this.store.read(this.paths.sidecarPath);
    const sidecar = parseSidecar(contents);
    if (!sidecar || !hasSameScope(sidecar.scope, scope)) return null;
    return sidecar;
  }

  public async write(sidecar: FreshRssSidecarFile): Promise<void> {
    const current = await this.read(sidecar.scope);
    if (!current) {
      throw new Error("FreshRSS sync sidecar is missing or has changed scope.");
    }
    await this.store.write(
      this.paths.sidecarPath,
      JSON.stringify(
        { ...current, ...sidecar, version: FRESHRSS_SIDECAR_VERSION },
        null,
        2,
      ),
    );
  }

  private async writeEmptySidecar(
    scope: FreshRssConnectionScope,
  ): Promise<void> {
    await this.store.write(this.paths.sidecarPath, createEmptySidecar(scope));
  }
}
