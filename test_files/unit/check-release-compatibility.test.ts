import { describe, expect, it } from "vitest";
import { findReleaseCompatibilityViolations } from "../../scripts/check-release-compatibility.mjs";

describe("release compatibility metadata", () => {
  it("accepts a release whose map and manifest honor the support floor", () => {
    expect(
      findReleaseCompatibilityViolations(
        { version: "2.7.0", minAppVersion: "1.8.7" },
        {
          "2.6.0": "1.8.7",
          "2.7.0": "1.8.7",
        },
      ),
    ).toEqual([]);
  });

  it("rejects mappings below the declared support floor", () => {
    expect(
      findReleaseCompatibilityViolations(
        { version: "2.7.0", minAppVersion: "1.8.7" },
        {
          "2.6.0": "1.1.0",
          "2.7.0": "1.8.7",
        },
      ),
    ).toContainEqual(
      expect.objectContaining({
        rule: "minimum-support-floor",
        version: "2.6.0",
      }),
    );
  });

  it("requires the current release mapping to match its manifest", () => {
    expect(
      findReleaseCompatibilityViolations(
        { version: "2.7.0", minAppVersion: "1.8.7" },
        { "2.7.0": "1.7.2" },
      ),
    ).toContainEqual(
      expect.objectContaining({
        rule: "current-release-mapping",
        version: "2.7.0",
      }),
    );
  });

  it("requires the manifest version to be the newest mapped release", () => {
    expect(
      findReleaseCompatibilityViolations(
        { version: "2.6.0", minAppVersion: "1.8.7" },
        {
          "2.6.0": "1.8.7",
          "2.7.0-beta.1": "1.8.7",
        },
      ),
    ).toContainEqual(
      expect.objectContaining({ rule: "current-release-version" }),
    );
  });
});
