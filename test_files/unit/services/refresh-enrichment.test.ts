import { describe, expect, it, vi } from "vitest";
import type { Feed } from "../../../src/types/types";
import { RefreshEnrichment } from "../../../src/services/refresh-enrichment";
import { emptyRawMetadata } from "../../../src/utils/article-metadata";
import {
  getArticlePreviewSummaryText,
  resolveArticlePreviewImage,
} from "../../../src/utils/article-preview-utils";

function feed(id: string): Feed {
  return {
    title: id,
    url: `https://${id}.example/feed`,
    folder: "",
    lastUpdated: 0,
    refreshEnrichment: true,
    items: Array.from({ length: 5 }, (_, i) => ({
      guid: `${id}-${i}`,
      title: `Article ${i}`,
      link: `https://${id}.example/${i}`,
      description: "",
      pubDate: `2026-11-${String(10 - i).padStart(2, "0")}`,
      feedTitle: id,
      feedUrl: `https://${id}.example/feed`,
      coverImage: "",
    })),
  };
}

describe("refresh enrichment scheduling", () => {
  it("skips placeholder image declarations and keeps a later usable lead image", async () => {
    const selected = feed("images");
    selected.items = selected.items.slice(0, 1);
    selected.iconUrl = "https://images.example/feed-icon.png";
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async () => ({
        content: "",
        failureType: "none",
        pageImage: "https://images.example/feed-icon.png",
        pageImageCandidates: [
          "https://images.example/feed-icon.png",
          "https://avatars.githubusercontent.com/u/123",
          "https://images.example/article-cover.png",
        ],
      }),
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });

    service.enqueue([selected]);
    await service.whenIdle();

    expect(selected.items[0].refreshEnrichment?.image).toBe(
      "https://images.example/article-cover.png",
    );
  });

  it("shares two request slots across overlapping refresh budgets", async () => {
    const selected = feed("a");
    selected.items.push({
      ...selected.items[0],
      guid: "a-5",
      link: "https://a.example/5",
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requests: string[] = [];
    let active = 0;
    let maxActive = 0;
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async (url) => {
        requests.push(url);
        active++;
        maxActive = Math.max(maxActive, active);
        await blocked;
        active--;
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    service.enqueue([selected]);
    expect(requests).toHaveLength(2);
    release();
    await service.whenIdle();
    expect(requests).toHaveLength(6);
    expect(new Set(requests).size).toBe(6);
    expect(maxActive).toBe(2);
  });
  it("rotates feeds before second turns and favors untried items within each turn", async () => {
    const a = feed("a");
    const b = feed("b");
    const c = feed("c");
    a.items = a.items.slice(0, 2);
    b.items = b.items.slice(0, 1);
    c.items = c.items.slice(0, 2);
    const retries = Object.fromEntries(
      [a, b].map((item) => [
        JSON.stringify([item.url, item.items[0].link]),
        { at: 0, attempts: 1 },
      ]),
    );
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [a, b, c],
      showCovers: () => true,
      fetch: async (url) => {
        requests.push(url);
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => retries,
      saveRetries: () => {},
      now: () => 86400000,
    });
    service.enqueue([a, b, c]);
    await service.whenIdle();
    expect(requests).toEqual([
      a.items[1].link,
      c.items[0].link,
      b.items[0].link,
      c.items[1].link,
      a.items[0].link,
    ]);
  });

  it("spends a twelve-job budget on first turns before any second turn", async () => {
    const feeds = Array.from({ length: 13 }, (_, index) => feed(`f${index}`));
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => feeds,
      showCovers: () => true,
      fetch: async (url) => {
        requests.push(url);
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue(feeds);
    await service.whenIdle();
    expect(requests).toEqual(
      feeds.slice(0, 12).map((item) => item.items[0].link),
    );
  });
  it("never requests beyond the twenty newest retained articles", async () => {
    const selected = feed("window");
    selected.items = Array.from({ length: 21 }, (_, index) => ({
      ...selected.items[0],
      guid: `window-${index}`,
      link: `https://window.example/${index}`,
      pubDate: `2026-11-${String(21 - index).padStart(2, "0")}`,
    }));
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async (url) => {
        requests.push(url);
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    for (let pass = 0; pass < 8; pass++) {
      service.enqueue([selected]);
      await service.whenIdle();
    }
    expect(requests).toEqual(
      selected.items.slice(0, 20).map((item) => item.link),
    );
    expect(requests).not.toContain(selected.items[20].link);
  });
  it("does not fetch for a hidden cover alone but keeps an image fetched for missing text", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 2);
    selected.items[0].description = "Feed supplied preview text.";
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => false,
      fetch: async (url) => {
        requests.push(url);
        return {
          content: "",
          failureType: "none",
          pageImage: "https://images.example/cover.jpg",
        };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    expect(requests).toEqual([selected.items[1].link]);
    expect(
      resolveArticlePreviewImage(selected.items[1], ["coverImage", "image"]),
    ).toBe("https://images.example/cover.jpg");
  });
  it("does not retry an unsupported non-page response", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 1);
    let requests = 0;
    let now = 0;
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async () => {
        requests++;
        return {
          content: "",
          failureType: "network",
          failureReason: "unsupported",
        };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => now,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    now = 86400000;
    service.enqueue([selected]);
    await service.whenIdle();
    expect(requests).toBe(1);
    expect(selected.items[0].refreshEnrichment?.url).toBe(
      selected.items[0].link,
    );
  });
  it("suppresses the same image URL despite host casing, default port, or fragments", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 3);
    const images = [
      "https://CDN.example:443/Shared.jpg#one",
      "https://cdn.example/Shared.jpg#two",
      "https://cdn.example/Shared.jpg",
    ];
    let index = 0;
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async () => ({
        content: "",
        failureType: "none",
        pageImage: images[index++],
      }),
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    expect(
      selected.items.every((item) => item.refreshEnrichment?.suppressImage),
    ).toBe(true);
  });
  it("redraws only the card changed by a distinct page outcome", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 2);
    selected.items[0].refreshEnrichment = {
      url: selected.items[0].link,
      description: "An earlier preview",
    };
    const redraws: string[][] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async () => ({
        content: "",
        failureType: "none",
        pageMetadata: {
          ...emptyRawMetadata(),
          metaDescription:
            "A distinct article description that is long enough to pass the metadata guard.",
        },
      }),
      persist: async () => {},
      redraw: (items) => {
        redraws.push(items.map((item) => item.guid));
      },
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    expect(redraws).toEqual([[selected.items[1].guid]]);
  });
  it("preserves a newer completed outcome on another item with the same URL", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 1);
    const first = selected.items[0];
    let release!: (value: {
      content: string;
      failureType: "none";
      pageMetadata: ReturnType<typeof emptyRawMetadata>;
    }) => void;
    const pending = new Promise<{
      content: string;
      failureType: "none";
      pageMetadata: ReturnType<typeof emptyRawMetadata>;
    }>((resolve) => {
      release = resolve;
    });
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: () => pending,
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    const newer = {
      ...first,
      guid: "other",
      refreshEnrichment: {
        url: first.link,
        description: "The newer completed preview from another device.",
        suppressDescription: true,
      },
    };
    selected.items.push(newer);
    release({
      content: "",
      failureType: "none",
      pageMetadata: {
        ...emptyRawMetadata(),
        metaDescription:
          "An older description that should not overwrite the newer completed page preview.",
      },
    });
    await service.whenIdle();
    expect(newer.refreshEnrichment.description).toBe(
      "The newer completed preview from another device.",
    );
    expect(first.refreshEnrichment).toEqual(newer.refreshEnrichment);
  });
  it("retains a completed response for a later safe commit without refetching", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 1);
    let requests = 0;
    let commits = 0;
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async () => {
        requests++;
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      commit: async (apply) => {
        commits++;
        if (commits === 1) return false;
        return Boolean(apply());
      },
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    expect(selected.items[0].refreshEnrichment).toBeUndefined();
    service.enqueue([selected]);
    await service.whenIdle();
    expect(requests).toBe(1);
    expect(commits).toBe(2);
    expect(selected.items[0].refreshEnrichment?.url).toBe(
      selected.items[0].link,
    );
  });

  it("retries a failed persistence after reload without another page request", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 1);
    let requests = 0;
    let commits = 0;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async () => {
        requests++;
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      commit: async (apply) => {
        if (++commits === 1) throw new Error("write failed");
        return Boolean(apply());
      },
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    service.retryPending();
    await service.whenIdle();
    expect(requests).toBe(1);
    expect(commits).toBe(2);
    expect(selected.items[0].refreshEnrichment?.url).toBe(
      selected.items[0].link,
    );
    log.mockRestore();
  });

  it("applies a deferred completed result to the replacement feed after reload", async () => {
    const original = feed("a");
    original.items = original.items.slice(0, 1);
    let current = original;
    let requests = 0;
    let commits = 0;
    const service = new RefreshEnrichment({
      getFeeds: () => [current],
      showCovers: () => true,
      fetch: async () => {
        requests++;
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      commit: async (apply) => {
        if (++commits === 1) return false;
        return Boolean(apply());
      },
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([original]);
    await service.whenIdle();
    current = structuredClone(original);
    service.retryPending();
    await service.whenIdle();
    expect(requests).toBe(1);
    expect(original.items[0].refreshEnrichment).toBeUndefined();
    expect(current.items[0].refreshEnrichment?.url).toBe(current.items[0].link);
  });
  it("discards jobs when a synced feed is disabled and then enabled again", async () => {
    const original = feed("a");
    let feeds = [original];
    let release!: (value: { content: string; failureType: "none" }) => void;
    const pending = new Promise<{ content: string; failureType: "none" }>(
      (resolve) => {
        release = resolve;
      },
    );
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => feeds,
      showCovers: () => true,
      fetch: (url) => {
        requests.push(url);
        return pending;
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue(feeds);
    const disabled = { ...original, refreshEnrichment: false };
    service.reconcileFeeds(feeds, [disabled]);
    feeds = [disabled];
    const reenabled = { ...disabled, refreshEnrichment: true };
    service.reconcileFeeds(feeds, [reenabled]);
    feeds = [reenabled];
    release({ content: "", failureType: "none" });
    await service.whenIdle();
    expect(requests).toHaveLength(2);
    expect(feeds[0].items.every((item) => !item.refreshEnrichment)).toBe(true);
  });
  it("does not resume jobs cancelled by opt-out when the feed is enabled again", async () => {
    const selected = feed("a");
    let release!: (value: { content: string; failureType: "none" }) => void;
    const pending = new Promise<{ content: string; failureType: "none" }>(
      (resolve) => {
        release = resolve;
      },
    );
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: (url) => {
        requests.push(url);
        return pending;
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    selected.refreshEnrichment = false;
    service.cancelFeed(selected);
    selected.refreshEnrichment = true;
    release({ content: "", failureType: "none" });
    await service.whenIdle();
    expect(requests).toHaveLength(2);
    expect(selected.items.every((item) => !item.refreshEnrichment)).toBe(true);
  });
  it("requests the same article URL only once across distinct retained items", async () => {
    const selected = feed("a");
    selected.items[1].link = selected.items[0].link;
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async (url) => {
        requests.push(url);
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    expect(
      requests.filter((url) => url === selected.items[0].link),
    ).toHaveLength(1);
  });
  it("skips a queued article when newer preview values fill both fields", async () => {
    const selected = feed("a");
    let release!: (value: { content: string; failureType: "none" }) => void;
    const pending = new Promise<{ content: string; failureType: "none" }>(
      (resolve) => {
        release = resolve;
      },
    );
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: (url) => {
        requests.push(url);
        return pending;
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    selected.items[2].description = "A feed description";
    selected.items[2].coverImage = "https://example.com/cover.jpg";
    release({ content: "", failureType: "none" });
    await service.whenIdle();
    expect(requests).toHaveLength(2);
  });
  it("does not spend the feed budget on non-page links", async () => {
    const selected = feed("a");
    selected.items[0].link = "https://a.example/document.pdf";
    const requests: string[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async (url) => {
        requests.push(url);
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    expect(requests).toEqual(
      selected.items.slice(1, 4).map((item) => item.link),
    );
  });
  it("rotates feeds within the refresh budget and limits shared concurrency", async () => {
    const feeds = [feed("a"), feed("b"), feed("c"), feed("d"), feed("e")];
    const requests: string[] = [];
    let active = 0;
    let maxActive = 0;
    const service = new RefreshEnrichment({
      getFeeds: () => feeds,
      showCovers: () => true,
      fetch: async (url) => {
        requests.push(url);
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active--;
        return { content: "", failureType: "none" };
      },
      persist: async () => {},
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue(feeds);
    await service.whenIdle();
    expect(requests).toHaveLength(12);
    expect(requests.slice(0, 5)).toEqual(feeds.map((f) => f.items[0]?.link));
    expect(maxActive).toBe(2);
    expect(
      feeds.map((f) => f.items.filter((i) => i.refreshEnrichment).length),
    ).toEqual([3, 3, 2, 2, 2]);
  });

  it("discards in-flight results and skips queued jobs after opt-out", async () => {
    const selected = feed("a");
    let release!: (value: { content: string; failureType: "none" }) => void;
    const pending = new Promise<{ content: string; failureType: "none" }>(
      (resolve) => {
        release = resolve;
      },
    );
    const requests: string[] = [];
    let saves = 0;
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: (url) => {
        requests.push(url);
        return pending;
      },
      persist: async () => {
        saves++;
      },
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    service.enqueue([selected]);
    expect(requests).toHaveLength(2);
    selected.refreshEnrichment = false;
    release({ content: "", failureType: "none" });
    await service.whenIdle();
    expect(requests).toHaveLength(2);
    expect(saves).toBe(0);
    expect(selected.items.every((i) => !i.refreshEnrichment)).toBe(true);
  });

  it("retries a transient failure once after a day and keeps completed empty results", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 1);
    let now = 0;
    let calls = 0;
    let stored: unknown = {};
    const make = () =>
      new RefreshEnrichment({
        getFeeds: () => [selected],
        showCovers: () => true,
        fetch: async () => {
          calls++;
          return {
            content: "",
            failureType: calls === 1 ? ("network" as const) : ("none" as const),
          };
        },
        persist: async () => {},
        redraw: () => {},
        loadRetries: () => stored,
        saveRetries: (value) => {
          stored = structuredClone(value);
        },
        now: () => now,
      });
    const first = make();
    first.enqueue([selected]);
    await first.whenIdle();
    now = 86399999;
    const afterReload = make();
    afterReload.enqueue([selected]);
    await afterReload.whenIdle();
    expect(calls).toBe(1);
    now++;
    afterReload.enqueue([selected]);
    await afterReload.whenIdle();
    expect(calls).toBe(2);
    const synced = make();
    synced.enqueue([selected]);
    await synced.whenIdle();
    expect(calls).toBe(2);
    expect(selected.items[0].refreshEnrichment?.url).toBe(
      selected.items[0].link,
    );
    expect(selected.items[0].metadataFetchedAt).toBeUndefined();
  });

  it("retries a proxy timeout even when the direct response was restricted", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 1);
    let now = 0;
    let calls = 0;
    let stored: unknown = {};
    const make = () =>
      new RefreshEnrichment({
        getFeeds: () => [selected],
        showCovers: () => true,
        fetch: async () => {
          calls++;
          return calls === 1
            ? {
                content: "",
                failureType: "restricted" as const,
                failureReason: "timeout" as const,
              }
            : { content: "", failureType: "none" as const };
        },
        persist: async () => {},
        redraw: () => {},
        loadRetries: () => stored,
        saveRetries: (value) => {
          stored = structuredClone(value);
        },
        now: () => now,
      });

    const first = make();
    first.enqueue([selected]);
    await first.whenIdle();
    expect(calls).toBe(1);
    expect(selected.items[0]?.refreshEnrichment).toBeUndefined();
    expect(
      Object.values(stored as Record<string, { attempts: number }>),
    ).toEqual([{ at: 0, attempts: 1 }]);

    now = 86_399_999;
    const afterReload = make();
    afterReload.enqueue([selected]);
    await afterReload.whenIdle();
    expect(calls).toBe(1);

    now++;
    afterReload.enqueue([selected]);
    await afterReload.whenIdle();
    expect(calls).toBe(2);
    expect(selected.items[0]?.refreshEnrichment?.url).toBe(
      selected.items[0]?.link,
    );
  });

  it("suppresses repeated page values across distinct pages and redraws prior cards", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 3);
    const redrawn: string[][] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async () => ({
        content: "",
        failureType: "none",
        pageImage: "https://images.example/shared.jpg",
        pageMetadata: {
          ...emptyRawMetadata(),
          metaDescription:
            "A repeated publisher description that is long enough to pass the metadata guard.",
        },
      }),
      persist: async () => {},
      redraw: (items) => {
        redrawn.push(items.map((item) => item.guid));
      },
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await service.whenIdle();
    for (const item of selected.items) {
      expect(getArticlePreviewSummaryText(item)).toBe("");
      expect(
        resolveArticlePreviewImage(item, ["coverImage", "image"]),
      ).toBeUndefined();
    }
    expect(redrawn[redrawn.length - 1]).toContain(selected.items[0]?.guid);
    const reloaded = structuredClone(selected.items[0]);
    expect(reloaded && getArticlePreviewSummaryText(reloaded)).toBe("");
  });

  it("ignores responses after an article URL changes or the article is removed", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 2);
    let release!: (value: { content: string; failureType: "none" }) => void;
    const pending = new Promise<{ content: string; failureType: "none" }>(
      (resolve) => {
        release = resolve;
      },
    );
    let saves = 0;
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: () => pending,
      persist: async () => {
        saves++;
      },
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    if (selected.items[0]) selected.items[0].link = "https://a.example/changed";
    selected.items.pop();
    release({ content: "", failureType: "none" });
    await service.whenIdle();
    expect(saves).toBe(0);
    expect(selected.items[0]?.refreshEnrichment).toBeUndefined();
  });

  it("serializes writes for simultaneous page results", async () => {
    const selected = feed("a");
    selected.items = selected.items.slice(0, 2);
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writes = 0;
    const snapshots: number[] = [];
    const service = new RefreshEnrichment({
      getFeeds: () => [selected],
      showCovers: () => true,
      fetch: async () => ({ content: "", failureType: "none" }),
      persist: async () => {
        writes++;
        snapshots.push(
          selected.items.filter((item) => item.refreshEnrichment).length,
        );
        if (writes === 1) await firstWrite;
      },
      redraw: () => {},
      loadRetries: () => ({}),
      saveRetries: () => {},
      now: () => 0,
    });
    service.enqueue([selected]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(writes).toBe(1);
    release();
    await service.whenIdle();
    expect(snapshots).toEqual([1, 2]);
  });
});
