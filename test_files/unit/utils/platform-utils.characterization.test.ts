import { afterEach, describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "../../../src/utils/platform-utils";

describe("formatRelativeTime characterization", () => {
  const now = new Date(2026, 0, 15, 0, 0, 10);
  const examples: Array<[string, Date | string, string]> = [
    ["invalid input", "not-a-date", "Invalid date"],
    ["today", new Date(now.getTime() - 10_000), "Today"],
    ["future dates", new Date(now.getTime() + 24 * 60 * 60_000), "Just now"],
    ["seconds", new Date(now.getTime() - 45_000), "45 seconds ago"],
    ["minutes", new Date(now.getTime() - 2 * 60_000), "2 minutes ago"],
    ["hours", new Date(now.getTime() - 2 * 60 * 60_000), "2 hours ago"],
    ["days", new Date(now.getTime() - 2 * 24 * 60 * 60_000), "2 days ago"],
    ["weeks", new Date(now.getTime() - 8 * 24 * 60 * 60_000), "last week"],
    ["months", new Date(now.getTime() - 30 * 24 * 60 * 60_000), "last month"],
    ["years", new Date(now.getTime() - 365 * 24 * 60 * 60_000), "last year"],
  ];

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(examples)(
    "keeps the existing %s output",
    (_label, date, expected) => {
      vi.useFakeTimers();
      vi.setSystemTime(now);

      expect(formatRelativeTime(date)).toBe(expected);
    },
  );

  it("uses the manual unit strings when Intl.RelativeTimeFormat is unavailable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.stubGlobal("Intl", undefined);

    expect(formatRelativeTime(new Date(now.getTime() - 2 * 60_000))).toBe(
      "2 minutes ago",
    );
    expect(
      formatRelativeTime(new Date(now.getTime() - 2 * 24 * 60 * 60_000)),
    ).toBe("2 days ago");
    expect(formatRelativeTime(new Date(now.getTime() - 45_000))).toBe(
      "Just now",
    );
  });
});
