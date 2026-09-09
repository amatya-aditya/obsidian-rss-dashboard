import { beforeEach, describe, expect, it, vi } from "vitest";
import { FreshRssAutoSyncScheduler } from "../../../src/services/freshrss-auto-sync-scheduler";

describe("FreshRssAutoSyncScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
  });

  it("does not arm a timer until started", () => {
    const onWake = vi.fn();
    const scheduler = new FreshRssAutoSyncScheduler({ onWake });

    scheduler.armInMs(60_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(scheduler.isStarted).toBe(false);
  });

  it("arms a timer for the requested delay once started and wakes exactly once", async () => {
    const onWake = vi.fn();
    const scheduler = new FreshRssAutoSyncScheduler({ onWake });

    scheduler.start();
    scheduler.armInMs(60_000);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onWake).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("replaces a previously armed timer when rearmed before it fires", async () => {
    const onWake = vi.fn();
    const scheduler = new FreshRssAutoSyncScheduler({ onWake });

    scheduler.start();
    scheduler.armInMs(60_000);
    scheduler.armInMs(10_000);
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("disarm cancels a pending timer without disabling the scheduler", async () => {
    const onWake = vi.fn();
    const scheduler = new FreshRssAutoSyncScheduler({ onWake });

    scheduler.start();
    scheduler.armInMs(60_000);
    scheduler.disarm();
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onWake).not.toHaveBeenCalled();

    scheduler.armInMs(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onWake).toHaveBeenCalledTimes(1);
  });

  it("stop cancels a pending timer and prevents further arming until started again", async () => {
    const onWake = vi.fn();
    const scheduler = new FreshRssAutoSyncScheduler({ onWake });

    scheduler.start();
    scheduler.armInMs(60_000);
    scheduler.stop();
    expect(vi.getTimerCount()).toBe(0);

    // A rearm attempt after stop -- e.g. a cycle's completion handler racing
    // with unload -- must stay a no-op rather than resurrecting a timer.
    scheduler.armInMs(1_000);
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onWake).not.toHaveBeenCalled();
  });

  it("armInMs clamps a negative delay to fire immediately", async () => {
    const onWake = vi.fn();
    const scheduler = new FreshRssAutoSyncScheduler({ onWake });

    scheduler.start();
    scheduler.armInMs(-5_000);

    await vi.advanceTimersByTimeAsync(0);
    expect(onWake).toHaveBeenCalledTimes(1);
  });
});
