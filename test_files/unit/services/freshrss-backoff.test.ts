import { describe, expect, it } from "vitest";
import {
  FRESHRSS_BACKOFF_INITIAL_MS,
  FRESHRSS_BACKOFF_MAX_MS,
  freshRssBackoffDurationMs,
  initialFreshRssSyncHealth,
  nextFreshRssSyncHealth,
} from "../../../src/services/freshrss-backoff";

describe("FreshRSS cross-cycle backoff", () => {
  describe("freshRssBackoffDurationMs", () => {
    it("returns zero for a non-positive consecutive-failure count", () => {
      expect(freshRssBackoffDurationMs(0)).toBe(0);
      expect(freshRssBackoffDurationMs(-1)).toBe(0);
    });

    it("starts at the initial 5-minute duration for the first consecutive failure", () => {
      expect(freshRssBackoffDurationMs(1)).toBe(FRESHRSS_BACKOFF_INITIAL_MS);
      expect(FRESHRSS_BACKOFF_INITIAL_MS).toBe(5 * 60 * 1000);
    });

    it("doubles for each further consecutive failure", () => {
      expect(freshRssBackoffDurationMs(2)).toBe(FRESHRSS_BACKOFF_INITIAL_MS * 2);
      expect(freshRssBackoffDurationMs(3)).toBe(FRESHRSS_BACKOFF_INITIAL_MS * 4);
      expect(freshRssBackoffDurationMs(4)).toBe(FRESHRSS_BACKOFF_INITIAL_MS * 8);
    });

    it("caps the duration at 6 hours no matter how many consecutive failures", () => {
      expect(FRESHRSS_BACKOFF_MAX_MS).toBe(6 * 60 * 60 * 1000);
      expect(freshRssBackoffDurationMs(10)).toBe(FRESHRSS_BACKOFF_MAX_MS);
      expect(freshRssBackoffDurationMs(1000)).toBe(FRESHRSS_BACKOFF_MAX_MS);
    });
  });

  describe("initialFreshRssSyncHealth", () => {
    it("starts with no owed backoff", () => {
      expect(initialFreshRssSyncHealth()).toEqual({
        consecutiveTransientFailureCount: 0,
        backoffUntilMs: null,
      });
    });
  });

  describe("nextFreshRssSyncHealth", () => {
    it("resets to zero backoff after a cycle with no exhausted transient failure", () => {
      const previous = { consecutiveTransientFailureCount: 3, backoffUntilMs: 999 };
      const result = nextFreshRssSyncHealth(previous, {
        transientFailureOccurred: false,
        nowMs: 1_000_000,
      });
      expect(result).toEqual({ consecutiveTransientFailureCount: 0, backoffUntilMs: null });
    });

    it("advances the count and schedules the first backoff deadline from a clean state", () => {
      const result = nextFreshRssSyncHealth(initialFreshRssSyncHealth(), {
        transientFailureOccurred: true,
        nowMs: 1_000_000,
      });
      expect(result).toEqual({
        consecutiveTransientFailureCount: 1,
        backoffUntilMs: 1_000_000 + FRESHRSS_BACKOFF_INITIAL_MS,
      });
    });

    it("advances the count further and doubles the deadline for consecutive transient failures", () => {
      const afterFirst = nextFreshRssSyncHealth(initialFreshRssSyncHealth(), {
        transientFailureOccurred: true,
        nowMs: 0,
      });
      const afterSecond = nextFreshRssSyncHealth(afterFirst, {
        transientFailureOccurred: true,
        nowMs: 1_000_000,
      });
      expect(afterSecond).toEqual({
        consecutiveTransientFailureCount: 2,
        backoffUntilMs: 1_000_000 + FRESHRSS_BACKOFF_INITIAL_MS * 2,
      });
    });

    it("resets a long backoff streak back to zero on the first cycle that fully succeeds", () => {
      let health = initialFreshRssSyncHealth();
      for (let i = 0; i < 5; i++) {
        health = nextFreshRssSyncHealth(health, { transientFailureOccurred: true, nowMs: 0 });
      }
      expect(health.consecutiveTransientFailureCount).toBe(5);

      const recovered = nextFreshRssSyncHealth(health, {
        transientFailureOccurred: false,
        nowMs: 42,
      });
      expect(recovered).toEqual({ consecutiveTransientFailureCount: 0, backoffUntilMs: null });
    });
  });
});
