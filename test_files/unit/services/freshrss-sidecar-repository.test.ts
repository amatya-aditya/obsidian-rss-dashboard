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

  it("creates an empty versioned namespace for a first proven scope", async () => {
    const store = createStore();
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath: ".rss-dashboard-data/freshrss-state.json",
      createQuarantinePath: () => ".rss-dashboard-data/freshrss-state.quarantine.json",
    });

    await expect(repository.activate(scope)).resolves.toEqual({ outcome: "activated" });
    expect(JSON.parse(store.files.get(".rss-dashboard-data/freshrss-state.json") ?? "")).toEqual({
      version: 1,
      scope,
      pendingFacetMutations: [],
    });
  });

  it("quarantines a prior valid scope before activating a clean namespace", async () => {
    const sidecarPath = ".rss-dashboard-data/freshrss-state.json";
    const previousState = JSON.stringify({
      version: 1,
      scope: { endpoint: "https://old.example.test/api/greader.php", remoteUserId: "old-user" },
      pendingFacetMutations: [{ articleId: "old-reference", facet: "read", value: true }],
    });
    const store = createStore({ [sidecarPath]: previousState });
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => ".rss-dashboard-data/freshrss-state.quarantine.json",
    });

    await repository.activate(scope);

    expect(store.files.get(".rss-dashboard-data/freshrss-state.quarantine.json")).toBe(previousState);
    expect(JSON.parse(store.files.get(sidecarPath) ?? "")).toEqual({
      version: 1,
      scope,
      pendingFacetMutations: [],
    });
  });

  it("preserves malformed sidecar data in quarantine and blocks activation", async () => {
    const sidecarPath = ".rss-dashboard-data/freshrss-state.json";
    const malformedState = "{not-json";
    const store = createStore({ [sidecarPath]: malformedState });
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => ".rss-dashboard-data/freshrss-state.quarantine.json",
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "sidecar-invalid",
    });
    expect(store.files.get(sidecarPath)).toBe(malformedState);
    expect(store.files.get(".rss-dashboard-data/freshrss-state.quarantine.json")).toBe(malformedState);
  });

  it("quarantines incomplete v1 mutation data instead of activating it for a matching scope", async () => {
    const sidecarPath = ".rss-dashboard-data/freshrss-state.json";
    const incompleteState = JSON.stringify({
      version: 1,
      scope,
      pendingFacetMutations: [null],
    });
    const store = createStore({ [sidecarPath]: incompleteState });
    const repository = new FreshRssSidecarRepository(store, {
      sidecarPath,
      createQuarantinePath: () => ".rss-dashboard-data/freshrss-state.quarantine.json",
    });

    await expect(repository.activate(scope)).resolves.toEqual({
      outcome: "sidecar-invalid",
    });
    expect(store.files.get(sidecarPath)).toBe(incompleteState);
    expect(store.files.get(".rss-dashboard-data/freshrss-state.quarantine.json")).toBe(incompleteState);
  });
});
