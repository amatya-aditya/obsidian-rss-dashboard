import { describe, expect, it } from "vitest";
import {
  formatBuildLabel,
  getBuildInfo,
} from "../../../src/utils/build-info";

describe("formatBuildLabel", () => {
  it("names the version, short commit, and UTC build time so two devices can be compared", () => {
    expect(
      formatBuildLabel("2.7.0", {
        commit: "96cd0b7",
        dirty: false,
        builtAt: "2026-09-24T18:03:41.512Z",
      }),
    ).toBe("Version 2.7.0 · build 96cd0b7 · 2026-09-24 18:03 UTC");
  });

  it("marks a build made from uncommitted changes", () => {
    expect(
      formatBuildLabel("2.7.0", {
        commit: "96cd0b7",
        dirty: true,
        builtAt: "2026-09-24T18:03:41.512Z",
      }),
    ).toBe("Version 2.7.0 · build 96cd0b7+dirty · 2026-09-24 18:03 UTC");
  });

  it("still reads sensibly when the build had no git information", () => {
    expect(
      formatBuildLabel("2.7.0", { commit: "unknown", dirty: false, builtAt: "" }),
    ).toBe("Version 2.7.0 · build unknown");
  });
});

describe("getBuildInfo", () => {
  it("falls back to an unknown build when no build stamp was injected", () => {
    expect(getBuildInfo()).toEqual({
      commit: "unknown",
      dirty: false,
      builtAt: "",
    });
  });
});
