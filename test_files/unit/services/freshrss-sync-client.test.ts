import { describe, expect, it } from "vitest";
import { FreshRssSyncClient } from "../../../src/services/freshrss-sync-client";
import type {
  FreshRssHttpClient,
  FreshRssHttpRequest,
  FreshRssHttpResponse,
} from "../../../src/services/freshrss-connection-service";

function createHttpClient(
  responses: FreshRssHttpResponse[],
): FreshRssHttpClient & { requests: FreshRssHttpRequest[] } {
  const queue = [...responses];
  const requests: FreshRssHttpRequest[] = [];
  return {
    requests,
    request: async (request) => {
      requests.push(request);
      const next = queue.shift();
      if (!next) throw new Error("No more mocked responses");
      return next;
    },
  };
}

const endpoint = "https://reader.example.test/api/greader.php";
const authToken = "opaque-session";

describe("FreshRssSyncClient", () => {
  it("lists subscriptions with a flat category label from the first category", async () => {
    const httpClient = createHttpClient([
      {
        status: 200,
        text: JSON.stringify({
          subscriptions: [
            {
              id: "feed/opaque-1",
              title: "Example Feed",
              url: "https://example.test/feed.xml",
              categories: [{ id: "user/-/label/Tech", label: "Tech" }],
            },
            {
              id: "feed/opaque-2",
              title: "No Category Feed",
              url: "https://example.test/other.xml",
              categories: [],
            },
          ],
        }),
      },
    ]);
    const client = new FreshRssSyncClient(httpClient, endpoint, authToken);

    const result = await client.listSubscriptions();

    expect(result).toEqual({
      outcome: "ok",
      data: [
        {
          remoteSubscriptionId: "feed/opaque-1",
          title: "Example Feed",
          url: "https://example.test/feed.xml",
          categoryLabel: "Tech",
        },
        {
          remoteSubscriptionId: "feed/opaque-2",
          title: "No Category Feed",
          url: "https://example.test/other.xml",
          categoryLabel: null,
        },
      ],
    });
    expect(httpClient.requests).toEqual([
      {
        url: `${endpoint}/reader/api/0/subscription/list?output=json`,
        method: "GET",
        headers: { Authorization: `GoogleLogin auth=${authToken}` },
      },
    ]);
  });

  it("reports auth-rejected on a 401/403 without throwing", async () => {
    const httpClient = createHttpClient([{ status: 401, text: "" }]);
    const client = new FreshRssSyncClient(httpClient, endpoint, authToken);

    await expect(client.listSubscriptions()).resolves.toEqual({
      outcome: "auth-rejected",
    });
  });

  it("reports unavailable on malformed subscription JSON", async () => {
    const httpClient = createHttpClient([{ status: 200, text: "not-json" }]);
    const client = new FreshRssSyncClient(httpClient, endpoint, authToken);

    await expect(client.listSubscriptions()).resolves.toEqual({
      outcome: "unavailable",
    });
  });

  it("lists tag labels with their opaque remote tag reference and kind", async () => {
    const httpClient = createHttpClient([
      {
        status: 200,
        text: JSON.stringify({
          tags: [
            { id: "user/-/label/Tech", label: "Tech" },
            { id: "user/-/state/com.google/read" },
            { id: "user/-/state/com.google/starred" },
            { id: "user/-/label/Archive", label: "Archive", type: "folder" },
          ],
        }),
      },
    ]);
    const client = new FreshRssSyncClient(httpClient, endpoint, authToken);

    const result = await client.listTagLabels();
    expect(result).toEqual({
      outcome: "ok",
      data: [
        { remoteTagId: "user/-/label/Tech", displayName: "Tech", kind: "label" },
        {
          remoteTagId: "user/-/state/com.google/read",
          displayName: "user/-/state/com.google/read",
          kind: "system",
        },
        {
          remoteTagId: "user/-/state/com.google/starred",
          displayName: "user/-/state/com.google/starred",
          kind: "system",
        },
        { remoteTagId: "user/-/label/Archive", displayName: "Archive", kind: "folder" },
      ],
    });
  });

  it("lists a bounded page of item ids and reports a continuation when present", async () => {
    const httpClient = createHttpClient([
      {
        status: 200,
        text: JSON.stringify({
          itemRefs: [{ id: "item-1" }, { id: "item-2" }],
          continuation: "next-page-token",
        }),
      },
    ]);
    const client = new FreshRssSyncClient(httpClient, endpoint, authToken);

    const result = await client.listItemIds("feed/opaque-1", 50);

    expect(result).toEqual({
      outcome: "ok",
      data: { itemRefs: ["item-1", "item-2"], continuation: "next-page-token" },
    });
    expect(httpClient.requests[0]?.url).toBe(
      `${endpoint}/reader/api/0/stream/items/ids?output=json&n=50&s=feed%2Fopaque-1`,
    );
  });

  it("reports no continuation when the response omits one", async () => {
    const httpClient = createHttpClient([
      { status: 200, text: JSON.stringify({ itemRefs: [{ id: "item-1" }] }) },
    ]);
    const client = new FreshRssSyncClient(httpClient, endpoint, authToken);

    await expect(client.listItemIds("feed/opaque-1", 50)).resolves.toEqual({
      outcome: "ok",
      data: { itemRefs: ["item-1"], continuation: null },
    });
  });

  it("fetches item contents as one POST request with repeated i= params", async () => {
    const httpClient = createHttpClient([
      {
        status: 200,
        text: JSON.stringify({
          items: [
            {
              id: "item-1",
              title: "Hello",
              published: 1700000000,
              author: "Jane",
              alternate: [{ href: "https://example.test/a" }],
              content: { content: "<p>Body</p>" },
            },
          ],
        }),
      },
    ]);
    const client = new FreshRssSyncClient(httpClient, endpoint, authToken);

    const result = await client.getItemContents(["item-1", "item-2"]);

    expect(result).toEqual({
      outcome: "ok",
      data: [
        {
          remoteArticleId: "item-1",
          guid: "item-1",
          title: "Hello",
          link: "https://example.test/a",
          content: "<p>Body</p>",
          author: "Jane",
          publishedMs: 1700000000000,
        },
      ],
    });
    expect(httpClient.requests).toEqual([
      {
        url: `${endpoint}/reader/api/0/stream/items/contents`,
        method: "POST",
        body: "output=json&i=item-1&i=item-2",
        headers: {
          Authorization: `GoogleLogin auth=${authToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    ]);
  });

  it("returns an empty result without a request when no ids are requested", async () => {
    const httpClient = createHttpClient([]);
    const client = new FreshRssSyncClient(httpClient, endpoint, authToken);

    await expect(client.getItemContents([])).resolves.toEqual({
      outcome: "ok",
      data: [],
    });
    expect(httpClient.requests).toEqual([]);
  });
});
