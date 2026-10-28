import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProxyHealthTracker,
  proxyHealth,
  resetProxyHealth,
} from "../../../src/utils/proxy-health";

const A = "https://a.test/?u=";
const B = "https://b.test/?u=";
const C = "https://c.test/?u=";
const MINUTE = 60_000;

function makeTracker() {
  let clock = 1_000_000;
  const tracker = new ProxyHealthTracker(() => clock);
  return {
    tracker,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

/** Fails a proxy the way a dead one does: three network failures in a row. */
function failThrice(tracker: ProxyHealthTracker, prefix: string) {
  for (let i = 0; i < 3; i++) {
    tracker.beginAttempt(prefix, { force: true });
    tracker.record(prefix, "failure", 100);
  }
}

describe("ProxyHealthTracker (#955)", () => {
  describe("ordering", () => {
    it("keeps the preset order for proxies it has not seen", () => {
      const { tracker } = makeTracker();
      expect(tracker.order([A, B, C])).toEqual([A, B, C]);
    });

    it("puts a proxy that keeps working ahead of one it has no data on", () => {
      const { tracker } = makeTracker();
      tracker.record(C, "success", 300);
      expect(tracker.order([A, B, C])).toEqual([C, A, B]);
    });

    it("prefers the faster of two proxies with the same success rate", () => {
      const { tracker } = makeTracker();
      tracker.record(A, "success", 900);
      tracker.record(B, "success", 200);
      expect(tracker.order([A, B])).toEqual([B, A]);
    });

    it("ranks a proxy with recent failures below one it has no data on", () => {
      const { tracker } = makeTracker();
      tracker.record(A, "success", 100);
      tracker.record(A, "failure", 100);
      tracker.record(A, "failure", 100);
      expect(tracker.order([A, B])).toEqual([B, A]);
    });

    it("lets a proxy that failed earlier rise again as recent successes replace old failures", () => {
      const { tracker } = makeTracker();
      tracker.record(A, "failure", 100);
      tracker.record(A, "failure", 100);
      for (let i = 0; i < 10; i++) tracker.record(A, "success", 100);
      tracker.record(B, "success", 400);
      expect(tracker.order([B, A])).toEqual([A, B]);
    });
  });

  describe("cooldown", () => {
    it("skips a proxy for five minutes after three network failures in a row", () => {
      const { tracker, advance } = makeTracker();
      failThrice(tracker, A);
      expect(tracker.order([A, B])).toEqual([B]);
      advance(5 * MINUTE - 1);
      expect(tracker.order([A, B])).toEqual([B]);
    });

    it("does not bench a proxy on fewer than three failures in a row", () => {
      const { tracker } = makeTracker();
      tracker.record(A, "failure", 100);
      tracker.record(A, "failure", 100);
      expect(tracker.order([A, B])).toContain(A);
    });

    it("counts only consecutive failures: a success in between resets the run", () => {
      const { tracker } = makeTracker();
      tracker.record(A, "failure", 100);
      tracker.record(A, "failure", 100);
      tracker.record(A, "success", 100);
      tracker.record(A, "failure", 100);
      tracker.record(A, "failure", 100);
      expect(tracker.order([A, B])).toContain(A);
    });

    it("reports the cooldown when a failure benches the proxy", () => {
      const { tracker } = makeTracker();
      tracker.record(A, "failure", 100);
      tracker.record(A, "failure", 100);
      expect(tracker.record(A, "failure", 100)).toBe(5 * MINUTE);
    });

    it("offers one trial after the cooldown, after the healthy proxies", () => {
      const { tracker, advance } = makeTracker();
      failThrice(tracker, A);
      advance(5 * MINUTE);
      expect(tracker.order([A, B, C])).toEqual([B, C, A]);
      expect(tracker.beginAttempt(A)).toBe(true);
      expect(tracker.beginAttempt(A)).toBe(false);
    });

    it("clears the bench when the trial succeeds", () => {
      const { tracker, advance } = makeTracker();
      failThrice(tracker, A);
      advance(5 * MINUTE);
      tracker.beginAttempt(A);
      tracker.record(A, "success", 150);
      expect(tracker.beginAttempt(A)).toBe(true);
      expect(tracker.beginAttempt(A)).toBe(true);
      tracker.record(A, "failure", 100);
      expect(tracker.order([A, B])).toContain(A);
    });

    it("doubles the cooldown when the trial fails, up to an hour", () => {
      const { tracker, advance } = makeTracker();
      failThrice(tracker, A);
      const cooldowns: (number | undefined)[] = [];
      for (let i = 0; i < 6; i++) {
        advance(60 * MINUTE);
        tracker.beginAttempt(A);
        cooldowns.push(tracker.record(A, "failure", 100));
      }
      expect(cooldowns).toEqual([
        10 * MINUTE,
        20 * MINUTE,
        40 * MINUTE,
        60 * MINUTE,
        60 * MINUTE,
        60 * MINUTE,
      ]);
    });

    it("releases the trial slot when the trial request ends without a verdict", () => {
      const { tracker, advance } = makeTracker();
      failThrice(tracker, A);
      advance(5 * MINUTE);
      tracker.beginAttempt(A);
      tracker.record(A, "neutral", 100);
      expect(tracker.beginAttempt(A)).toBe(true);
    });
  });

  describe("site-level answers", () => {
    it("does not penalise a proxy for a neutral outcome such as a 403 or a block", () => {
      const { tracker } = makeTracker();
      for (let i = 0; i < 10; i++) tracker.record(A, "neutral", 100);
      expect(tracker.order([A, B])).toEqual([A, B]);
      expect(tracker.record(A, "neutral", 100)).toBeUndefined();
    });

    it("does not credit a proxy for a neutral outcome either", () => {
      const { tracker } = makeTracker();
      tracker.record(B, "neutral", 50);
      expect(tracker.order([A, B])).toEqual([A, B]);
    });

    it("leaves a failure run intact across a neutral outcome", () => {
      const { tracker } = makeTracker();
      tracker.record(A, "failure", 100);
      tracker.record(A, "failure", 100);
      tracker.record(A, "neutral", 100);
      expect(tracker.record(A, "failure", 100)).toBe(5 * MINUTE);
    });
  });

  describe("never empty", () => {
    it("tries every proxy when all are benched, least recently failed first", () => {
      const { tracker, advance } = makeTracker();
      failThrice(tracker, B);
      advance(10_000);
      failThrice(tracker, A);
      advance(10_000);
      failThrice(tracker, C);
      expect(tracker.order([A, B, C])).toEqual([B, A, C]);
    });

    it("lets a forced attempt through even while another trial is in flight", () => {
      const { tracker, advance } = makeTracker();
      failThrice(tracker, A);
      advance(5 * MINUTE);
      expect(tracker.beginAttempt(A)).toBe(true);
      expect(tracker.beginAttempt(A)).toBe(false);
      expect(tracker.beginAttempt(A, { force: true })).toBe(true);
    });

    it("lets an attempt on a benched proxy through when every proxy is benched", () => {
      const { tracker } = makeTracker();
      failThrice(tracker, A);
      failThrice(tracker, B);
      expect(tracker.order([A, B])).toEqual([A, B]);
      expect(tracker.beginAttempt(A)).toBe(true);
    });
  });

  describe("session state", () => {
    beforeEach(() => {
      resetProxyHealth();
    });

    it("forgets everything when reset", () => {
      failThrice(proxyHealth, A);
      expect(proxyHealth.order([A, B])).toEqual([B]);
      resetProxyHealth();
      expect(proxyHealth.order([A, B])).toEqual([A, B]);
    });

    it("keeps its results in memory only, never in browser storage", () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      failThrice(proxyHealth, A);
      proxyHealth.record(B, "success", 100);
      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    });
  });
});
