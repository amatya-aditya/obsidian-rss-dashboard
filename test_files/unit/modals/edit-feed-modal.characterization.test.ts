import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as obsidian from "obsidian";
import type { RequestUrlResponse } from "obsidian";
import { EditFeedModal } from "../../../src/modals/feed-manager/edit-feed-modal";
import type { EditFeedModalOptions } from "../../../src/modals/feed-manager/edit-feed-modal";
import * as feedPreviewLoader from "../../../src/modals/feed-manager/feed-preview-loader";
import { TagApplicationConfirmModal } from "../../../src/modals/feed-manager/tag-application-confirm-modal";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import type { Feed, FeedItem } from "../../../src/types/types";
import type RssDashboardPlugin from "../../../main";

// Pins EditFeedModal Load, the Feed options section and the Save path ahead of
// the #1094 split of handleLoadFeed, renderFeedOptionsSection and the Save
// handler (#1668). The Save tests record what is persisted.

type PluginMock = {
  app: obsidian.App;
  settings: Record<string, unknown> & {
    feeds: Feed[];
    maxItems: number;
  };
  getFeedLocalStorageAddress?: (feed: Feed) => unknown;
  ensureFolderExists: ReturnType<typeof vi.fn>;
  saveSettings: ReturnType<typeof vi.fn>;
  notifyFiltersUpdated: ReturnType<typeof vi.fn>;
  refreshSelectedFeed: ReturnType<typeof vi.fn>;
};

interface Env {
  modal: EditFeedModal;
  feed: Feed;
  plugin: PluginMock;
  onSave: ReturnType<typeof vi.fn>;
  events: string[];
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function openModal(
  opts: {
    feed?: Partial<Feed>;
    settings?: Record<string, unknown>;
    plugin?: Partial<PluginMock>;
    options?: EditFeedModalOptions;
  } = {},
): Env {
  const app = new obsidian.App();
  const events: string[] = [];
  const feed = {
    title: "Old title",
    url: "https://example.com/old.xml",
    folder: "Tech",
    items: [],
    lastUpdated: 0,
    ...opts.feed,
  } as Feed;
  const plugin: PluginMock = {
    app,
    settings: {
      feeds: [feed],
      folders: [],
      maxItems: 50,
      corsProxyEnabled: false,
      corsProxyUrl: "",
      articleSaving: { savedTemplates: [] },
      availableTags: [],
      media: {
        defaultMastodonFolder: "Social/Mastodon",
        defaultYouTubeFolder: "Videos",
        defaultPodcastFolder: "Podcast",
        defaultRssFolder: "RSS",
      },
      ...opts.settings,
    },
    ensureFolderExists: vi.fn(async () => {
      events.push("ensureFolderExists");
    }),
    saveSettings: vi.fn(async () => {
      events.push("saveSettings");
    }),
    notifyFiltersUpdated: vi.fn(() => {
      events.push("notifyFiltersUpdated");
    }),
    refreshSelectedFeed: vi.fn(async () => {
      events.push("refreshSelectedFeed");
    }),
    ...opts.plugin,
  };
  const onSave = vi.fn(() => {
    events.push("onSave");
  });
  const modal = new EditFeedModal(
    app,
    plugin as unknown as RssDashboardPlugin,
    feed,
    onSave,
    opts.options,
  );
  const close = modal.close.bind(modal);
  vi.spyOn(modal, "close").mockImplementation(() => {
    events.push("close");
    close();
  });
  modal.open();
  return { modal, feed, plugin, onSave, events };
}

function getSetting(modal: EditFeedModal, name: string): HTMLElement {
  const match = Array.from(
    modal.contentEl.querySelectorAll<HTMLElement>(".setting-item"),
  ).find((el) => el.querySelector(".setting-item-name")?.textContent === name);
  if (!match) throw new Error(`Setting not found: ${name}`);
  return match;
}

function textInput(modal: EditFeedModal, name: string): HTMLInputElement {
  return getSetting(modal, name).querySelector(
    'input[type="text"]',
  ) as HTMLInputElement;
}

function selectOf(modal: EditFeedModal, name: string): HTMLSelectElement {
  return getSetting(modal, name).querySelector("select") as HTMLSelectElement;
}

function setSelect(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

function setText(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function button(modal: EditFeedModal, label: string): HTMLButtonElement {
  const el = Array.from(modal.contentEl.querySelectorAll("button")).find(
    (b) => b.textContent === label,
  );
  if (!el) throw new Error(`Button not found: ${label}`);
  return el;
}

function statusEl(modal: EditFeedModal): HTMLElement {
  return modal.contentEl.querySelector(".add-feed-status") as HTMLElement;
}

function latestEntryEl(modal: EditFeedModal): HTMLElement {
  return modal.contentEl.querySelector(".add-feed-latest-entry") as HTMLElement;
}

function activeBadges(modal: EditFeedModal): string[] {
  return Array.from(
    modal.contentEl.querySelectorAll<HTMLElement>(".rss-feed-source-row *"),
  )
    .filter((el) => (el.getAttribute("class") ?? "").includes("active"))
    .map((el) => el.textContent ?? "");
}

function noticeMessages(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls
    .filter((call) => call[0] === "[Stub Notice]")
    .map((call) => String(call[1]));
}

function preview(
  overrides: Partial<feedPreviewLoader.FeedPreviewLoadResult> = {},
): feedPreviewLoader.FeedPreviewLoadResult {
  return {
    detectedType: "rss",
    inputUrl: "https://example.com/old.xml",
    finalUrl: "https://example.com/final.xml",
    isMastodonConversion: false,
    title: "Resolved title",
    latestPubDate: undefined,
    hasEntries: true,
    ...overrides,
  };
}

function response(text: string, contentType: string): RequestUrlResponse {
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    status: 200,
    headers: { "content-type": contentType },
    arrayBuffer: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    json: {},
  };
}

function rssXml(title: string, pubDate: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${title}</title><description>d</description><link>https://example.com</link>
<item><title>One</title><link>https://example.com/one</link><guid>https://example.com/one</guid><pubDate>${pubDate}</pubDate><description>x</description></item>
</channel></rss>`;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  Object.defineProperty(window, "innerWidth", {
    value: 1400,
    configurable: true,
  });
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("EditFeedModal Load (characterization)", () => {
  it("shows the loading state, with Load disabled, while the preview is pending, then restores it", async () => {
    let resolvePreview!: (
      value: feedPreviewLoader.FeedPreviewLoadResult,
    ) => void;
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const { modal } = openModal();
    const status = statusEl(modal);
    status.addClass("status-ok");
    status.addClass("status-error");
    status.addClass("rss-dashboard-status-warning");
    const load = button(modal, "Load");

    load.click();

    expect(load.disabled).toBe(true);
    expect(load.hasClass("loading")).toBe(true);
    expect(status.textContent).toBe("⏳ Loading...");
    expect(status.hasClass("status-loading")).toBe(true);
    expect(status.hasClass("status-ok")).toBe(false);
    expect(status.hasClass("status-error")).toBe(false);
    expect(status.hasClass("rss-dashboard-status-warning")).toBe(false);

    resolvePreview(preview());
    await flushPromises();

    expect(load.disabled).toBe(false);
    expect(load.hasClass("loading")).toBe(false);
    expect(status.hasClass("status-loading")).toBe(false);
  });

  it("fills the URL, title, latest entry and status from a successful preview", async () => {
    const latest = new Date().toISOString();
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
      preview({ latestPubDate: latest, detectedType: "podcast" }),
    );
    const { modal } = openModal();

    button(modal, "Load").click();
    await flushPromises();

    expect(textInput(modal, "Feed URL").value).toBe(
      "https://example.com/final.xml",
    );
    expect(textInput(modal, "Feed URL").hasClass("loaded")).toBe(true);
    expect(textInput(modal, "Title").value).toBe("Resolved title");
    expect(latestEntryEl(modal).textContent).toBe("Today");
    expect(statusEl(modal).textContent).toBe("✅ OK");
    expect(statusEl(modal).hasClass("status-ok")).toBe(true);
    expect(statusEl(modal).hasClass("status-loading")).toBe(false);
    expect(activeBadges(modal).length).toBeGreaterThan(0);
  });

  it("labels the latest entry N/A when the preview has no date and counts days otherwise", async () => {
    const spy = vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview");
    const { modal } = openModal();

    spy.mockResolvedValueOnce(preview({ latestPubDate: undefined }));
    button(modal, "Load").click();
    await flushPromises();
    expect(latestEntryEl(modal).textContent).toBe("N/A");

    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000 - 1000);
    spy.mockResolvedValueOnce(
      preview({ latestPubDate: threeDaysAgo.toISOString() }),
    );
    button(modal, "Load").click();
    await flushPromises();
    expect(latestEntryEl(modal).textContent).toBe("3 days ago");
  });

  it("warns, rather than errors, when the feed loads with no entries, and keeps the conversion notice", async () => {
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
      preview({ hasEntries: false, isMastodonConversion: true }),
    );
    const { modal } = openModal();

    button(modal, "Load").click();
    await flushPromises();

    expect(statusEl(modal).textContent).toBe(
      "⚠ Feed validation passed, however no content detected. (Mastodon > RSS auto-discovery)",
    );
    expect(statusEl(modal).hasClass("rss-dashboard-status-warning")).toBe(true);
    expect(statusEl(modal).hasClass("status-ok")).toBe(false);
  });

  it("shows the error, resets the latest entry and keeps the typed fields when the load fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockRejectedValue(
      new Error("boom"),
    );
    const { modal } = openModal();
    latestEntryEl(modal).textContent = "Today";

    button(modal, "Load").click();
    await flushPromises();

    expect(statusEl(modal).textContent).toBe("❌ boom");
    expect(statusEl(modal).hasClass("status-error")).toBe(true);
    expect(statusEl(modal).hasClass("status-loading")).toBe(false);
    expect(latestEntryEl(modal).textContent).toBe("-");
    expect(textInput(modal, "Feed URL").value).toBe(
      "https://example.com/old.xml",
    );
    expect(textInput(modal, "Title").value).toBe("Old title");
    expect(button(modal, "Load").disabled).toBe(false);
    expect(button(modal, "Load").hasClass("loading")).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      "Feed load error:",
      expect.any(Error),
    );
  });

  it("stringifies a non-Error rejection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockRejectedValue(
      "plain text",
    );
    const { modal } = openModal();

    button(modal, "Load").click();
    await flushPromises();

    expect(statusEl(modal).textContent).toBe("❌ plain text");
  });

  it("clears the error styling when a later Load succeeds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const spy = vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview");
    spy.mockRejectedValueOnce(new Error("first"));
    spy.mockResolvedValueOnce(preview());
    const { modal } = openModal();

    button(modal, "Load").click();
    await flushPromises();
    button(modal, "Load").click();
    await flushPromises();

    expect(statusEl(modal).hasClass("status-error")).toBe(false);
    expect(statusEl(modal).hasClass("status-ok")).toBe(true);
    expect(statusEl(modal).textContent).toBe("✅ OK");
  });

  it("asks the loader to preview even an empty URL, with no empty-URL guard", async () => {
    // Divergence from Add feed, which refuses an empty URL; pinned as is.
    const spy = vi
      .spyOn(feedPreviewLoader, "resolveAndLoadPreview")
      .mockRejectedValue(new Error("Empty"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { modal } = openModal();
    setText(textInput(modal, "Feed URL"), "");

    button(modal, "Load").click();
    await flushPromises();

    expect(spy).toHaveBeenCalledWith("", expect.any(Object));
    expect(statusEl(modal).textContent).toBe("❌ Empty");
  });

  it("passes the typed URL, the proxy settings and the chosen encoding to the loader", async () => {
    const spy = vi
      .spyOn(feedPreviewLoader, "resolveAndLoadPreview")
      .mockResolvedValue(preview());
    const { modal } = openModal({
      settings: { corsProxyEnabled: true, corsProxyUrl: "https://proxy.test/" },
    });
    setText(textInput(modal, "Feed URL"), "https://typed.example/feed");
    setSelect(selectOf(modal, "Feed encoding"), "windows-1251");

    button(modal, "Load").click();
    await flushPromises();

    expect(spy).toHaveBeenCalledWith("https://typed.example/feed", {
      corsProxyEnabled: true,
      corsProxyUrl: "https://proxy.test/",
      feedEncoding: "windows-1251",
    });
  });

  it("passes the proxy as off, with automatic encoding, when it is disabled", async () => {
    const spy = vi
      .spyOn(feedPreviewLoader, "resolveAndLoadPreview")
      .mockResolvedValue(preview());
    const { modal } = openModal();

    button(modal, "Load").click();
    await flushPromises();

    expect(spy).toHaveBeenCalledWith("https://example.com/old.xml", {
      corsProxyEnabled: false,
      corsProxyUrl: "",
      feedEncoding: "auto",
    });
  });

  describe("folder routing", () => {
    it.each([
      ["Uncategorized", "youtube", "Videos"],
      ["", "podcast", "Podcast"],
      ["RSS", "youtube", "Videos"],
      ["Podcast", "rss", "RSS"],
    ] as const)(
      "replaces the auto-assigned folder %j for a %s feed with %s",
      async (before, detectedType, after) => {
        vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
          preview({ detectedType }),
        );
        const { modal } = openModal({ feed: { folder: before } });

        button(modal, "Load").click();
        await flushPromises();

        expect(textInput(modal, "Folder").value).toBe(after);
      },
    );

    it("keeps a folder the user chose", async () => {
      vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
        preview({ detectedType: "youtube" }),
      );
      const { modal } = openModal({ feed: { folder: "My Custom Folder" } });

      button(modal, "Load").click();
      await flushPromises();

      expect(textInput(modal, "Folder").value).toBe("My Custom Folder");
    });

    it("routes a Mastodon conversion to the Mastodon folder", async () => {
      vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
        preview({ isMastodonConversion: true }),
      );
      const { modal } = openModal({ feed: { folder: "Uncategorized" } });

      button(modal, "Load").click();
      await flushPromises();

      expect(textInput(modal, "Folder").value).toBe("Social/Mastodon");
    });

    it("falls back to the built-in folder names when no media defaults are set", async () => {
      vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
        preview({ detectedType: "podcast" }),
      );
      const { modal } = openModal({
        feed: { folder: "Uncategorized" },
        settings: { media: undefined },
      });

      button(modal, "Load").click();
      await flushPromises();

      expect(textInput(modal, "Folder").value).toBe("Podcasts");
    });
  });

  it("saves the loaded URL, title and routed folder", async () => {
    vi.spyOn(feedPreviewLoader, "resolveAndLoadPreview").mockResolvedValue(
      preview({ detectedType: "youtube" }),
    );
    const { modal, feed, plugin } = openModal({
      feed: { folder: "Uncategorized" },
    });

    button(modal, "Load").click();
    await flushPromises();
    button(modal, "Save").click();
    await flushPromises();

    expect(feed.url).toBe("https://example.com/final.xml");
    expect(feed.title).toBe("Resolved title");
    expect(feed.folder).toBe("Videos");
    expect(plugin.ensureFolderExists).toHaveBeenCalledWith("Videos");
  });

  describe("through the real loader", () => {
    it("rewrites the URL field to the feed an HTML page advertises", async () => {
      const page = `<!doctype html><html><head><title>Blog</title><link rel="alternate" type="application/rss+xml" href="/posts.xml" /></head><body></body></html>`;
      const requestUrl = vi
        .spyOn(obsidian, "requestUrl")
        .mockResolvedValueOnce(response(page, "text/html"))
        .mockResolvedValueOnce(response(page, "text/html"))
        .mockResolvedValueOnce(
          response(
            rssXml("Discovered", new Date().toUTCString()),
            "application/rss+xml",
          ),
        );
      const { modal } = openModal({
        settings: { corsProxyEnabled: true },
      });
      setText(textInput(modal, "Feed URL"), "https://example.com/blog");

      button(modal, "Load").click();
      await flushPromises();
      await flushPromises();

      expect(textInput(modal, "Feed URL").value).toBe(
        "https://example.com/posts.xml",
      );
      expect(textInput(modal, "Title").value).toBe("Discovered");
      expect(latestEntryEl(modal).textContent).toBe("Today");
      expect(
        requestUrl.mock.calls.map((c) => (c[0] as { url: string }).url),
      ).toEqual([
        "https://example.com/blog",
        "https://example.com/blog",
        "https://example.com/posts.xml",
      ]);
    });

    it("falls back to RSS2JSON when the direct request fails and the proxy is on", async () => {
      const requestUrl = vi
        .spyOn(obsidian, "requestUrl")
        .mockRejectedValueOnce(new Error("blocked"))
        .mockResolvedValueOnce(
          response(
            JSON.stringify({
              status: "ok",
              feed: { title: "Via RSS2JSON", description: "", link: "" },
              items: [],
            }),
            "application/json",
          ),
        );
      const { modal } = openModal({
        settings: { corsProxyEnabled: true },
      });

      button(modal, "Load").click();
      await flushPromises();
      await flushPromises();

      expect(textInput(modal, "Title").value).toBe("Via RSS2JSON");
      expect(
        (
          requestUrl.mock.calls[requestUrl.mock.calls.length - 1]?.[0] as {
            url: string;
          }
        ).url,
      ).toContain("api.rss2json.com");
    });

    it("reports a direct failure, without calling RSS2JSON, when the proxy is off", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const requestUrl = vi
        .spyOn(obsidian, "requestUrl")
        .mockRejectedValue(new Error("blocked"));
      const { modal } = openModal();

      button(modal, "Load").click();
      await flushPromises();
      await flushPromises();

      expect(statusEl(modal).textContent).toBe(
        "❌ Failed to load feed: the direct request failed and the CORS proxy is disabled.",
      );
      expect(
        requestUrl.mock.calls.some((c) =>
          (c[0] as { url: string }).url.includes("rss2json"),
        ),
      ).toBe(false);
    });
  });
});

describe("EditFeedModal Feed options (characterization)", () => {
  it("renders the options in a collapsed details block in a fixed order", () => {
    const { modal } = openModal();

    const details = modal.contentEl.querySelector(
      "details.rss-per-feed-controls-details",
    ) as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("Feed options");
    const names = Array.from(
      details.querySelectorAll(".setting-item-name"),
    ).map((el) => el.textContent);
    expect(names).toEqual([
      "Feed encoding",
      "Local storage address",
      "Auto delete articles duration",
      "Max items limit",
      "Auto-refresh interval",
      "Exclude from refresh",
      "Article template",
      "Custom auto-tags",
    ]);
  });

  it("starts with the options matching the feed", () => {
    const { modal } = openModal({
      feed: {
        feedEncoding: "windows-1251",
        autoDeleteDuration: 30,
        maxItemsLimit: 100,
        scanInterval: 15,
        excludeFromRefresh: true,
        customTemplate: "tpl-2",
      },
      settings: {
        articleSaving: {
          savedTemplates: [
            { id: "tpl-1", name: "One" },
            { id: "tpl-2", name: "Two" },
          ],
        },
      },
    });

    expect(selectOf(modal, "Feed encoding").value).toBe("windows-1251");
    expect(selectOf(modal, "Auto delete articles duration").value).toBe("30");
    expect(selectOf(modal, "Max items limit").value).toBe("100");
    expect(selectOf(modal, "Auto-refresh interval").value).toBe("15");
    expect(
      getSetting(modal, "Exclude from refresh")
        .querySelector(".checkbox-container")
        ?.hasClass("is-enabled"),
    ).toBe(true);
    const template = selectOf(modal, "Article template");
    expect(Array.from(template.options).map((o) => o.value)).toEqual([
      "",
      "tpl-1",
      "tpl-2",
    ]);
    expect(template.value).toBe("tpl-2");
  });

  it("defaults the max items limit to the global setting when the feed has none", () => {
    const { modal } = openModal({ settings: { maxItems: 25 } });

    expect(selectOf(modal, "Max items limit").value).toBe("25");
  });

  it("opens only the Feed options block when the per-feed section is requested without a highlight", () => {
    const { modal } = openModal({ options: { expandSection: "per-feed" } });

    const details = modal.contentEl.querySelector(
      ".rss-per-feed-controls-details",
    ) as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(details.hasClass("rss-per-feed-controls-highlight")).toBe(false);
    expect(
      getSetting(modal, "Auto delete articles duration").hasClass(
        "rss-per-feed-auto-delete-highlight",
      ),
    ).toBe(false);
  });

  it("removes the per-feed highlights after three seconds and scrolls both targets into view", () => {
    vi.useFakeTimers();
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        cb(0);
        return 0;
      });
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { modal } = openModal({
      options: { highlightSection: "per-feed" },
    });

    const details = modal.contentEl.querySelector(
      ".rss-per-feed-controls-details",
    ) as HTMLElement;
    const autoDelete = getSetting(modal, "Auto delete articles duration");
    expect(details.hasClass("rss-per-feed-controls-highlight")).toBe(true);
    expect(autoDelete.hasClass("rss-per-feed-auto-delete-highlight")).toBe(
      true,
    );
    expect(rafSpy).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest" });

    vi.advanceTimersByTime(2999);
    expect(details.hasClass("rss-per-feed-controls-highlight")).toBe(true);
    vi.advanceTimersByTime(1);
    expect(details.hasClass("rss-per-feed-controls-highlight")).toBe(false);
    expect(autoDelete.hasClass("rss-per-feed-auto-delete-highlight")).toBe(
      false,
    );
  });

  describe("inherited auto-tags", () => {
    it("lists nothing when the feed type inherits no tags", () => {
      const { modal } = openModal();

      expect(
        modal.contentEl.querySelector(".rss-dashboard-inherited-tags"),
      ).toBe(null);
    });

    it("lists the inherited tags as badges, right after the encoding setting", () => {
      const { modal } = openModal({
        settings: {
          availableTags: [{ name: "Daily" }],
          defaultTagColor: "#112233",
          defaultTagTextColor: "#ddeeff",
          media: { defaultRssTags: ["Daily"] },
        },
      });

      const row = modal.contentEl.querySelector(
        ".rss-dashboard-inherited-tags",
      );
      expect(
        Array.from(row?.querySelectorAll(".rss-dashboard-tag-badge") ?? []).map(
          (el) => el.textContent,
        ),
      ).toEqual(["Daily"]);
      const badge = row?.querySelector<HTMLElement>(".rss-dashboard-tag-badge");
      expect(badge?.style.getPropertyValue("--tag-color")).toBe("#112233");
      expect(badge?.style.getPropertyValue("--tag-text-color")).toBe("#ddeeff");
      const setting = row?.closest(".setting-item");
      expect(setting?.querySelector(".setting-item-name")?.textContent).toBe(
        "Inherited auto-tags",
      );
      expect(setting?.previousElementSibling).toBe(
        getSetting(modal, "Feed encoding"),
      );
    });
  });

  describe("local storage address", () => {
    it("says legacy data.json when no address resolver exists and storage is the default", () => {
      const { modal } = openModal({
        settings: { storageMode: "legacy-json" },
      });

      expect(
        modal.contentEl.querySelector(".rss-edit-feed-storage-status")
          ?.textContent,
      ).toBe("Stored in legacy data.json");
      expect(
        modal.contentEl.querySelector(".rss-edit-feed-storage-feed-id")
          ?.textContent,
      ).toBe("Feed ID: Not assigned");
    });

    it("treats a missing resolver in shard mode as a resolved data.json address", () => {
      const { modal } = openModal({
        settings: { storageMode: "vault-shards" },
        feed: { feedId: "  " } as Partial<Feed>,
      });

      expect(
        modal.contentEl.querySelector(".rss-edit-feed-storage-status")
          ?.textContent,
      ).toBe("Stored in shard storage");
      expect(
        modal.contentEl.querySelector(".rss-edit-feed-storage-feed-id")
          ?.textContent,
      ).toBe("Feed ID: Not assigned");
    });

    it("reports an unavailable address in shard mode and refuses to copy it", async () => {
      const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
      const { modal } = openModal({
        feed: { feedId: "f-1" } as Partial<Feed>,
        plugin: {
          getFeedLocalStorageAddress: () => ({
            mode: "vault-shards",
            address: "",
          }),
        },
      });

      expect(
        modal.contentEl.querySelector(".rss-edit-feed-storage-status")
          ?.textContent,
      ).toBe("Shard storage selected (address unavailable)");
      (
        modal.contentEl.querySelector(
          ".rss-edit-feed-storage-copy-button",
        ) as HTMLElement
      ).click();
      await flushPromises();

      expect(noticeMessages(debug)).toEqual([
        "Storage address unavailable for this feed.",
      ]);
    });

    it("announces whether the address was copied", async () => {
      const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
      const writeText = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("denied"));
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      const { modal } = openModal({
        plugin: {
          getFeedLocalStorageAddress: () => ({
            mode: "vault-shards",
            address: "RSS Data/Feeds/f.json",
          }),
        },
      });
      const copy = modal.contentEl.querySelector(
        ".rss-edit-feed-storage-copy-button",
      ) as HTMLElement;

      copy.click();
      await flushPromises();
      copy.click();
      await flushPromises();

      expect(noticeMessages(debug)).toEqual([
        "Copied local storage address.",
        "Failed to copy local storage address.",
      ]);
    });
  });

  describe("persisted on Save", () => {
    async function save(env: Env): Promise<void> {
      button(env.modal, "Save").click();
      await flushPromises();
    }

    it("persists every option the user changes", async () => {
      vi.spyOn(console, "debug").mockImplementation(() => {});
      const env = openModal({
        settings: {
          articleSaving: { savedTemplates: [{ id: "tpl-1", name: "One" }] },
        },
      });
      const { modal, feed } = env;

      setSelect(selectOf(modal, "Feed encoding"), "windows-1251");
      setSelect(selectOf(modal, "Auto delete articles duration"), "14");
      setSelect(selectOf(modal, "Max items limit"), "10");
      setSelect(selectOf(modal, "Auto-refresh interval"), "30");
      const exclude = getSetting(modal, "Exclude from refresh").querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement;
      exclude.checked = true;
      exclude.dispatchEvent(new Event("change"));
      setSelect(selectOf(modal, "Article template"), "tpl-1");
      await save(env);

      expect(feed).toMatchObject({
        feedEncoding: "windows-1251",
        autoDeleteDuration: 14,
        maxItemsLimit: 10,
        scanInterval: 30,
        excludeFromRefresh: true,
        customTemplate: "tpl-1",
      });
    });

    it("stores automatic encoding and the global template as unset", async () => {
      const env = openModal({
        feed: { feedEncoding: "windows-1251", customTemplate: "gone" },
      });
      setSelect(selectOf(env.modal, "Feed encoding"), "auto");
      setSelect(selectOf(env.modal, "Article template"), "");

      await save(env);

      expect(env.feed.feedEncoding).toBeUndefined();
      expect(env.feed.customTemplate).toBeUndefined();
    });

    it("keeps the feed's options when nothing is changed", async () => {
      const env = openModal({
        feed: {
          autoDeleteDuration: 7,
          maxItemsLimit: 100,
          scanInterval: -1,
          excludeFromRefresh: false,
        },
      });

      await save(env);

      expect(env.feed).toMatchObject({
        autoDeleteDuration: 7,
        maxItemsLimit: 100,
        scanInterval: -1,
        excludeFromRefresh: false,
      });
      expect(env.feed.feedEncoding).toBeUndefined();
      expect(env.feed.customTemplate).toBeUndefined();
    });

    it("replaces the template only after the user confirms the replacement", async () => {
      const env = openModal({
        feed: { customTemplate: "tpl-1" },
        settings: {
          articleSaving: {
            savedTemplates: [
              { id: "tpl-1", name: "One" },
              { id: "tpl-2", name: "Two" },
            ],
          },
        },
      });
      const { ConfirmTemplateReplacementModal } =
        await import("../../../src/settings/modals/settings-modals");
      vi.spyOn(
        ConfirmTemplateReplacementModal.prototype,
        "open",
      ).mockImplementation(() => {});
      vi.spyOn(
        ConfirmTemplateReplacementModal.prototype,
        "waitForClose",
      ).mockResolvedValue(true);

      setSelect(selectOf(env.modal, "Article template"), "tpl-2");
      await flushPromises();
      await save(env);

      expect(env.feed.customTemplate).toBe("tpl-2");
    });

    it("assigns a template straight away when the feed has none", async () => {
      const env = openModal({
        settings: {
          articleSaving: { savedTemplates: [{ id: "tpl-1", name: "One" }] },
        },
      });

      setSelect(selectOf(env.modal, "Article template"), "tpl-1");
      await save(env);

      expect(env.feed.customTemplate).toBe("tpl-1");
    });

    it("persists a custom auto-delete, max items and refresh interval entry", async () => {
      const env = openModal();
      for (const [name, value] of [
        ["Auto delete articles duration", "45"],
        ["Max items limit", "75"],
        ["Auto-refresh interval", "90"],
      ] as const) {
        setSelect(selectOf(env.modal, name), "custom");
        const input = getSetting(env.modal, name).querySelector(
          "input.rss-custom-input",
        ) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event("change"));
      }

      await save(env);

      expect(env.feed).toMatchObject({
        autoDeleteDuration: 45,
        maxItemsLimit: 75,
        scanInterval: 90,
      });
    });
  });
});

describe("EditFeedModal Save (characterization)", () => {
  async function save(env: Env): Promise<void> {
    button(env.modal, "Save").click();
    await flushPromises();
  }

  function items(count: number, base = Date.UTC(2026, 0, 1)): FeedItem[] {
    return Array.from({ length: count }, (_, i) => ({
      title: `Item ${i}`,
      link: `https://example.com/${i}`,
      guid: `g${i}`,
      pubDate: new Date(base + i * 86_400_000).toUTCString(),
      feedTitle: "Old title",
      tags: [],
    })) as unknown as FeedItem[];
  }

  it("refuses an empty title with a notice and persists nothing", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const env = openModal();
    setText(textInput(env.modal, "Title"), "   ");

    await save(env);

    expect(noticeMessages(debug)).toEqual(["Feed title cannot be empty."]);
    expect(env.plugin.saveSettings).not.toHaveBeenCalled();
    expect(env.feed.title).toBe("Old title");
    expect(env.onSave).not.toHaveBeenCalled();
  });

  it("refuses a title that starts with a dot", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const env = openModal();
    setText(textInput(env.modal, "Title"), ".hidden");

    await save(env);

    expect(noticeMessages(debug)).toEqual([
      "Feed title cannot start with a dot.",
    ]);
    expect(env.plugin.saveSettings).not.toHaveBeenCalled();
  });

  it("refuses a URL another feed already uses, but not the feed's own URL", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const other = {
      title: "Other",
      url: "https://example.com/other.xml",
      folder: "",
      items: [],
      lastUpdated: 0,
    } as Feed;
    const env = openModal();
    env.plugin.settings.feeds.push(other);
    setText(textInput(env.modal, "Feed URL"), other.url);

    await save(env);

    expect(noticeMessages(debug)).toEqual(["This feed URL already exists"]);
    expect(env.plugin.saveSettings).not.toHaveBeenCalled();
    expect(env.feed.url).toBe("https://example.com/old.xml");

    setText(textInput(env.modal, "Feed URL"), env.feed.url);
    await save(env);
    expect(env.plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("persists a changed title, URL and folder, and renames the feed's articles", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const env = openModal({
      feed: {
        items: items(2),
        lastRefreshAttemptCompletedAt: 123,
        lastFetchError: "x",
      } as Partial<Feed>,
    });
    setText(textInput(env.modal, "Title"), "New title");
    setText(textInput(env.modal, "Feed URL"), "https://example.com/new.xml");
    textInput(env.modal, "Folder").value = "News/World";

    await save(env);

    expect(env.feed.title).toBe("New title");
    expect(env.feed.url).toBe("https://example.com/new.xml");
    expect(env.feed.folder).toBe("News/World");
    expect(env.feed.items.map((i) => i.feedTitle)).toEqual([
      "New title",
      "New title",
    ]);
    expect(env.feed.lastRefreshAttemptCompletedAt).toBe(0);
    expect(env.feed.lastFetchError).toBeUndefined();
    expect(env.plugin.ensureFolderExists).toHaveBeenCalledWith("News/World");
  });

  it("leaves refresh state and article titles alone when only other fields change", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const env = openModal({
      feed: {
        items: items(1),
        lastRefreshAttemptCompletedAt: 123,
        lastFetchError: "x",
      } as Partial<Feed>,
    });
    env.feed.items[0].feedTitle = "Custom";

    await save(env);

    expect(env.feed.lastRefreshAttemptCompletedAt).toBe(123);
    expect(env.feed.lastFetchError).toBe("x");
    expect(env.feed.items[0].feedTitle).toBe("Custom");
  });

  it("skips creating the folder when the folder is empty", async () => {
    const env = openModal({ feed: { folder: "" } });

    await save(env);

    expect(env.plugin.ensureFolderExists).not.toHaveBeenCalled();
    expect(env.feed.folder).toBe("");
  });

  it("runs persist, refresh, notify, close and the callback in a fixed order", async () => {
    const env = openModal();
    setSelect(selectOf(env.modal, "Auto delete articles duration"), "7");
    env.events.length = 0;

    await save(env);

    expect(env.events).toEqual([
      "ensureFolderExists",
      "saveSettings",
      "refreshSelectedFeed",
      "notifyFiltersUpdated",
      "close",
      "onSave",
    ]);
    expect(env.plugin.refreshSelectedFeed).toHaveBeenCalledWith(env.feed);
    expect(env.plugin.notifyFiltersUpdated).toHaveBeenCalledWith({
      source: "edit-feed-modal",
      feedUrl: "https://example.com/old.xml",
      timestamp: expect.any(Number),
    });
  });

  it("does not refresh the feed when neither auto-delete nor encoding changed", async () => {
    const env = openModal();

    await save(env);

    expect(env.plugin.refreshSelectedFeed).not.toHaveBeenCalled();
    expect(env.plugin.saveSettings).toHaveBeenCalledTimes(1);
  });

  it("refreshes when auto-delete goes from a value back to disabled", async () => {
    const env = openModal({ feed: { autoDeleteDuration: 30 } });
    setSelect(selectOf(env.modal, "Auto delete articles duration"), "0");

    await save(env);

    expect(env.plugin.refreshSelectedFeed).toHaveBeenCalledTimes(1);
    expect(env.feed.autoDeleteDuration).toBe(0);
  });

  it("notifies with the new URL after a URL change", async () => {
    const env = openModal();
    setText(textInput(env.modal, "Feed URL"), "https://example.com/new.xml");

    await save(env);

    expect(env.plugin.notifyFiltersUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ feedUrl: "https://example.com/new.xml" }),
    );
  });

  it("does not require refreshSelectedFeed to exist", async () => {
    const env = openModal({
      plugin: { refreshSelectedFeed: undefined as never },
    });
    setSelect(selectOf(env.modal, "Auto delete articles duration"), "7");

    await save(env);

    expect(env.onSave).toHaveBeenCalledTimes(1);
  });

  it("trims to the max items limit, newest first, and says so", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const env = openModal({ feed: { items: items(12) } });
    setSelect(selectOf(env.modal, "Max items limit"), "10");

    await save(env);

    expect(env.feed.items).toHaveLength(10);
    expect(env.feed.items[0].guid).toBe("g11");
    expect(env.feed.items[9].guid).toBe("g2");
    expect(noticeMessages(debug)).toEqual([
      "Feed updated and trimmed to 10 articles",
    ]);
  });

  it("keeps every article and says the feed was updated when under the limit or unlimited", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const env = openModal({ feed: { items: items(3), maxItemsLimit: 0 } });

    await save(env);

    expect(env.feed.items).toHaveLength(3);
    expect(noticeMessages(debug)).toEqual(["Feed updated"]);
  });

  it("orders trimmed articles by first-seen date for undated items when that fallback is on", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const undated = [
      { title: "a", guid: "a", pubDate: "", firstSeenMs: 1000, tags: [] },
      { title: "b", guid: "b", pubDate: "", firstSeenMs: 3000, tags: [] },
      { title: "c", guid: "c", pubDate: "", firstSeenMs: 2000, tags: [] },
    ] as unknown as FeedItem[];
    const env = openModal({
      feed: { items: undated, maxItemsLimit: 2 },
      settings: { useFirstSeenDateFallback: true },
    });

    await save(env);

    expect(env.feed.items.map((i) => i.guid)).toEqual(["b", "c"]);
  });

  it("saves a copy of the keyword rules the feed already had", async () => {
    const rules = [{ id: "r1", text: "ai", mode: "include" }] as never;
    const env = openModal({
      feed: {
        keywordRules: {
          overrideGlobalRules: true,
          includeLogic: "OR",
          rules,
        },
      } as Partial<Feed>,
    });

    await save(env);

    expect(env.feed.keywordRules).toEqual({
      overrideGlobalRules: true,
      includeLogic: "OR",
      rules,
    });
  });

  it("saves empty keyword rules for a feed that had none", async () => {
    const env = openModal();

    await save(env);

    expect(env.feed.keywordRules).toEqual({
      overrideGlobalRules: false,
      includeLogic: "AND",
      rules: [],
    });
  });

  it("does not touch the feed or call the plugin when Cancel is pressed", async () => {
    const env = openModal();
    setText(textInput(env.modal, "Title"), "Changed");

    button(env.modal, "Cancel").click();
    await flushPromises();

    expect(env.feed.title).toBe("Old title");
    expect(env.plugin.saveSettings).not.toHaveBeenCalled();
    expect(env.events).toEqual(["close"]);
  });

  describe("custom tag changes", () => {
    function tagEnv(): Env {
      return openModal({
        feed: {
          customTags: ["Tech"],
          items: [
            {
              title: "I",
              guid: "i",
              tags: [{ name: "Tech", color: "#228811" }],
            },
          ] as unknown as FeedItem[],
        } as Partial<Feed>,
        settings: {
          availableTags: [
            { name: "News", color: "#111122" },
            { name: "Tech", color: "#228811" },
          ],
        },
      });
    }

    async function changeTagsAndSave(
      env: Env,
      choice: "apply_existing" | "future_only" | "cancel_save",
    ): Promise<void> {
      (
        env.modal.contentEl.querySelector(
          ".rss-dashboard-tag-multi-select-trigger",
        ) as HTMLElement
      ).click();
      const option = (name: string) =>
        Array.from(
          document.body.querySelectorAll<HTMLElement>(
            ".rss-dashboard-tag-multi-select-menu-option",
          ),
        ).find(
          (el) => el.getAttribute("data-tag-name") === name,
        ) as HTMLElement;
      option("News").click();
      option("Tech").click();
      const calls: string[] = [];
      vi.spyOn(TagApplicationConfirmModal.prototype, "open").mockImplementation(
        () => {
          calls.push("open");
        },
      );
      vi.spyOn(
        TagApplicationConfirmModal.prototype,
        "waitForClose",
      ).mockImplementation(() => {
        calls.push("waitForClose");
        return Promise.resolve(choice);
      });
      button(env.modal, "Save").click();
      await flushPromises();
      // The promise is requested before the modal opens.
      expect(calls).toEqual(["waitForClose", "open"]);
    }

    it("applies the new tags to existing articles when asked", async () => {
      const env = tagEnv();
      await changeTagsAndSave(env, "apply_existing");

      expect(env.feed.customTags).toEqual(["News"]);
      expect(env.feed.items[0].tags).toEqual([
        { name: "News", color: "#111122" },
      ]);
      expect(env.plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it("keeps existing articles untouched for future_only", async () => {
      const env = tagEnv();
      await changeTagsAndSave(env, "future_only");

      expect(env.feed.customTags).toEqual(["News"]);
      expect(env.feed.items[0].tags).toEqual([
        { name: "Tech", color: "#228811" },
      ]);
    });

    it("abandons the whole save when cancelled, leaving even the title untouched", async () => {
      const env = tagEnv();
      setText(textInput(env.modal, "Title"), "Changed");
      await changeTagsAndSave(env, "cancel_save");

      expect(env.feed.customTags).toEqual(["Tech"]);
      expect(env.feed.title).toBe("Old title");
      expect(env.plugin.saveSettings).not.toHaveBeenCalled();
      expect(env.onSave).not.toHaveBeenCalled();
      expect(env.events).not.toContain("close");
    });
  });
});
