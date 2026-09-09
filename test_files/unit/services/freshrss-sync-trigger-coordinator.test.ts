import { describe, expect, it } from "vitest";
import { FreshRssSyncTriggerCoordinator } from "../../../src/services/freshrss-sync-trigger-coordinator";

/** A controllable deferred promise so tests can hold a "cycle" open on demand. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("FreshRssSyncTriggerCoordinator", () => {
  it("runs a single trigger immediately when idle", async () => {
    const calls: string[] = [];
    const coordinator = new FreshRssSyncTriggerCoordinator({
      runCycle: async (trigger) => {
        calls.push(trigger);
      },
    });

    await coordinator.trigger("manual");

    expect(calls).toEqual(["manual"]);
    expect(coordinator.isRunning).toBe(false);
  });

  it("coalesces triggers arriving while a cycle is running into exactly one trailing cycle", async () => {
    const calls: string[] = [];
    const gate = deferred<void>();
    let activeRuns = 0;
    let maxConcurrentRuns = 0;

    const coordinator = new FreshRssSyncTriggerCoordinator({
      runCycle: async (trigger) => {
        activeRuns++;
        maxConcurrentRuns = Math.max(maxConcurrentRuns, activeRuns);
        calls.push(trigger);
        if (calls.length === 1) {
          // Hold the first (startup) cycle open while several more triggers
          // arrive, then release it.
          await gate.promise;
        }
        activeRuns--;
      },
    });

    const first = coordinator.trigger("startup");
    // Let the first cycle actually start running before more triggers arrive.
    await Promise.resolve();
    expect(coordinator.isRunning).toBe(true);

    const second = coordinator.trigger("timer");
    const third = coordinator.trigger("timer");
    const fourth = coordinator.trigger("timer");

    gate.resolve();
    await Promise.all([first, second, third, fourth]);

    // Never more than one cycle in flight at a time.
    expect(maxConcurrentRuns).toBe(1);
    // The startup cycle ran, and every trigger that arrived while it was
    // busy coalesced into exactly one trailing cycle -- not three.
    expect(calls).toEqual(["startup", "timer"]);
  });

  it("lets a coalesced manual/retry trigger win the trailing slot over an automatic one", async () => {
    const calls: string[] = [];
    const gate = deferred<void>();

    const coordinator = new FreshRssSyncTriggerCoordinator({
      runCycle: async (trigger) => {
        calls.push(trigger);
        if (calls.length === 1) {
          await gate.promise;
        }
      },
    });

    const first = coordinator.trigger("timer");
    await Promise.resolve();

    const timerTrigger = coordinator.trigger("timer");
    const manualTrigger = coordinator.trigger("manual");
    // A further automatic trigger arriving after manual already claimed the
    // trailing slot must not evict it.
    const lateTimerTrigger = coordinator.trigger("timer");

    gate.resolve();
    await Promise.all([first, timerTrigger, manualTrigger, lateTimerTrigger]);

    expect(calls).toEqual(["timer", "manual"]);
  });

  it("resolves every coalesced waiter only after the trailing cycle it was folded into completes", async () => {
    const order: string[] = [];
    const gate = deferred<void>();

    const coordinator = new FreshRssSyncTriggerCoordinator({
      runCycle: async (trigger) => {
        order.push(`start:${trigger}`);
        if (trigger === "startup") {
          await gate.promise;
        }
        order.push(`end:${trigger}`);
      },
    });

    const first = coordinator.trigger("startup");
    await Promise.resolve();
    const second = coordinator.trigger("timer").then(() => {
      order.push("waiter-resolved");
    });

    gate.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual([
      "start:startup",
      "end:startup",
      "start:timer",
      "end:timer",
      "waiter-resolved",
    ]);
  });

  it("runs sequential triggers as separate cycles once each prior cycle has finished", async () => {
    const calls: string[] = [];
    const coordinator = new FreshRssSyncTriggerCoordinator({
      runCycle: async (trigger) => {
        calls.push(trigger);
      },
    });

    await coordinator.trigger("startup");
    await coordinator.trigger("manual");
    await coordinator.trigger("timer");

    expect(calls).toEqual(["startup", "manual", "timer"]);
  });
});
