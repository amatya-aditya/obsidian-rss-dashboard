import {
  requestUrl,
  type RequestUrlParam,
  type RequestUrlResponse,
} from "obsidian";
import type {
  FreshRssHttpClient,
  FreshRssHttpRequest,
} from "./freshrss-connection-service";

export class FreshRssRequestCancelledError extends Error {
  constructor() {
    super("FreshRSS request was cancelled.");
    this.name = "FreshRssRequestCancelledError";
  }
}

type RequestUrlInvoker = (
  request: RequestUrlParam,
) => Promise<Pick<RequestUrlResponse, "status" | "text">>;

function waitForRequestOrCancellation(
  request: Promise<Pick<RequestUrlResponse, "status" | "text">>,
  signal: AbortSignal,
): Promise<Pick<RequestUrlResponse, "status" | "text">> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const removeAbortListener = () =>
      signal.removeEventListener("abort", abort);
    const abort = () => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      reject(new FreshRssRequestCancelledError());
    };

    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    request.then(
      (response) => {
        if (settled) return;
        settled = true;
        removeAbortListener();
        resolve(response);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        removeAbortListener();
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export function createFreshRssHttpClient(
  invokeRequestUrl: RequestUrlInvoker = requestUrl,
): FreshRssHttpClient {
  return {
    async request(request: FreshRssHttpRequest) {
      const { signal, ...requestUrlParams } = request;
      if (signal?.aborted) {
        throw new FreshRssRequestCancelledError();
      }

      const requestPromise = Promise.resolve(
        invokeRequestUrl({ ...requestUrlParams, throw: false }),
      );
      const response = signal
        ? waitForRequestOrCancellation(requestPromise, signal)
        : requestPromise;
      const { status, text } = await response;
      return { status, text };
    },
  };
}
