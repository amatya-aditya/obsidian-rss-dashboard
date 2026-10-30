import { describe, expect, it, vi } from "vitest";
import {
  FreshRssConnectionScopeRepository,
  type FreshRssConnectionScopeStore,
} from "../../../src/services/freshrss-connection-scope-repository";
import type { FreshRssConnectionScope } from "../../../src/services/freshrss-connection-service";

const scope: FreshRssConnectionScope = {
  endpoint: "https://reader.example.test/greader.php",
  remoteUserId: "remote-user",
};

function createStore(initial: string | null = null) {
  const files = new Map<string, string>();
  if (initial !== null) files.set("sidecar.json", initial);
  const store: FreshRssConnectionScopeStore = {
    exists: vi.fn(async (path) => files.has(path)),
    read: vi.fn(async (path) => {
      const contents = files.get(path);
      if (contents === undefined) throw new Error("missing file");
      return contents;
    }),
    write: vi.fn(async (path, value) => {
      files.set(path, value);
    }),
    list: vi.fn(async () => [...files.keys()]),
    remove: vi.fn(async (path) => {
      files.delete(path);
    }),
  };
  return { store, files, getContents: () => files.get("sidecar.json") ?? null };
}

function createSerializedSidecar(
  sidecarScope: FreshRssConnectionScope,
  pendingOperationId: string,
): string {
  return JSON.stringify({
    version: 2,
    scope: sidecarScope,
    pendingFacetMutations: pendingOperationId
      ? [
          {
            operationId: pendingOperationId,
            remoteArticleId: `article/${pendingOperationId}`,
            facet: "read",
            desiredState: true,
            createdAtMs: 100,
            attemptCount: 0,
            lastError: null,
          },
        ]
      : [],
    feedBindings: [
      {
        feedId: `local-${sidecarScope.remoteUserId}`,
        remoteSubscriptionId: `feed/${sidecarScope.remoteUserId}`,
      },
    ],
    articleBindings: [
      {
        feedId: `local-${sidecarScope.remoteUserId}`,
        guid: `guid-${sidecarScope.remoteUserId}`,
        remoteArticleId: `article/${sidecarScope.remoteUserId}`,
      },
    ],
    checkpoints: [
      {
        remoteSubscriptionId: `feed/${sidecarScope.remoteUserId}`,
        completedAtMs: 100,
      },
    ],
    labelMappings: [
      {
        remoteLabelId: `label/${sidecarScope.remoteUserId}`,
        localTagName: `Tag ${sidecarScope.remoteUserId}`,
      },
    ],
    syncHealth: { consecutiveTransientFailureCount: 2, backoffUntilMs: 500 },
  });
}

describe("FreshRSS connection scope repository", () => {
  it("creates a version-2 sidecar without credential or token fields", async () => {
    const { store, getContents } = createStore();
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath: "sidecar.json",
      createQuarantinePath: () => "quarantine.json",
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "activated",
    });
    const sidecar = JSON.parse(getContents() ?? "{}") as Record<
      string,
      unknown
    >;
    expect(sidecar).toMatchObject({ version: 2, scope });
    expect(sidecar).not.toHaveProperty("credential");
    expect(sidecar).not.toHaveProperty("authToken");
    expect(sidecar).not.toHaveProperty("writeToken");
  });

  it("preserves an existing sidecar when the validated scope is unchanged", async () => {
    const existing = JSON.stringify({
      version: 2,
      scope,
      pendingFacetMutations: [],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
    });
    const { store } = createStore(existing);
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath: "sidecar.json",
      createQuarantinePath: () => "quarantine.json",
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "activated",
    });
    expect(store.write).not.toHaveBeenCalled();
  });

  it("quarantines a prior scope before activating a different one", async () => {
    const existing = JSON.stringify({
      version: 2,
      scope,
      pendingFacetMutations: [],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
    });
    const { store, files, getContents } = createStore(existing);
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath: "sidecar.json",
      createQuarantinePath: () => "quarantine.json",
    });
    const nextScope = { ...scope, remoteUserId: "another-user" };

    await expect(repository.activate(nextScope)).resolves.toEqual({
      outcome: "activated",
    });
    expect(files.get("quarantine.json")).toBe(existing);
    expect(JSON.parse(getContents() ?? "{}")).toMatchObject({
      scope: nextScope,
    });
  });

  it("restores the newest complete sidecar for the exact returning scope", async () => {
    const nextScope = { ...scope, remoteUserId: "another-user" };
    const previousScope = { ...scope, remoteUserId: "previous-user" };
    const active = createSerializedSidecar(nextScope, "pending-next");
    const older = createSerializedSidecar(scope, "pending-old");
    const newest = createSerializedSidecar(scope, "pending-new");
    const sidecarPath = "rss-dashboard-data/freshrss-state.json";
    const oldQuarantinePath =
      "rss-dashboard-data/freshrss-state.quarantine-100-1.json";
    const newQuarantinePath =
      "rss-dashboard-data/freshrss-state.quarantine-200-1.json";
    const { store, files } = createStore();
    files.set(sidecarPath, active);
    files.set(oldQuarantinePath, older);
    files.set(newQuarantinePath, newest);
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath,
      quarantineFolder: "rss-dashboard-data",
      createQuarantinePath: () =>
        "rss-dashboard-data/freshrss-state.quarantine-300-1.json",
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "activated",
      restored: true,
      deferredPendingMutationCount: 1,
    });

    const restored = JSON.parse(files.get(sidecarPath) ?? "{}") as {
      scope: FreshRssConnectionScope;
      pendingFacetMutations: unknown[];
      feedBindings: unknown[];
      articleBindings: unknown[];
      checkpoints: unknown[];
      labelMappings: unknown[];
      syncHealth: unknown;
    };
    expect(restored).toMatchObject({
      scope,
      pendingFacetMutations: [
        { operationId: "pending-new", desiredState: true },
      ],
      feedBindings: [{ feedId: "local-remote-user" }],
      articleBindings: [{ guid: "guid-remote-user" }],
      checkpoints: [{ completedAtMs: 100 }],
      labelMappings: [{ localTagName: "Tag remote-user" }],
      syncHealth: { consecutiveTransientFailureCount: 2 },
    });
    expect(files.get(oldQuarantinePath)).toBe(older);
    expect(files.get(newQuarantinePath)).toBe(newest);
    expect(
      files.get("rss-dashboard-data/freshrss-state.quarantine-300-1.json"),
    ).toBe(active);
    expect(restored.scope).not.toEqual(previousScope);
  });

  it("does not fall back when the newest matching sidecar is unsupported", async () => {
    const nextScope = { ...scope, remoteUserId: "another-user" };
    const active = createSerializedSidecar(nextScope, "pending-next");
    const older = createSerializedSidecar(scope, "pending-old");
    const unsupported = JSON.stringify({
      ...JSON.parse(createSerializedSidecar(scope, "pending-new")),
      version: 3,
    });
    const sidecarPath = "rss-dashboard-data/freshrss-state.json";
    const oldQuarantinePath =
      "rss-dashboard-data/freshrss-state.quarantine-100-1.json";
    const invalidQuarantinePath =
      "rss-dashboard-data/freshrss-state.quarantine-200-1.json";
    const { store, files } = createStore();
    files.set(sidecarPath, active);
    files.set(oldQuarantinePath, older);
    files.set(invalidQuarantinePath, unsupported);
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath,
      quarantineFolder: "rss-dashboard-data",
      createQuarantinePath: () =>
        "rss-dashboard-data/freshrss-state.quarantine-300-1.json",
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "sidecar-invalid",
    });

    expect(files.get(sidecarPath)).toBe(active);
    expect(files.get(oldQuarantinePath)).toBe(older);
    expect(files.get(invalidQuarantinePath)).toBe(unsupported);
  });

  it("does not restore state saved for the same user at another endpoint", async () => {
    const otherEndpointScope = {
      ...scope,
      endpoint: "https://other.example.test/greader.php",
    };
    const archived = createSerializedSidecar(
      otherEndpointScope,
      "other-server",
    );
    const sidecarPath = "rss-dashboard-data/freshrss-state.json";
    const archivedPath =
      "rss-dashboard-data/freshrss-state.quarantine-200-1.json";
    const { store, files } = createStore();
    files.set(archivedPath, archived);
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath,
      quarantineFolder: "rss-dashboard-data",
      createQuarantinePath: () =>
        "rss-dashboard-data/freshrss-state.quarantine-300-1.json",
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "activated",
    });

    expect(JSON.parse(files.get(sidecarPath) ?? "{}")).toMatchObject({
      scope,
      pendingFacetMutations: [],
    });
    expect(files.get(archivedPath)).toBe(archived);
  });

  it("clears only valid recovery copies for the completed scope", async () => {
    const otherScope = { ...scope, remoteUserId: "another-user" };
    const validPath = "rss-dashboard-data/freshrss-state.quarantine-300-1.json";
    const unsupportedPath =
      "rss-dashboard-data/freshrss-state.quarantine-200-1.json";
    const otherAccountPath =
      "rss-dashboard-data/freshrss-state.quarantine-100-1.json";
    const { store, files } = createStore();
    const valid = createSerializedSidecar(scope, "pending-valid");
    const unsupported = JSON.stringify({
      ...JSON.parse(createSerializedSidecar(scope, "pending-unsupported")),
      version: 3,
    });
    const otherAccount = createSerializedSidecar(
      otherScope,
      "pending-other-account",
    );
    files.set(validPath, valid);
    files.set(unsupportedPath, unsupported);
    files.set(otherAccountPath, otherAccount);
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath: "rss-dashboard-data/freshrss-state.json",
      quarantineFolder: "rss-dashboard-data",
      createQuarantinePath: () =>
        "rss-dashboard-data/freshrss-state.quarantine-400-1.json",
    });

    await repository.clearQuarantinedForScope(scope);

    expect(files.has(validPath)).toBe(false);
    expect(files.get(unsupportedPath)).toBe(unsupported);
    expect(files.get(otherAccountPath)).toBe(otherAccount);
  });

  it("keeps the active scope when saving it for a switch fails", async () => {
    const active = createSerializedSidecar(scope, "pending-active");
    const nextScope = { ...scope, remoteUserId: "another-user" };
    const { store, files } = createStore();
    files.set("rss-dashboard-data/freshrss-state.json", active);
    vi.mocked(store.write).mockImplementation(async (path, contents) => {
      if (path.includes("quarantine")) {
        throw new Error("disk full");
      }
      files.set(path, contents);
    });
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath: "rss-dashboard-data/freshrss-state.json",
      quarantineFolder: "rss-dashboard-data",
      createQuarantinePath: () =>
        "rss-dashboard-data/freshrss-state.quarantine-300-1.json",
    });

    await expect(repository.activate(nextScope)).rejects.toThrow("disk full");

    expect(files.get("rss-dashboard-data/freshrss-state.json")).toBe(active);
  });

  it("does not overwrite an existing recovery copy on a path collision", async () => {
    const active = createSerializedSidecar(scope, "pending-active");
    const existingRecoveryCopy = createSerializedSidecar(
      { ...scope, remoteUserId: "another-user" },
      "pending-recovery",
    );
    const collisionPath = "rss-dashboard-data/quarantine.json";
    const { store, files } = createStore();
    files.set("rss-dashboard-data/freshrss-state.json", active);
    files.set(collisionPath, existingRecoveryCopy);
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath: "rss-dashboard-data/freshrss-state.json",
      quarantineFolder: "rss-dashboard-data",
      createQuarantinePath: () => collisionPath,
    });

    await expect(
      repository.activate({ ...scope, remoteUserId: "third-user" }),
    ).rejects.toThrow("quarantine path already exists");

    expect(files.get("rss-dashboard-data/freshrss-state.json")).toBe(active);
    expect(files.get(collisionPath)).toBe(existingRecoveryCopy);
  });

  it("rolls back to the active scope when restoring a saved scope fails", async () => {
    const activeScope = { ...scope, remoteUserId: "another-user" };
    const active = createSerializedSidecar(activeScope, "pending-active");
    const saved = createSerializedSidecar(scope, "pending-saved");
    const sidecarPath = "rss-dashboard-data/freshrss-state.json";
    const savedPath = "rss-dashboard-data/freshrss-state.quarantine-100-1.json";
    const { store, files } = createStore();
    files.set(sidecarPath, active);
    files.set(savedPath, saved);
    let failedFirstActiveWrite = false;
    vi.mocked(store.write).mockImplementation(async (path, contents) => {
      files.set(path, contents);
      if (path === sidecarPath && !failedFirstActiveWrite) {
        failedFirstActiveWrite = true;
        throw new Error("restore interrupted");
      }
    });
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath,
      quarantineFolder: "rss-dashboard-data",
      createQuarantinePath: () =>
        "rss-dashboard-data/freshrss-state.quarantine-300-1.json",
    });

    await expect(repository.activate(scope)).rejects.toThrow(
      "restore interrupted",
    );

    expect(files.get(sidecarPath)).toBe(active);
    expect(files.get(savedPath)).toBe(saved);
    expect(
      files.get("rss-dashboard-data/freshrss-state.quarantine-300-1.json"),
    ).toBe(active);
  });

  it.each(["", "invalid", "not-json"])(
    "preserves and reports malformed sidecar contents (%j) instead of overwriting them",
    async (malformed) => {
      const { store, files, getContents } = createStore(malformed);
      const repository = new FreshRssConnectionScopeRepository(store, {
        sidecarPath: "sidecar.json",
        createQuarantinePath: () => "quarantine.json",
      });

      await expect(repository.activate(scope)).resolves.toEqual({
        outcome: "sidecar-invalid",
      });
      expect(files.get("quarantine.json")).toBe(malformed);
      expect(getContents()).toBe(malformed);
    },
  );

  it("reads and writes sync state without dropping other FreshRSS metadata", async () => {
    const existing = JSON.stringify({
      version: 2,
      scope,
      pendingFacetMutations: [],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
      labelMappings: [
        { remoteLabelId: "label/1", localTagName: "News" },
        {
          remoteLabelId: "label/2",
          localTagName: "Later",
          remoteType: "tag",
        },
      ],
      syncHealth: { consecutiveTransientFailureCount: 2, backoffUntilMs: 500 },
    });
    const { store, getContents } = createStore(existing);
    const repository = new FreshRssConnectionScopeRepository(store, {
      sidecarPath: "sidecar.json",
      createQuarantinePath: () => "quarantine.json",
    });
    const sidecar = await repository.read(scope);
    expect(sidecar?.labelMappings).toEqual([
      { remoteLabelId: "label/1", localTagName: "News" },
      {
        remoteLabelId: "label/2",
        localTagName: "Later",
        remoteType: "tag",
      },
    ]);
    expect(sidecar?.syncHealth).toEqual({
      consecutiveTransientFailureCount: 2,
      backoffUntilMs: 500,
    });

    await repository.write({
      ...sidecar!,
      feedBindings: [{ feedId: "local-feed", remoteSubscriptionId: "feed/6" }],
    });

    expect(JSON.parse(getContents() ?? "{}")).toMatchObject({
      labelMappings: [
        { remoteLabelId: "label/1", localTagName: "News" },
        {
          remoteLabelId: "label/2",
          localTagName: "Later",
          remoteType: "tag",
        },
      ],
      syncHealth: { consecutiveTransientFailureCount: 2, backoffUntilMs: 500 },
      feedBindings: [{ feedId: "local-feed", remoteSubscriptionId: "feed/6" }],
    });
  });
});
