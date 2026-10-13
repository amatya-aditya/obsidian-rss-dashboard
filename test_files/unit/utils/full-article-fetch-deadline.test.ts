import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as platformUtils from "../../../src/utils/platform-utils";
import { fetchFullArticleContentWithOutcome } from "../../../src/utils/full-article-fetch";

const FULL_URL = "https://journals.sagepub.com/doi/full/10.1/article";
const ABS_URL = FULL_URL.replace("/doi/full/", "/doi/abs/");
const RESTRICTED = `<html lang="en"><head><meta name="description" content="Original publisher description"></head><body>Subscription required. ${"x".repeat(220)}</body></html>`;
const ARTICLE = `<html><body><article><p>${"Readable abstract text. ".repeat(40)}</p></article></body></html>`;

describe("Sage full-article deadline (#954)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not start the abstract fallback after the full page times out", async () => {
    const fetch = vi
      .spyOn(platformUtils, "robustFetchDetailed")
      .mockReturnValue(new Promise(() => {}));
    const results: unknown[] = [];
    void fetchFullArticleContentWithOutcome(FULL_URL, undefined, 1).then(
      (result) => results.push(result),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(results).toEqual([
      { content: "", failureType: "network", failureReason: "timeout" },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("gives the abstract only the full page's remaining budget and retains restriction metadata", async () => {
    let finishFull!: (value: { text: string; status: number }) => void;
    const fetch = vi
      .spyOn(platformUtils, "robustFetchDetailed")
      .mockReturnValueOnce(new Promise((resolve) => (finishFull = resolve)))
      .mockReturnValueOnce(new Promise(() => {}));
    const results: unknown[] = [];
    void fetchFullArticleContentWithOutcome(FULL_URL, undefined, 5).then(
      (result) => results.push(result),
    );
    await vi.advanceTimersByTimeAsync(4000);
    finishFull({ text: RESTRICTED, status: 200 });
    await vi.advanceTimersByTimeAsync(999);
    expect(results).toEqual([]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([FULL_URL, ABS_URL]);
    await vi.advanceTimersByTimeAsync(1);
    expect(results).toEqual([
      expect.objectContaining({
        content: "",
        failureType: "restricted",
        failureReason: "timeout",
        pageMetadata: expect.objectContaining({
          metaDescription: "Original publisher description",
        }),
      }),
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the original page's metadata when the abstract fails without timing out", async () => {
    vi.spyOn(platformUtils, "robustFetchDetailed")
      .mockResolvedValueOnce({ text: RESTRICTED, status: 200 })
      .mockRejectedValueOnce(new Error("Network failure"));
    const result = await fetchFullArticleContentWithOutcome(
      FULL_URL,
      undefined,
      5,
    );
    expect(result).toMatchObject({
      content: "",
      failureType: "restricted",
      pageMetadata: { metaDescription: "Original publisher description" },
    });
    expect(result.failureReason).toBeUndefined();
  });

  it("returns a successful abstract that completes before the original deadline", async () => {
    vi.spyOn(platformUtils, "robustFetchDetailed")
      .mockResolvedValueOnce({ text: RESTRICTED, status: 200 })
      .mockResolvedValueOnce({ text: ARTICLE, status: 200 });
    const result = await fetchFullArticleContentWithOutcome(
      FULL_URL,
      undefined,
      5,
    );
    expect(result.failureType).toBe("none");
    expect(result.content).toContain("Readable abstract text.");
    expect(result.failureReason).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});
