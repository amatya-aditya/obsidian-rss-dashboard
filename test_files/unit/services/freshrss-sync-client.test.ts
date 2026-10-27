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

  it("rejects an article ID page larger than the requested page size", async () => {
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
      outcome: "unavailable",
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://rss.example.test/reader/api/0/stream/items/ids?output=json&n=2&s=feed%2Fwith%20space",
      }),
    );
  });

  it("passes a continuation cursor when listing a state stream page", async () => {
    const request = vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
      status: 200,
      text: JSON.stringify({ itemRefs: [{ id: "article/2" }] }),
    });
    const client = new FreshRssSyncClient(
      { request },
      "https://rss.example.test",
      "session-token",
    );

    await expect(
      client.listItemIds("user/-/state/com.google/read", 1000, "12345"),
    ).resolves.toMatchObject({
      outcome: "ok",
      data: { itemRefs: ["article/2"], continuation: null },
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://rss.example.test/reader/api/0/stream/items/ids?output=json&n=1000&s=user%2F-%2Fstate%2Fcom.google%2Fread&c=12345",
      }),
    );
  });

  it("normalizes FreshRSS decimal IDs to Google Reader IDs without losing 64-bit precision", async () => {
    const request = vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
      status: 200,
      text: JSON.stringify({
        itemRefs: [
          { id: "18446744073709551615" },
          { id: "tag:google.com,2005:reader/item/2a" },
        ],
        continuation: "18446744073709551615",
      }),
    });
    const client = new FreshRssSyncClient(
      { request },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.listItemIds("feed/6", 2)).resolves.toEqual({
      outcome: "ok",
      data: {
        itemRefs: [
          "tag:google.com,2005:reader/item/ffffffffffffffff",
          "tag:google.com,2005:reader/item/2a",
        ],
        continuation: "18446744073709551615",
      },
    });
  });

  it("pads normalized Google Reader item IDs to FreshRSS's 64-bit hex width", async () => {
    const client = new FreshRssSyncClient(
      {
        request: vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
          status: 200,
          text: JSON.stringify({ itemRefs: [{ id: "42" }] }),
        }),
      },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.listItemIds("feed/6", 1)).resolves.toMatchObject({
      outcome: "ok",
      data: {
        itemRefs: ["tag:google.com,2005:reader/item/000000000000002a"],
      },
    });
  });

  it("converts normalized Google Reader IDs back to FreshRSS decimal IDs for content requests", async () => {
    const request = vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
      status: 200,
      text: JSON.stringify({ items: [] }),
    });
    const client = new FreshRssSyncClient(
      { request },
      "https://rss.example.test",
      "session-token",
    );

    await client.getItemContents([
      "tag:google.com,2005:reader/item/ffffffffffffffff",
    ]);

    expect(request).toHaveBeenCalledWith({
      url: "https://rss.example.test/reader/api/0/stream/items/contents",
      method: "POST",
      body: "output=json&i=18446744073709551615",
      headers: {
        Authorization: "GoogleLogin auth=session-token",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  });

  it("rejects an invalid continuation cursor instead of treating it as the end", async () => {
    const client = new FreshRssSyncClient(
      {
        request: vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
          status: 200,
          text: JSON.stringify({ itemRefs: [], continuation: 12345 }),
        }),
      },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.listItemIds("feed/6", 1000)).resolves.toEqual({
      outcome: "unavailable",
    });
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
          read: null,
        },
      ],
    });
  });

  it("reads FreshRSS read state from article categories", async () => {
    const client = new FreshRssSyncClient(
      {
        request: vi.fn().mockResolvedValue({
          status: 200,
          text: JSON.stringify({
            items: [
              {
                id: "article/1",
                categories: ["user/-/state/com.google/read"],
              },
              { id: "article/2", categories: [] },
            ],
          }),
        }),
      },
      "https://rss.example.test",
      "session-token",
    );

    await expect(
      client.getItemContents(["article/1", "article/2"]),
    ).resolves.toMatchObject({
      outcome: "ok",
      data: [
        { remoteArticleId: "article/1", read: true },
        { remoteArticleId: "article/2", read: false },
      ],
    });
  });

  it("lists normalized FreshRSS labels and excludes state tags", async () => {
    const client = new FreshRssSyncClient(
      {
        request: vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
          status: 200,
          text: JSON.stringify({
            tags: [
              { id: "user/-/state/com.google/starred" },
              {
                id: "user/-/label/Computing",
                label: "Computing",
                type: "folder",
              },
              { id: "user/-/label/News", label: " News " },
              {
                id: "user/-/label/Read%20Later",
                label: "Read Later",
                type: "tag",
              },
            ],
          }),
        }),
      },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.listLabels()).resolves.toEqual({
      outcome: "ok",
      data: {
        labels: [
          { remoteLabelId: "user/-/label/News", name: "News" },
          {
            remoteLabelId: "user/-/label/Read%20Later",
            name: "Read Later",
          },
        ],
        folders: [
          { remoteLabelId: "user/-/label/Computing", name: "Computing" },
        ],
      },
    });
  });

  it("posts starred and label additions/removals through edit-tag", async () => {
    const request = vi
      .fn<FreshRssHttpClient["request"]>()
      .mockResolvedValue({ status: 200, text: "OK" });
    const client = new FreshRssSyncClient(
      { request },
      "https://rss.example.test",
      "session-token",
    );

    await expect(
      client.updateArticleState(
        ["article/42"],
        ["user/-/state/com.google/starred", "user/-/label/News"],
        ["user/-/label/Old"],
        "write-token",
      ),
    ).resolves.toEqual({ outcome: "ok", data: undefined });

    expect(request).toHaveBeenCalledWith({
      url: "https://rss.example.test/reader/api/0/edit-tag",
      method: "POST",
      body: "T=write-token&i=article%2F42&a=user%2F-%2Fstate%2Fcom.google%2Fstarred&a=user%2F-%2Flabel%2FNews&r=user%2F-%2Flabel%2FOld",
      headers: {
        Authorization: "GoogleLogin auth=session-token",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  });

  it("retrieves a FreshRSS write token and posts a scoped read-state mutation", async () => {
    const request = vi
      .fn<FreshRssHttpClient["request"]>()
      .mockResolvedValueOnce({ status: 200, text: "write-token\n" })
      .mockResolvedValueOnce({ status: 200, text: "OK" });
    const client = new FreshRssSyncClient(
      { request },
      "https://rss.example.test",
      "session-token",
    );

    await expect(client.getModificationToken()).resolves.toEqual({
      outcome: "ok",
      data: "write-token",
    });
    await expect(
      client.updateReadState(["article/42"], true, "write-token"),
    ).resolves.toEqual({ outcome: "ok", data: undefined });

    expect(request).toHaveBeenNthCalledWith(1, {
      url: "https://rss.example.test/reader/api/0/token",
      method: "GET",
      headers: { Authorization: "GoogleLogin auth=session-token" },
    });
    expect(request).toHaveBeenNthCalledWith(2, {
      url: "https://rss.example.test/reader/api/0/edit-tag",
      method: "POST",
      body: "T=write-token&i=article%2F42&a=user%2F-%2Fstate%2Fcom.google%2Fread",
      headers: {
        Authorization: "GoogleLogin auth=session-token",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
  });

  it.each([400, 404, 422])(
    "classifies HTTP %i read-state mutation responses as terminal",
    async (status) => {
      const client = new FreshRssSyncClient(
        {
          request: vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
            status,
            text: "invalid mutation",
          }),
        },
        "https://rss.example.test",
        "session-token",
      );

      await expect(
        client.updateReadState(["article/42"], true, "write-token"),
      ).resolves.toEqual({ outcome: "terminal-error", status });
    },
  );
});
