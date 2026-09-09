import { test } from "node:test";
import assert from "node:assert/strict";
import { assertNoSecretShapedKeys, buildContractArtifact } from "./artifact.mjs";

function baseInput(overrides = {}) {
  return {
    image: {
      reference: "ghcr.io/freshrss/freshrss:1.29.1@sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d",
      tag: "1.29.1",
      digest: "sha256:ab6b363102ccdbc39f6a62db926f567c61a5289bf25ba460f1c34423d8cc1a4d",
    },
    freshRssVersion: "1.29.1",
    readiness: {
      reachable: true,
      clientLogin: true,
      readProbe: true,
      modificationTokenProbe: true,
      fixtureDataObserved: true,
    },
    exercisedApiPaths: [
      "/api/greader.php/accounts/ClientLogin",
      "/api/greader.php/reader/api/0/subscription/list",
    ],
    scenarios: [{ name: "subscription discovery", passed: true }],
    startedAt: "2026-09-09T00:00:00.000Z",
    finishedAt: "2026-09-09T00:05:00.000Z",
    ...overrides,
  };
}

test("assertNoSecretShapedKeys accepts an object with no secret-shaped keys", () => {
  assert.doesNotThrow(() => assertNoSecretShapedKeys({ a: { b: [1, 2, { c: "fine" }] } }));
});

test("assertNoSecretShapedKeys rejects a nested key that looks like a credential", () => {
  assert.throws(
    () => assertNoSecretShapedKeys({ readiness: { authToken: "leaked" } }),
    /authToken/,
  );
});

test("assertNoSecretShapedKeys rejects secret-shaped keys inside arrays", () => {
  assert.throws(() => assertNoSecretShapedKeys([{ sessionId: "leaked" }]));
});

test("buildContractArtifact produces a well-formed artifact and sorts exercised paths", () => {
  const artifact = buildContractArtifact(baseInput());
  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.overallPassed, true);
  assert.deepEqual(
    artifact.exercisedApiPaths,
    [...baseInput().exercisedApiPaths].sort(),
  );
});

test("buildContractArtifact marks overallPassed false when any scenario fails", () => {
  const artifact = buildContractArtifact(
    baseInput({ scenarios: [{ name: "mutation", passed: false, detail: "no OK body" }] }),
  );
  assert.equal(artifact.overallPassed, false);
});

test("buildContractArtifact marks overallPassed false when readiness is incomplete", () => {
  const artifact = buildContractArtifact(
    baseInput({ readiness: { reachable: true, clientLogin: false, readProbe: false, modificationTokenProbe: false, fixtureDataObserved: false } }),
  );
  assert.equal(artifact.overallPassed, false);
});

test("buildContractArtifact never emits a credential/session/token-shaped field", () => {
  // This is the behavioral guarantee the ticket requires of CI artifacts.
  // Guard it end-to-end (not just via assertNoSecretShapedKeys) so a future
  // change to buildContractArtifact's shape cannot silently reintroduce one.
  const artifact = buildContractArtifact(baseInput());
  assert.doesNotThrow(() => assertNoSecretShapedKeys(artifact));
});
