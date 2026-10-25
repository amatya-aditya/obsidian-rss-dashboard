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
  let contents = initial;
  const files = new Map<string, string>();
  const store: FreshRssConnectionScopeStore = {
    exists: vi.fn(async () => contents !== null),
    read: vi.fn(async () => {
      if (contents === null) throw new Error("missing file");
      return contents;
    }),
    write: vi.fn(async (path, value) => {
      if (path === "sidecar.json") contents = value;
      else files.set(path, value);
    }),
  };
  return { store, files, getContents: () => contents };
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

  it("preserves and reports a malformed sidecar instead of overwriting it", async () => {
    const malformed = "not-json";
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
  });

  it("reads and writes sync state without dropping other FreshRSS metadata", async () => {
    const existing = JSON.stringify({
      version: 2,
      scope,
      pendingFacetMutations: [],
      feedBindings: [],
      articleBindings: [],
      checkpoints: [],
      labelMappings: [{ remoteLabelId: "label/1", localTagName: "News" }],
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
      labelMappings: [{ remoteLabelId: "label/1", localTagName: "News" }],
      syncHealth: { consecutiveTransientFailureCount: 2, backoffUntilMs: 500 },
      feedBindings: [{ feedId: "local-feed", remoteSubscriptionId: "feed/6" }],
    });
  });
});
