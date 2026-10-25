import { isRecord } from "./freshrss-type-guards";
import type { FreshRssConnectionScope } from "./freshrss-connection-service";

const FRESHRSS_SIDECAR_VERSION = 2;

export interface FreshRssConnectionScopeStore {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
}

export type FreshRssConnectionScopeActivationResult =
  { outcome: "activated" } | { outcome: "sidecar-invalid" };

interface FreshRssSidecarShell {
  version: number;
  scope: FreshRssConnectionScope;
  pendingFacetMutations: unknown[];
  feedBindings: unknown[];
  articleBindings: unknown[];
  checkpoints: unknown[];
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

function hasSidecarShape(value: unknown): value is FreshRssSidecarShell {
  return (
    isRecord(value) &&
    value.version === FRESHRSS_SIDECAR_VERSION &&
    isConnectionScope(value.scope) &&
    Array.isArray(value.pendingFacetMutations) &&
    Array.isArray(value.feedBindings) &&
    Array.isArray(value.articleBindings) &&
    Array.isArray(value.checkpoints)
  );
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

    let current: unknown;
    try {
      current = JSON.parse(contents) as unknown;
    } catch {
      await this.store.write(this.paths.createQuarantinePath(), contents);
      return { outcome: "sidecar-invalid" };
    }

    if (!hasSidecarShape(current) || !isConnectionScope(current.scope)) {
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

  private async writeEmptySidecar(
    scope: FreshRssConnectionScope,
  ): Promise<void> {
    await this.store.write(this.paths.sidecarPath, createEmptySidecar(scope));
  }
}
