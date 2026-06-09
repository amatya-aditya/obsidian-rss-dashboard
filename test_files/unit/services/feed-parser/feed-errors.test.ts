import { describe, it, expect } from "vitest";
import {
  EmptyFeedError,
  isEmptyFeedError,
  formatFeedParseNoticeMessage,
} from "../../../../src/services/feed-parser/feed-errors.js";

describe("EmptyFeedError", () => {
  it("is detected by isEmptyFeedError", () => {
    const err = new EmptyFeedError();
    expect(isEmptyFeedError(err)).toBe(true);
  });

  it("regular Error is not detected as EmptyFeedError", () => {
    const err = new Error("something failed");
    expect(isEmptyFeedError(err)).toBe(false);
  });

  it("formatFeedParseNoticeMessage gives clear message for EmptyFeedError", () => {
    const err = new EmptyFeedError();
    const msg = formatFeedParseNoticeMessage(err);
    expect(msg).toContain("no items");
  });

  it("formatFeedParseNoticeMessage gives prefixed message for regular errors", () => {
    const err = new Error("network failed");
    const msg = formatFeedParseNoticeMessage(err, "Failed to load");
    expect(msg).toContain("Failed to load");
    expect(msg).toContain("network failed");
  });
});
