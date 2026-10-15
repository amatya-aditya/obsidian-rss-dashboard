import { vi } from "vitest";
import type { RequestUrlResponse } from "obsidian";
import * as obsidian from "obsidian";

// Shared by the feed-fetch characterization tests. `requestUrl` is the only
// network seam: `robustFetch` and the two direct `requestUrl` calls in
// `fetchFeedXml` both go through it, so serving it observes every request.

export const TARGET = "https://example.com/feed.xml";
export const ENCODED_TARGET = encodeURIComponent(TARGET);
export const DIRECT = { enabled: false, url: "" };

// The one header every feed request carries since #1162: the feed Accept, and
// no User-Agent, so Obsidian sends its own.
export const ACCEPT_ALL =
  "application/feed+json, application/rss+xml, application/atom+xml, application/rdf+xml, application/xml, text/xml;q=0.9, */*;q=0.8";

export function feedXml(label: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>${label}</title><item><title>${label} item</title></item></channel></rss>`;
}

/** A page that is neither a feed nor a WordPress page. */
export function plainPage(markup = ""): string {
  return `<html><body>${markup}</body></html>`;
}

/** A page that sends `fetchFeedXml` down the WordPress fallback route. */
export function wpPage(markup = ""): string {
  return `<html><body>WordPress ${markup}</body></html>`;
}

/** A feed whose title is "Привет" in windows-1251 and declares no charset. */
export function windows1251Feed(): Uint8Array {
  const head = new TextEncoder().encode("<rss><channel><title>");
  const title = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
  const tail = new TextEncoder().encode("</title></channel></rss>");
  const bytes = new Uint8Array(head.length + title.length + tail.length);
  bytes.set(head);
  bytes.set(title, head.length);
  bytes.set(tail, head.length + title.length);
  return bytes;
}

export type Body = string | Uint8Array;

export function response(body: Body): RequestUrlResponse {
  const bytes =
    typeof body === "string" ? new TextEncoder().encode(body) : body;
  return {
    text: typeof body === "string" ? body : "",
    status: 200,
    headers: {},
    arrayBuffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
    json: {},
  };
}

export interface RecordedRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
}

export interface Served {
  requested: string[];
  requests: RecordedRequest[];
}

/**
 * Serves `pages` by exact URL and rejects every other URL. A list answers
 * successive requests for the same URL in order, repeating its last entry; an
 * `Error` entry rejects. `onRequest` runs when a request arrives, before the
 * answer is returned, which is where a test cancels the signal.
 */
export function serve(
  pages: Record<string, Body | Error | Array<Body | Error>>,
  onRequest?: (url: string, count: number) => void,
): Served {
  const served: Served = { requested: [], requests: [] };
  const counts = new Map<string, number>();
  vi.spyOn(obsidian, "requestUrl").mockImplementation((request) => {
    const url = typeof request === "string" ? request : request.url;
    const method = typeof request === "string" ? undefined : request.method;
    const headers = typeof request === "string" ? {} : (request.headers ?? {});
    served.requested.push(url);
    served.requests.push({ url, method, headers });
    const count = (counts.get(url) ?? 0) + 1;
    counts.set(url, count);
    onRequest?.(url, count);
    const page = pages[url];
    if (page === undefined) {
      return Promise.reject(new Error("not found")) as never;
    }
    const body = Array.isArray(page)
      ? page[Math.min(count, page.length) - 1]
      : page;
    if (body instanceof Error) return Promise.reject(body) as never;
    return Promise.resolve(response(body)) as never;
  });
  return served;
}

/** Everything requested after the `n`th request for `url`. */
export function after(requested: string[], url: string, n = 1): string[] {
  let seen = 0;
  const index = requested.findIndex((u) => u === url && ++seen === n);
  return index === -1 ? [] : requested.slice(index + 1);
}

/** The requests for `url`, in order. */
export function requestsFor(served: Served, url: string): RecordedRequest[] {
  return served.requests.filter((r) => r.url === url);
}

/** Cancels `controller` when `url` is requested for the `n`th time. */
export function cancelOn(
  controller: AbortController,
  url: string,
  n = 1,
): (requested: string, count: number) => void {
  return (requested, count) => {
    if (requested === url && count === n) controller.abort();
  };
}

export function useAndroid(): void {
  vi.spyOn(obsidian.Platform, "isAndroidApp", "get").mockReturnValue(true);
}

/** The last item of `items`, or `undefined` when it is empty. */
export function last<T>(items: T[]): T | undefined {
  return items[items.length - 1];
}
