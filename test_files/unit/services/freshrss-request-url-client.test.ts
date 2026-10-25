import { describe, expect, it, vi } from "vitest";
import {
  createFreshRssHttpClient,
  FreshRssRequestCancelledError,
} from "../../../src/services/freshrss-request-url-client";

describe("FreshRSS request URL client", () => {
  it("settles an in-flight request immediately when its operation is cancelled", async () => {
    const pending: {
      resolve?: (response: { status: number; text: string }) => void;
    } = {};
    const requestUrl = vi.fn(
      () =>
        new Promise<{ status: number; text: string }>((resolve) => {
          pending.resolve = resolve;
        }),
    );
    const client = createFreshRssHttpClient(requestUrl);
    const controller = new AbortController();
    const pendingRequest = client.request({
      url: "https://reader.example.test/reader/api/0/subscription/list",
      method: "GET",
      signal: controller.signal,
    });

    controller.abort();

    await expect(pendingRequest).rejects.toBeInstanceOf(
      FreshRssRequestCancelledError,
    );
    expect(requestUrl).toHaveBeenCalledOnce();

    pending.resolve?.({ status: 200, text: "late response" });
    await Promise.resolve();
  });

  it("does not start a request for an already-cancelled operation", async () => {
    const requestUrl = vi.fn();
    const client = createFreshRssHttpClient(requestUrl);
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.request({
        url: "https://reader.example.test/reader/api/0/subscription/list",
        method: "GET",
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(FreshRssRequestCancelledError);
    expect(requestUrl).not.toHaveBeenCalled();
  });
});
