import type { FreshRssConnectionScope } from "./freshrss-connection-service";

const FRESHRSS_SIDECAR_VERSION = 1;

export interface FreshRssSidecarStore {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, contents: string): Promise<void>;
}

interface FreshRssSidecarFile {
  version: number;
  scope: FreshRssConnectionScope;
  pendingFacetMutations: unknown[];
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

function parseSidecar(contents: string): FreshRssSidecarFile | null {
  try {
    const parsed: unknown = JSON.parse(contents);
    if (
      !isRecord(parsed) ||
      parsed.version !== FRESHRSS_SIDECAR_VERSION ||
      !isConnectionScope(parsed.scope) ||
      !Array.isArray(parsed.pendingFacetMutations)
    ) {
      return null;
    }

    return {
      version: FRESHRSS_SIDECAR_VERSION,
      scope: parsed.scope,
      pendingFacetMutations: parsed.pendingFacetMutations,
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

  private async writeEmptyNamespace(scope: FreshRssConnectionScope): Promise<void> {
    await this.store.write(
      this.paths.sidecarPath,
      JSON.stringify(createEmptySidecar(scope), null, 2),
    );
  }
}
