import { describe, expect, it } from "vitest";
import {
  POCKET_CASTS_SHORT,
  detectPodcastPlatform,
  isPodcastPlatformUrl,
} from "../../../src/utils/podcast-platforms";

describe("POCKET_CASTS_SHORT detection", () => {
  it("detects a pca.st short link", () => {
    expect(POCKET_CASTS_SHORT.detect("https://pca.st/darknetdiaries")).toBe(
      true,
    );
  });

  it("detects pca.st with path variants", () => {
    expect(POCKET_CASTS_SHORT.detect("https://pca.st/abc123")).toBe(true);
    expect(POCKET_CASTS_SHORT.detect("http://pca.st/darknetdiaries")).toBe(
      true,
    );
  });

  it("does not detect pca.st root without a path slug", () => {
    expect(POCKET_CASTS_SHORT.detect("https://pca.st/")).toBe(false);
    expect(POCKET_CASTS_SHORT.detect("https://pca.st")).toBe(false);
  });

  it("does not detect unrelated hosts", () => {
    expect(POCKET_CASTS_SHORT.detect("https://example.com/pca.st")).toBe(false);
    expect(POCKET_CASTS_SHORT.detect("https://pocketcasts.com/podcast/x")).toBe(
      false,
    );
  });

  it("extracts the slug from a pca.st URL", () => {
    expect(POCKET_CASTS_SHORT.extractId("https://pca.st/darknetdiaries")).toBe(
      "darknetdiaries",
    );
    expect(POCKET_CASTS_SHORT.extractId("https://pca.st/abc-123")).toBe(
      "abc-123",
    );
  });

  it("returns null when there is no slug", () => {
    expect(POCKET_CASTS_SHORT.extractId("https://pca.st/")).toBeNull();
  });
});

describe("detectPodcastPlatform includes pca.st", () => {
  it("detects pca.st as a podcast platform", () => {
    const platform = detectPodcastPlatform("https://pca.st/darknetdiaries");
    expect(platform?.id).toBe("pocketcasts-short");
  });

  it("isPodcastPlatformUrl returns true for pca.st", () => {
    expect(isPodcastPlatformUrl("https://pca.st/darknetdiaries")).toBe(true);
  });
});
