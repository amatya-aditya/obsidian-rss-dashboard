import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderContentVersions } from "../../../src/components/reader-content-versions";

describe("ReaderContentVersions pending status", () => {
  afterEach(() => {
    vi.useRealTimers();
    activeDocument.body.empty();
  });

  it("announces the pending fetch after the empty status region is inserted", async () => {
    vi.useFakeTimers();
    const container = activeDocument.body.createDiv();
    const versions = new ReaderContentVersions(
      container,
      () => {},
      () => {},
      false,
    );

    const status = container.querySelector(".rss-reader-fetch-status");
    expect(status?.textContent).toBe("");

    await vi.advanceTimersByTimeAsync(0);

    expect(status?.textContent).toBe("Fetching article content…");
    versions.dispose();
  });

  it("does not announce a stale pending fetch after the fetch is ready", async () => {
    vi.useFakeTimers();
    const container = activeDocument.body.createDiv();
    const versions = new ReaderContentVersions(
      container,
      () => {},
      () => {},
      false,
    );

    versions.ready();
    await vi.advanceTimersByTimeAsync(0);

    expect(
      container.querySelector(".rss-reader-fetch-status")?.textContent,
    ).toBe("Fetched content ready. RSS content is still shown.");
    versions.dispose();
  });
});
