import { describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FeedShardConflictRecovery } from "../../../src/services/feed-shard-conflict-recovery";
import type { FeedItemsShard } from "../../../src/types/types";
import {
  identifyConflictingArticles,
  resolveConflictingArticles,
} from "../../../src/services/feed-shard-reconcile";

describe("device-local shard conflict recovery", () => {
  it("identifies competing edits and edit-versus-removal by article", () => {
    const item = {
      guid: "one",
      title: "Original",
      link: "https://example.com/one",
      description: "",
      pubDate: "",
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
    const base: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: "https://example.com/feed",
      updatedAt: 1,
      items: [item, { ...item, guid: "two", link: "https://example.com/two" }],
    };
    const local = {
      ...base,
      items: [
        { ...item, title: "Local" },
        { ...base.items[1], title: "Local two" },
      ],
    };
    const incoming = { ...base, items: [{ ...item, title: "Remote" }] };
    expect(
      identifyConflictingArticles({
        feedId: "feed",
        ancestor: base,
        local,
        incoming,
      }),
    ).toEqual(["one", "two"]);
    const context = { feedId: "feed", ancestor: base, local, incoming };
    expect(() => resolveConflictingArticles(context, { one: "local" })).toThrow(
      "choice",
    );
    expect(
      resolveConflictingArticles(context, { one: "synced", two: "local" }).map(
        (article) => [article.guid, article.title],
      ),
    ).toEqual([
      ["one", "Remote"],
      ["two", "Local two"],
    ]);
    expect(
      resolveConflictingArticles(context, { one: "local", two: "synced" }).map(
        (article) => [article.guid, article.title],
      ),
    ).toEqual([["one", "Local"]]);
  });
  it("merges independent edits without asking for a choice", () => {
    const item = {
      guid: "one",
      title: "Original",
      link: "https://example.com/one",
      description: "Old",
      pubDate: "",
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
    const base: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: "https://example.com/feed",
      updatedAt: 1,
      items: [item],
    };
    const context = {
      feedId: "feed",
      ancestor: base,
      local: { ...base, items: [{ ...item, title: "Local" }] },
      incoming: { ...base, items: [{ ...item, description: "Remote" }] },
    };
    expect(identifyConflictingArticles(context)).toEqual([]);
    expect(resolveConflictingArticles(context, {})).toMatchObject([
      { title: "Local", description: "Remote" },
    ]);
  });
  it("keeps independent edits on an article whose other field conflicts", () => {
    const item = {
      guid: "one",
      title: "Original",
      link: "https://example.com/one",
      description: "Old",
      pubDate: "",
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
    const base: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: "https://example.com/feed",
      updatedAt: 1,
      items: [item],
    };
    const context = {
      feedId: "feed",
      ancestor: base,
      local: {
        ...base,
        items: [{ ...item, title: "Local", description: "Local description" }],
      },
      incoming: { ...base, items: [{ ...item, title: "Synced" }] },
    };
    expect(
      resolveConflictingArticles(context, { one: "synced" }),
    ).toMatchObject([{ title: "Synced", description: "Local description" }]);
  });
  it("keeps the selected article URL and its matching preview together", () => {
    const item = {
      guid: "one",
      title: "Original",
      link: "https://example.com/one",
      description: "",
      pubDate: "",
      feedTitle: "Feed",
      feedUrl: "https://example.com/feed",
      coverImage: "",
    };
    const base: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: "https://example.com/feed",
      updatedAt: 1,
      items: [item],
    };
    const context = {
      feedId: "feed",
      ancestor: base,
      local: {
        ...base,
        items: [
          {
            ...item,
            refreshEnrichment: { url: item.link, description: "Local preview" },
          },
        ],
      },
      incoming: {
        ...base,
        items: [{ ...item, link: "https://example.com/new" }],
      },
    };
    expect(identifyConflictingArticles(context)).toEqual(["one"]);
    expect(
      resolveConflictingArticles(context, { one: "local" })[0],
    ).toMatchObject({ link: item.link, refreshEnrichment: { url: item.link } });
    const synced = resolveConflictingArticles(context, { one: "synced" })[0];
    expect(synced?.link).toBe("https://example.com/new");
    expect(synced?.refreshEnrichment).toBeUndefined();
  });
  it("writes and reads back each conflict without overwriting earlier copies", async () => {
    const app = App.createMock();
    const recovery = new FeedShardConflictRecovery(app);
    const shard: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: "https://example.com/feed",
      updatedAt: 1,
      items: [],
    };
    const context = {
      feedId: "feed",
      local: shard,
      ancestor: shard,
      incoming: shard,
    };
    const vaultWrite = vi.spyOn(app.vault.adapter, "write");
    const first = await recovery.record(context);
    const second = await recovery.record(context);
    expect(first).not.toBe(second);
    expect(await recovery.read(first)).toEqual(context);
    expect(await recovery.read(second)).toEqual(context);
    expect(vaultWrite).not.toHaveBeenCalled();
    const restarted = new FeedShardConflictRecovery(app);
    expect(await restarted.list()).toEqual([first, second].sort());
    await restarted.remove(first);
    expect(await restarted.list()).toEqual([second]);
    expect(await restarted.read(second)).toEqual(context);
  });

  it("rejects malformed recovery content and unsafe file names", async () => {
    const app = App.createMock();
    const recovery = new FeedShardConflictRecovery(app);
    const shard: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: "https://example.com/feed",
      updatedAt: 1,
      items: [],
    };
    const name = await recovery.record({
      feedId: "feed",
      local: shard,
      ancestor: shard,
      incoming: shard,
    });
    vi.spyOn(app, "loadLocalStorage").mockReturnValue(
      JSON.stringify({ [name]: JSON.stringify({ feedId: "feed" }) }),
    );
    await expect(recovery.read(name)).rejects.toThrow(
      "Invalid conflict recovery content",
    );
    await expect(recovery.read("../data.json")).rejects.toThrow(
      "Invalid conflict recovery name",
    );
  });

  it("does not report success if readback cannot verify the recovery copy", async () => {
    const app = App.createMock();
    const recovery = new FeedShardConflictRecovery(app);
    const shard: FeedItemsShard = {
      version: 1,
      feedId: "feed",
      feedUrl: "https://example.com/feed",
      updatedAt: 1,
      items: [],
    };
    vi.spyOn(app, "loadLocalStorage").mockReturnValue(null);
    await expect(
      recovery.record({
        feedId: "feed",
        local: shard,
        ancestor: shard,
        incoming: shard,
      }),
    ).rejects.toThrow("readback");
  });
});
