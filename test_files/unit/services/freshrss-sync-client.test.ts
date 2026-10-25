import { describe, expect, it, vi } from "vitest";
import type { FreshRssHttpClient } from "../../../src/services/freshrss-connection-service";
import { FreshRssSyncClient } from "../../../src/services/freshrss-sync-client";

describe("FreshRSS sync client", () => {
  it("lists remote subscriptions without interpreting their opaque IDs", async () => {
    const request = vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
      status: 200,
      text: JSON.stringify({
        subscriptions: [
          {
            id: "feed/6",
            title: "Example feed",
            url: "https://example.test/rss.xml",
            categories: [{ id: "user/-/label/News", label: "News" }],
          },
        ],
      }),
    });
    const client = new FreshRssSyncClient(
      { request },
      "https://rss.example.test/freshrss",
      "session-token",
    );

    await expect(client.listSubscriptions()).resolves.toEqual({
      outcome: "ok",
      data: [
        {
          remoteSubscriptionId: "feed/6",
          title: "Example feed",
          url: "https://example.test/rss.xml",
          categoryLabel: "News",
        },
      ],
    });
    expect(request).toHaveBeenCalledWith({
      url: "https://rss.example.test/freshrss/reader/api/0/subscription/list?output=json",
      method: "GET",
      headers: { Authorization: "GoogleLogin auth=session-token" },
    });
  });

  it("rejects malformed subscription lists without exposing partial data", async () => {
    const client = new FreshRssSyncClient(
      {
        request: vi.fn().mockResolvedValue({
          status: 200,
          text: '{"subscriptions":[{"title":"missing an ID"}]}',
        }),
      },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.listSubscriptions()).resolves.toEqual({
      outcome: "unavailable",
    });
  });

  it("rejects a subscription without a feed URL", async () => {
    const client = new FreshRssSyncClient(
      {
        request: vi.fn().mockResolvedValue({
          status: 200,
          text: '{"subscriptions":[{"id":"feed/6","title":"No URL"}]}',
        }),
      },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.listSubscriptions()).resolves.toEqual({
      outcome: "unavailable",
    });
  });

  it("caps the returned article IDs at the requested page size", async () => {
    const request = vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
      status: 200,
      text: JSON.stringify({
        itemRefs: [
          { id: "article/1" },
          { id: "article/2" },
          { id: "article/3" },
        ],
        continuation: "next-page",
      }),
    });
    const client = new FreshRssSyncClient(
      { request },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.listItemIds("feed/with space", 2)).resolves.toEqual({
      outcome: "ok",
      data: {
        itemRefs: ["article/1", "article/2"],
        continuation: "next-page",
      },
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://rss.example.test/reader/api/0/stream/items/ids?output=json&n=2&s=feed%2Fwith%20space",
      }),
    );
  });

  it("treats an invalid article timestamp as missing and uses the summary fallback", async () => {
    const client = new FreshRssSyncClient(
      {
        request: vi.fn().mockResolvedValue({
          status: 200,
          text: JSON.stringify({
            items: [
              {
                id: "article/1",
                title: "Example",
                summary: { content: "Summary body" },
                published: Number.MAX_VALUE,
              },
            ],
          }),
        }),
      },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.getItemContents(["article/1"])).resolves.toEqual({
      outcome: "ok",
      data: [
        {
          remoteArticleId: "article/1",
          guid: "article/1",
          title: "Example",
          link: null,
          content: "Summary body",
          author: null,
          publishedMs: null,
        },
      ],
    });
  });
});
