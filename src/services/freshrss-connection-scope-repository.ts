import { isRecord } from "./freshrss-type-guards";
import type { FreshRssConnectionScope } from "./freshrss-connection-service";

const FRESHRSS_SIDECAR_VERSION = 2;

export interface FreshRssConnectionScopeStore {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
  list(folder: string): Promise<string[]>;
  remove(path: string): Promise<void>;
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

export interface FreshRssLabelMapping {
  remoteLabelId: string;
  localTagName: string;
  /** Missing on mappings written before category and article-label types were distinguished. */
  remoteType?: "tag";
}

interface FreshRssPendingMutationBase {
  operationId: string;
  remoteArticleId: string;
  createdAtMs: number;
  attemptCount: number;
  lastError: string | null;
  retryDisposition?: "automatic" | "manual";
}

export type FreshRssPendingFacetMutation =
  | (FreshRssPendingMutationBase & {
      facet: "read";
      desiredState: boolean;
    })
  | (FreshRssPendingMutationBase & {
      facet: "starred";
      desiredState: boolean;
    })
  | (FreshRssPendingMutationBase & {
      facet: "labels";
      desiredState: string[];
    });

export interface FreshRssSidecarFile {
  version: number;
  scope: FreshRssConnectionScope;
  pendingFacetMutations: unknown[];
  feedBindings: FreshRssFeedBinding[];
  articleBindings: FreshRssArticleBinding[];
  checkpoints: FreshRssSyncCheckpoint[];
  labelMappings?: FreshRssLabelMapping[];
  [key: string]: unknown;
}

export type FreshRssConnectionScopeActivationResult =
  | {
      outcome: "activated";
      restored?: boolean;
      deferredPendingMutationCount?: number;
    }
  | { outcome: "sidecar-invalid" };

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

function isLabelMapping(value: unknown): value is FreshRssLabelMapping {
  return (
    isRecord(value) &&
    typeof value.remoteLabelId === "string" &&
    Boolean(value.remoteLabelId) &&
    typeof value.localTagName === "string" &&
    Boolean(value.localTagName.trim()) &&
    (value.remoteType === undefined || value.remoteType === "tag")
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
      !parsed.checkpoints.every(isSyncCheckpoint) ||
      (parsed.labelMappings !== undefined &&
        (!Array.isArray(parsed.labelMappings) ||
          !parsed.labelMappings.every(isLabelMapping)))
    ) {
      return null;
    }

    return parsed as unknown as FreshRssSidecarFile;
  } catch {
    return null;
  }
}

function parseSidecarScope(contents: string): FreshRssConnectionScope | null {
  try {
    const parsed: unknown = JSON.parse(contents);
    return isRecord(parsed) && isConnectionScope(parsed.scope)
      ? parsed.scope
      : null;
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

interface QuarantinedSidecarPath {
  path: string;
  timestamp: number;
  sequence: number;
}

type ActiveSidecarReadResult =
  | { outcome: "read"; contents: string }
  | { outcome: "missing" }
  | { outcome: "invalid" };

function getQuarantinedSidecarPath(
  path: string,
  prefix: string,
): QuarantinedSidecarPath | null {
  if (!path.startsWith(prefix)) return null;
  const match = /^(\d+)-(\d+)\.json$/.exec(path.slice(prefix.length));
  if (!match)
    return {
      path,
      timestamp: Number.POSITIVE_INFINITY,
      sequence: Number.POSITIVE_INFINITY,
    };
  return {
    path,
    timestamp: Number(match[1]),
    sequence: Number(match[2]),
  };
}

function compareNewestFirst(
  left: QuarantinedSidecarPath,
  right: QuarantinedSidecarPath,
): number {
  return right.timestamp - left.timestamp || right.sequence - left.sequence;
}

/** Keeps the connection scope in the version-2 FreshRSS sidecar namespace. */
export class FreshRssConnectionScopeRepository {
  constructor(
    private readonly store: FreshRssConnectionScopeStore,
    private readonly paths: {
      sidecarPath: string;
      quarantineFolder?: string;
      createQuarantinePath(): string;
    },
  ) {}

  public async activate(
    scope: FreshRssConnectionScope,
  ): Promise<FreshRssConnectionScopeActivationResult> {
    const currentRead = await this.readCurrentContents();
    if (currentRead.outcome === "invalid") {
      return { outcome: "sidecar-invalid" };
    }
    const currentContents =
      currentRead.outcome === "read" ? currentRead.contents : null;
    const current =
      currentContents !== null ? parseSidecar(currentContents) : null;
    if (currentContents !== null && !current) {
      await this.writeQuarantinedSidecar(currentContents);
      return { outcome: "sidecar-invalid" };
    }

    if (current && hasSameScope(current.scope, scope)) {
      return { outcome: "activated" };
    }

    const deferredPendingMutationCount =
      current?.pendingFacetMutations.length ?? 0;
    if (currentContents) {
      await this.writeQuarantinedSidecar(currentContents);
    }

    const savedSidecar = await this.findNewestSavedSidecar(scope);
    if (savedSidecar === "invalid") return { outcome: "sidecar-invalid" };

    if (savedSidecar) {
      await this.writeActiveSidecar(savedSidecar.contents, currentContents);
      return {
        outcome: "activated",
        restored: true,
        ...(deferredPendingMutationCount > 0
          ? { deferredPendingMutationCount }
          : {}),
      };
    }

    await this.writeActiveSidecar(createEmptySidecar(scope), currentContents);
    return {
      outcome: "activated",
      ...(deferredPendingMutationCount > 0
        ? { deferredPendingMutationCount }
        : {}),
    };
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

  public async clearQuarantinedForScope(
    scope: FreshRssConnectionScope,
  ): Promise<void> {
    const prefix = this.getQuarantinePathPrefix();
    const quarantinedPaths = (await this.store.list(this.getQuarantineFolder()))
      .map((path) => getQuarantinedSidecarPath(path, prefix))
      .filter((candidate): candidate is QuarantinedSidecarPath =>
        Boolean(candidate),
      )
      .sort(compareNewestFirst);

    for (const candidate of quarantinedPaths) {
      const contents = await this.store.read(candidate.path);
      const archivedSidecar = parseSidecar(contents);
      if (archivedSidecar && hasSameScope(archivedSidecar.scope, scope)) {
        await this.store.remove(candidate.path);
      }
    }
  }

  private async readCurrentContents(): Promise<ActiveSidecarReadResult> {
    if (!(await this.store.exists(this.paths.sidecarPath))) {
      return { outcome: "missing" };
    }
    try {
      return {
        outcome: "read",
        contents: await this.store.read(this.paths.sidecarPath),
      };
    } catch {
      return { outcome: "invalid" };
    }
  }

  private async findNewestSavedSidecar(
    scope: FreshRssConnectionScope,
  ): Promise<{ path: string; contents: string } | "invalid" | null> {
    const prefix = this.getQuarantinePathPrefix();
    const candidates = (await this.store.list(this.getQuarantineFolder()))
      .map((path) => getQuarantinedSidecarPath(path, prefix))
      .filter((candidate): candidate is QuarantinedSidecarPath =>
        Boolean(candidate),
      )
      .sort(compareNewestFirst);

    for (const candidate of candidates) {
      let contents: string;
      try {
        contents = await this.store.read(candidate.path);
      } catch {
        return "invalid";
      }

      const archivedScope = parseSidecarScope(contents);
      if (!archivedScope) return "invalid";
      if (!hasSameScope(archivedScope, scope)) continue;
      if (!parseSidecar(contents)) return "invalid";
      return { path: candidate.path, contents };
    }
    return null;
  }

  private async writeQuarantinedSidecar(contents: string): Promise<void> {
    const path = this.paths.createQuarantinePath();
    if (await this.store.exists(path)) {
      throw new Error("FreshRSS sidecar quarantine path already exists.");
    }
    await this.store.write(path, contents);
    if ((await this.store.read(path)) !== contents) {
      throw new Error("FreshRSS sidecar quarantine could not be verified.");
    }
  }

  private async writeActiveSidecar(
    contents: string,
    previousContents: string | null,
  ): Promise<void> {
    try {
      await this.store.write(this.paths.sidecarPath, contents);
      if ((await this.store.read(this.paths.sidecarPath)) !== contents) {
        throw new Error("FreshRSS sidecar activation could not be verified.");
      }
    } catch (error) {
      try {
        if (previousContents !== null) {
          await this.store.write(this.paths.sidecarPath, previousContents);
          if (
            (await this.store.read(this.paths.sidecarPath)) !== previousContents
          ) {
            throw new Error("FreshRSS sidecar rollback could not be verified.");
          }
        } else if (await this.store.exists(this.paths.sidecarPath)) {
          await this.store.remove(this.paths.sidecarPath);
        }
      } catch {
        // The original sidecar remains in quarantine if rollback also fails.
      }
      throw error;
    }
  }

  private getQuarantinePathPrefix(): string {
    const folder = this.getQuarantineFolder().replace(/\/+$/g, "");
    return `${folder ? `${folder}/` : ""}freshrss-state.quarantine-`;
  }

  private getQuarantineFolder(): string {
    if (this.paths.quarantineFolder !== undefined) {
      return this.paths.quarantineFolder;
    }
    const separator = this.paths.sidecarPath.lastIndexOf("/");
    return separator === -1 ? "" : this.paths.sidecarPath.slice(0, separator);
  }
}
