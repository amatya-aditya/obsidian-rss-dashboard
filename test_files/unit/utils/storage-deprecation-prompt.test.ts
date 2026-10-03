import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_VERSION_DEFERRALS,
  canDeferByVersion,
  compareVersions,
  describeStorageMode,
  isDeprecatedStorageMode,
  nextMinorVersion,
  shouldShowStorageDeprecationPrompt,
} from "../../../src/utils/storage-deprecation-prompt";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("compareVersions", () => {
  it("orders by each numeric segment in turn", () => {
    expect(compareVersions("2.8.0", "2.7.0")).toBeGreaterThan(0);
    expect(compareVersions("2.7.0", "2.8.0")).toBeLessThan(0);
    expect(compareVersions("2.7.0", "2.7.0")).toBe(0);
  });

  it("compares numerically rather than lexically", () => {
    expect(compareVersions("2.10.0", "2.9.0")).toBeGreaterThan(0);
  });

  it("treats missing trailing segments as zero", () => {
    expect(compareVersions("3.0", "3.0.0")).toBe(0);
  });

  it("ignores a prerelease suffix so a beta counts as having reached its release", () => {
    expect(compareVersions("2.8.0-beta.1", "2.8.0")).toBe(0);
  });
});

describe("nextMinorVersion", () => {
  it("increments the minor and resets the patch", () => {
    expect(nextMinorVersion("2.7.0")).toBe("2.8.0");
    expect(nextMinorVersion("2.7.3")).toBe("2.8.0");
  });

  it("does not roll the minor into the major", () => {
    expect(nextMinorVersion("2.9.0")).toBe("2.10.0");
  });

  it("drops a prerelease suffix", () => {
    expect(nextMinorVersion("2.8.0-beta.2")).toBe("2.9.0");
  });
});

describe("isDeprecatedStorageMode", () => {
  it("covers legacy JSON and shard storage v1", () => {
    expect(isDeprecatedStorageMode("legacy-json")).toBe(true);
    expect(isDeprecatedStorageMode("vault-shards")).toBe(true);
  });

  it("does not cover shard storage v2", () => {
    expect(isDeprecatedStorageMode("vault-shards-v2")).toBe(false);
  });
});

describe("shouldShowStorageDeprecationPrompt", () => {
  it("never prompts on shard storage v2", () => {
    expect(
      shouldShowStorageDeprecationPrompt(
        { storageMode: "vault-shards-v2" },
        "2.7.0",
      ),
    ).toBe(false);
  });

  it("prompts on a deprecated mode that has never been deferred", () => {
    expect(
      shouldShowStorageDeprecationPrompt({ storageMode: "vault-shards" }, "2.7.0"),
    ).toBe(true);
  });

  it("stays quiet while the running version is below the deferral target", () => {
    expect(
      shouldShowStorageDeprecationPrompt(
        { storageMode: "legacy-json", storageMigrationDismissedUntil: "2.8.0" },
        "2.7.0",
      ),
    ).toBe(false);
  });

  it("prompts again once the deferral target is reached", () => {
    expect(
      shouldShowStorageDeprecationPrompt(
        { storageMode: "legacy-json", storageMigrationDismissedUntil: "2.8.0" },
        "2.8.0",
      ),
    ).toBe(true);
  });

  it("prompts again once the deferral target is passed", () => {
    expect(
      shouldShowStorageDeprecationPrompt(
        { storageMode: "legacy-json", storageMigrationDismissedUntil: "2.8.0" },
        "2.9.1",
      ),
    ).toBe(true);
  });

  it("prompts a beta of the deferral target", () => {
    expect(
      shouldShowStorageDeprecationPrompt(
        { storageMode: "vault-shards", storageMigrationDismissedUntil: "2.8.0" },
        "2.8.0-beta.1",
      ),
    ).toBe(true);
  });
});

describe("canDeferByVersion", () => {
  it("allows deferral up to the cap", () => {
    expect(canDeferByVersion(undefined)).toBe(true);
    expect(canDeferByVersion(0)).toBe(true);
    expect(canDeferByVersion(MAX_VERSION_DEFERRALS - 1)).toBe(true);
  });

  it("withdraws deferral once the cap is reached", () => {
    expect(canDeferByVersion(MAX_VERSION_DEFERRALS)).toBe(false);
    expect(canDeferByVersion(MAX_VERSION_DEFERRALS + 1)).toBe(false);
  });
});

describe("describeStorageMode", () => {
  it("names each mode the way the prompt refers to it", () => {
    expect(describeStorageMode("legacy-json")).toBe("legacy JSON");
    expect(describeStorageMode("vault-shards")).toBe("shard storage v1");
    expect(describeStorageMode("vault-shards-v2")).toBe("shard storage v2");
  });
});
