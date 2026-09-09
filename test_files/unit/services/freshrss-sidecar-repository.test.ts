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
    });
  });

  it("quarantines a prior valid scope before activating a clean namespace", async () => {
    const previousState = JSON.stringify({
      version: 2,
      scope: { endpoint: "https://old.example.test/api/greader.php", remoteUserId: "old-user" },
      pendingFacetMutations: [{ articleId: "old-reference", facet: "read", value: true }],
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
      });
    });
  });
});
