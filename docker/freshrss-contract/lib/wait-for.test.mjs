import { test } from "node:test";
import assert from "node:assert/strict";
import { waitFor } from "./wait-for.mjs";

function fakeClock(startMs = 0) {
  let current = startMs;
  return {
    now: () => current,
    delay: async (ms) => {
      current += ms;
    },
  };
}

test("waitFor returns ready immediately when the check succeeds on the first attempt", async () => {
  const clock = fakeClock();
  const result = await waitFor(async () => "ok", {
    timeoutMs: 1000,
    intervalMs: 10,
    now: clock.now,
    delay: clock.delay,
  });
  assert.deepEqual(result, { ready: true, result: "ok" });
});

test("waitFor retries after a falsy result and eventually succeeds", async () => {
  const clock = fakeClock();
  let attempts = 0;
  const result = await waitFor(
    async () => {
      attempts += 1;
      return attempts >= 3 ? "ready" : false;
    },
    { timeoutMs: 1000, intervalMs: 10, now: clock.now, delay: clock.delay },
  );
  assert.equal(attempts, 3);
  assert.deepEqual(result, { ready: true, result: "ready" });
});

test("waitFor retries after the check throws, and does not propagate the error", async () => {
  const clock = fakeClock();
  let attempts = 0;
  const result = await waitFor(
    async () => {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("not ready yet");
      }
      return true;
    },
    { timeoutMs: 1000, intervalMs: 10, now: clock.now, delay: clock.delay },
  );
  assert.equal(attempts, 2);
  assert.equal(result.ready, true);
});

test("waitFor gives up and reports the last error once the timeout elapses", async () => {
  const clock = fakeClock();
  const result = await waitFor(
    async () => {
      throw new Error("still failing");
    },
    { timeoutMs: 35, intervalMs: 10, now: clock.now, delay: clock.delay },
  );
  assert.equal(result.ready, false);
  assert.equal(result.lastError?.message, "still failing");
});

test("waitFor never calls check once the deadline has already passed", async () => {
  const clock = fakeClock();
  let calls = 0;
  const result = await waitFor(async () => {
    calls += 1;
    return false;
  }, { timeoutMs: 0, intervalMs: 10, now: clock.now, delay: clock.delay });
  assert.equal(result.ready, false);
  assert.equal(calls, 0);
});
