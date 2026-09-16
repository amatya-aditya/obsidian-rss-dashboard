import { describe, expect, it, vi } from "vitest";
import { decideWhatsNew, getWhatsNewFeatures } from "../../../src/utils/whats-new";

vi.mock("../../../src/generated/whats-new-content", () => ({
  WHATS_NEW_VERSION: "2.7.0",
  WHATS_NEW_FEATURES: ["Add a What's New popup"],
}));

describe("decideWhatsNew", () => {
  it("shows for a user who has never seen the popup before", () => {
    const result = decideWhatsNew({
      currentVersion: "2.7.0",
      lastShownVersion: undefined,
      features: ["A new feature"],
    });

    expect(result).toEqual({
      shouldShow: true,
      nextLastShownVersion: "2.7.0",
    });
  });

  it("shows when the running version is newer than the last shown version", () => {
    const result = decideWhatsNew({
      currentVersion: "2.7.0",
      lastShownVersion: "2.6.0",
      features: ["A new feature"],
    });

    expect(result).toEqual({
      shouldShow: true,
      nextLastShownVersion: "2.7.0",
    });
  });

  it("does not show again once the current version was already shown", () => {
    const result = decideWhatsNew({
      currentVersion: "2.7.0",
      lastShownVersion: "2.7.0",
      features: ["A new feature"],
    });

    expect(result).toEqual({
      shouldShow: false,
      nextLastShownVersion: "2.7.0",
    });
  });

  it("does not show for a release with no Features section, but still advances the marker", () => {
    const result = decideWhatsNew({
      currentVersion: "2.7.1",
      lastShownVersion: "2.6.0",
      features: null,
    });

    expect(result).toEqual({
      shouldShow: false,
      nextLastShownVersion: "2.7.1",
    });
  });

  it("treats an empty features list the same as no Features section", () => {
    const result = decideWhatsNew({
      currentVersion: "2.7.1",
      lastShownVersion: "2.6.0",
      features: [],
    });

    expect(result.shouldShow).toBe(false);
  });
});

describe("getWhatsNewFeatures", () => {
  it("returns the embedded features when the running version matches", () => {
    expect(getWhatsNewFeatures("2.7.0")).toEqual(["Add a What's New popup"]);
  });

  it("returns null when the running version doesn't match the embedded content", () => {
    expect(getWhatsNewFeatures("2.8.0")).toBeNull();
  });
});
