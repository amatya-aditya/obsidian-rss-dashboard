/**
 * The one message a background import batch reports when feeds failed or timed
 * out (#1308). The message is emitted once per batch by the plugin, to the
 * sighted-user Notice and to the dashboard live region, so both read this.
 */
import { describe, expect, it } from "vitest";
import {
  hasImportFailures,
  importBatchFailureMessage,
  type ImportBatchSummary,
} from "../../../src/services/import-announcements";

function summary(
  overrides: Partial<ImportBatchSummary> = {},
): ImportBatchSummary {
  return { processedCount: 3, failed: 0, timedOut: 0, ...overrides };
}

describe("importBatchFailureMessage", () => {
  it("states the timed-out and failed counts and the recorded reason", () => {
    expect(
      importBatchFailureMessage(
        summary({
          failed: 2,
          timedOut: 1,
          lastError: "Not a valid RSS/Atom feed",
        }),
      ),
    ).toBe(
      "Background import finished: 1 feed timed out, 2 feeds failed. Last error: Not a valid RSS/Atom feed.",
    );
  });

  it("uses the singular for one failing feed and one timed-out feed", () => {
    expect(
      importBatchFailureMessage(
        summary({ failed: 1, lastError: "Request failed, status 500" }),
      ),
    ).toBe(
      "Background import finished: 1 feed failed. Last error: Request failed, status 500.",
    );
    expect(
      importBatchFailureMessage(
        summary({ timedOut: 1, lastError: "Timed out" }),
      ),
    ).toBe(
      "Background import finished: 1 feed timed out. Last error: Timed out.",
    );
  });

  it("leaves out the reason when the batch recorded none", () => {
    expect(importBatchFailureMessage(summary({ failed: 2 }))).toBe(
      "Background import finished: 2 feeds failed.",
    );
  });
});

describe("hasImportFailures", () => {
  it("is true for a failed feed", () => {
    expect(hasImportFailures(summary({ failed: 1 }))).toBe(true);
  });

  it("is true for a timed-out feed", () => {
    expect(hasImportFailures(summary({ timedOut: 1 }))).toBe(true);
  });

  it("is false for a batch that settled with none", () => {
    expect(hasImportFailures(summary())).toBe(false);
  });
});
