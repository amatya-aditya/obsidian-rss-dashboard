import { describe, expect, it } from "vitest";
import {
  FreshRssSidecarRepository,
  type FreshRssSidecarStore,
} from "../../../src/services/freshrss-sidecar-repository";

function createStore(initialFiles: Record<string, string> = {}): FreshRssSidecarStore & {
  files: Map<string, string>;
} {
  const files = new Map(Object.entries(initialFiles));
  return {
    files,
    exists: async (path) => files.has(path),
    read: async (path) => files.get(path) ?? "",
    write: async (path, contents) => {
      files.set(path, contents);
    },
  };
}

describe("FreshRSS sidecar repository", () => {
  const scope = {
    endpoint: "https://reader.example.test/api/greader.php",
    remoteUserId: "opaque-user",
  };
  const sidecarPath = ".rss-dashboard-data/freshrss-state.json";
  const quarantinePath = ".rss-dashboard-data/freshrss-state.quarantine.json";

  it("creates an empty versioned namespace for a first proven scope", async () => {
    const store = createStore();
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => quarantinePath,
    });

    await expect(repository.activate(scope)).resolves.toEqual({ outcome: "activated" });
    expect(JSON.parse(store.files.get(sidecarPath) ?? "")).toEqual({
      version: 2,
      scope,
      pendingFacetMutations: [],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
      labelMappings: [],
      syncHealth: { consecutiveTransientFailureCount: 0, backoffUntilMs: null },
    });
  });

  it("quarantines a prior valid scope before activating a clean namespace", async () => {
    const previousState = JSON.stringify({
      version: 2,
      scope: { endpoint: "https://old.example.test/api/greader.php", remoteUserId: "old-user" },
      pendingFacetMutations: [
        {
          operationId: "old-op",
          remoteArticleId: "old-reference",
          facet: "read",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
      ],
      feedBindings: [{ feedId: "feed-1", remoteSubscriptionId: "sub-1" }],
      articleBindings: [],
      checkpoints: [],
    });
    const store = createStore({ [sidecarPath]: previousState });
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => quarantinePath,
    });

    await repository.activate(scope);

    expect(store.files.get(quarantinePath)).toBe(previousState);
    expect(JSON.parse(store.files.get(sidecarPath) ?? "")).toEqual({
      version: 2,
      scope,
      pendingFacetMutations: [],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
      labelMappings: [],
      syncHealth: { consecutiveTransientFailureCount: 0, backoffUntilMs: null },
    });
  });

  it("preserves malformed sidecar data in quarantine and blocks activation", async () => {
    const malformedState = "{not-json";
    const store = createStore({ [sidecarPath]: malformedState });
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => quarantinePath,
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "sidecar-invalid",
    });
    expect(store.files.get(sidecarPath)).toBe(malformedState);
    expect(store.files.get(quarantinePath)).toBe(malformedState);
  });

  it("quarantines incomplete v2 mutation data instead of activating it for a matching scope", async () => {
    const incompleteState = JSON.stringify({
      version: 2,
      scope,
      pendingFacetMutations: [null],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
    });
    const store = createStore({ [sidecarPath]: incompleteState });
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => quarantinePath,
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "sidecar-invalid",
    });
    expect(store.files.get(sidecarPath)).toBe(incompleteState);
    expect(store.files.get(quarantinePath)).toBe(incompleteState);
  });

  it("round-trips a pending starred-facet mutation alongside a pending read-facet mutation", async () => {
    const store = createStore();
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => quarantinePath,
    });
    await repository.activate(scope);
    const state = await repository.read(scope);
    expect(state).not.toBeNull();

    await repository.write({
      ...state!,
      pendingFacetMutations: [
        {
          operationId: "op-read",
          remoteArticleId: "article-1",
          facet: "read",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
        {
          operationId: "op-starred",
          remoteArticleId: "article-1",
          facet: "starred",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
      ],
    });

    const roundTripped = await repository.read(scope);
    expect(roundTripped?.pendingFacetMutations).toHaveLength(2);
    expect(roundTripped?.pendingFacetMutations.map((m) => m.facet).sort()).toEqual([
      "read",
      "starred",
    ]);
  });

  it("quarantines a pending mutation with a structurally invalid facet instead of activating it", async () => {
    const unknownFacetState = JSON.stringify({
      version: 2,
      scope,
      pendingFacetMutations: [
        {
          operationId: "op-1",
          remoteArticleId: "article-1",
          facet: "bogus",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
      ],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
    });
    const store = createStore({ [sidecarPath]: unknownFacetState });
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => quarantinePath,
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "sidecar-invalid",
    });
    expect(store.files.get(sidecarPath)).toBe(unknownFacetState);
    expect(store.files.get(quarantinePath)).toBe(unknownFacetState);
  });

  it("quarantines a v1 sidecar (no bindings/checkpoints) instead of silently activating it", async () => {
    const v1State = JSON.stringify({
      version: 1,
      scope,
      pendingFacetMutations: [],
    });
    const store = createStore({ [sidecarPath]: v1State });
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => quarantinePath,
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "sidecar-invalid",
    });
    expect(store.files.get(sidecarPath)).toBe(v1State);
    expect(store.files.get(quarantinePath)).toBe(v1State);
  });

  describe("readActiveScope", () => {
    it("returns null before the sidecar is ever activated", async () => {
      const store = createStore();
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });

      await expect(repository.readActiveScope()).resolves.toBeNull();
    });

    it("returns the currently active scope without requiring the caller to already know it", async () => {
      const store = createStore();
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });
      await repository.activate(scope);

      await expect(repository.readActiveScope()).resolves.toEqual(scope);
    });
  });

  describe("read/write", () => {
    it("returns null when the sidecar has never been activated", async () => {
      const store = createStore();
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });

      await expect(repository.read(scope)).resolves.toBeNull();
    });

    it("returns null when the sidecar is bound to a different scope", async () => {
      const store = createStore();
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });
      await repository.activate(scope);

      await expect(
        repository.read({ endpoint: "https://other.example.test", remoteUserId: "other" }),
      ).resolves.toBeNull();
    });

    it("round-trips feed bindings, article bindings, and checkpoints", async () => {
      const store = createStore();
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });
      await repository.activate(scope);

      const state = await repository.read(scope);
      expect(state).not.toBeNull();

      await repository.write({
        ...state!,
        feedBindings: [{ feedId: "feed-1", remoteSubscriptionId: "sub-1" }],
        articleBindings: [
          { feedId: "feed-1", guid: "guid-1", remoteArticleId: "article-1" },
        ],
        checkpoints: [{ remoteSubscriptionId: "sub-1", completedAtMs: 1000 }],
      });

      const roundTripped = await repository.read(scope);
      expect(roundTripped).toEqual({
        version: 2,
        scope,
        pendingFacetMutations: [],
        feedBindings: [{ feedId: "feed-1", remoteSubscriptionId: "sub-1" }],
        articleBindings: [
          { feedId: "feed-1", guid: "guid-1", remoteArticleId: "article-1" },
        ],
        checkpoints: [{ remoteSubscriptionId: "sub-1", completedAtMs: 1000 }],
        labelMappings: [],
        syncHealth: { consecutiveTransientFailureCount: 0, backoffUntilMs: null },
      });
    });
  });

  describe("label mappings", () => {
    it("loads a version-2 sidecar written before label mappings existed as an empty list, without a version bump", async () => {
      const preLabelState = JSON.stringify({
        version: 2,
        scope,
        pendingFacetMutations: [],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const store = createStore({ [sidecarPath]: preLabelState });
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });

      await expect(repository.activate(scope)).resolves.toEqual({ outcome: "activated" });
      const state = await repository.read(scope);
      expect(state?.labelMappings).toEqual([]);
    });

    it("accepts a well-formed dynamic label facet, widened from ticket 05's read/starred-only validation", async () => {
      const labelFacetState = JSON.stringify({
        version: 2,
        scope,
        pendingFacetMutations: [
          {
            operationId: "op-1",
            remoteArticleId: "article-1",
            facet: "label:tech",
            desiredState: true,
            createdAtMs: 1000,
            lastAttemptAtMs: null,
            attemptCount: 0,
            error: null,
          },
        ],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const store = createStore({ [sidecarPath]: labelFacetState });
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });

      await expect(repository.activate(scope)).resolves.toEqual({ outcome: "activated" });
      const state = await repository.read(scope);
      expect(state?.pendingFacetMutations).toEqual([
        {
          operationId: "op-1",
          remoteArticleId: "article-1",
          facet: "label:tech",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
      ]);
    });

    it("still quarantines a genuinely malformed facet (empty label name) instead of activating it", async () => {
      const malformedFacetState = JSON.stringify({
        version: 2,
        scope,
        pendingFacetMutations: [
          {
            operationId: "op-1",
            remoteArticleId: "article-1",
            facet: "label:",
            desiredState: true,
            createdAtMs: 1000,
            lastAttemptAtMs: null,
            attemptCount: 0,
            error: null,
          },
        ],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const store = createStore({ [sidecarPath]: malformedFacetState });
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });

      await expect(repository.activate(scope)).resolves.toEqual({
        outcome: "sidecar-invalid",
      });
      expect(store.files.get(quarantinePath)).toBe(malformedFacetState);
    });

    it("round-trips a label mapping alongside feed/article bindings", async () => {
      const store = createStore();
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });
      await repository.activate(scope);
      const state = await repository.read(scope);
      expect(state).not.toBeNull();

      await repository.write({
        ...state!,
        labelMappings: [
          { normalizedName: "tech", remoteTagId: "user/-/label/Tech", kind: "label", displayName: "Tech" },
        ],
      });

      const roundTripped = await repository.read(scope);
      expect(roundTripped?.labelMappings).toEqual([
        { normalizedName: "tech", remoteTagId: "user/-/label/Tech", kind: "label", displayName: "Tech" },
      ]);
    });

    it("quarantines a malformed label mapping (missing remote tag reference) instead of activating it", async () => {
      const malformedMappingState = JSON.stringify({
        version: 2,
        scope,
        pendingFacetMutations: [],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
        labelMappings: [{ normalizedName: "tech", kind: "label", displayName: "Tech" }],
      });
      const store = createStore({ [sidecarPath]: malformedMappingState });
      const repository = new FreshRssSidecarRepository(store, {
        sidecarPath,
        createQuarantinePath: () => quarantinePath,
      });

      await expect(repository.activate(scope)).resolves.toEqual({
        outcome: "sidecar-invalid",
      });
      expect(store.files.get(quarantinePath)).toBe(malformedMappingState);
    });
  });
});
