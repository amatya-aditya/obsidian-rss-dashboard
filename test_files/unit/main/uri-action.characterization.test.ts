/**
 * Characterization tests for the URI action handler in main.ts (#571).
 *
 * The URI action handler is what an `obsidian://rss-dashboard` link runs:
 * `dispatchUriAction` and its four helpers. These tests pin what it does
 * today, bugs included, through the protocol handler `onload` registers, so
 * it can move into its own module (ADR 0015, step 5) without these tests
 * changing. They are read-only on refactor PRs; see
 * docs/development/architecture.md.
 *
 * The Add feed modal is replaced by a recorder, so each test sees what the
 * link asked the modal to show, and the notices the user got, in one place.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { App, type MockApp, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import {
  AddFeedModal,
  type AddFeedRequest,
} from "../../../src/modals/feed-manager/add-feed-modal";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

function createManifest(app: MockApp): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "2.7.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: `${app.vault.configDir}/plugins/rss-dashboard`,
  };
}

const FEED_URL = "https://example.com/feed.xml";
const NO_ACTION_NOTICE =
  "Missing URI action. Use action=add-feed with a URL parameter.";
const NO_URL_NOTICE = "Missing required URL parameter for add-feed.";

type Params = Record<string, unknown>;

interface Harness {
  plugin: RssDashboardPlugin;
  /** What `registerObsidianProtocolHandler` was given, for the plugin's id. */
  handler: (params: Params) => unknown;
  /** Notices, errors, `activateView` calls and modal opens, oldest first. */
  events: string[];
  /** Every Add feed modal a link opened. */
  modals: AddFeedModal[];
  activateView: Mock<() => Promise<void>>;
  addFeed: Mock<RssDashboardPlugin["addFeed"]>;
  refreshDashboardViews: Mock<() => Promise<void>>;
}

let harnesses: Harness[] = [];

async function createHarness(): Promise<Harness> {
  const app = App.createMock();
  const plugin = new RssDashboardPlugin(app, createManifest(app));
  const events: string[] = [];
  const modals: AddFeedModal[] = [];

  plugin.loadData = vi.fn().mockResolvedValue(null);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  (app.vault as unknown as { on: unknown }).on = (name: string) => ({ name });
  const registerProtocolHandler = vi.fn();
  plugin.registerObsidianProtocolHandler = registerProtocolHandler;

  vi.spyOn(console, "debug").mockImplementation(
    (tag: unknown, message: unknown) => {
      if (tag === "[Stub Notice]") events.push(`notice: ${String(message)}`);
    },
  );
  vi.spyOn(console, "error").mockImplementation(
    (tag: unknown, error: unknown) => {
      events.push(
        `error: ${String(tag)} ${error instanceof Error ? error.message : String(error)}`,
      );
    },
  );

  const activateView = vi
    .spyOn(plugin, "activateView")
    .mockImplementation(() => {
      events.push("activateView");
      return Promise.resolve();
    }) as unknown as Mock<() => Promise<void>>;
  const addFeed = vi
    .spyOn(plugin, "addFeed")
    .mockResolvedValue(true) as unknown as Mock<RssDashboardPlugin["addFeed"]>;
  const refreshDashboardViews = vi
    .spyOn(plugin, "refreshDashboardViews")
    .mockResolvedValue(undefined) as unknown as Mock<() => Promise<void>>;
  vi.spyOn(AddFeedModal.prototype, "open").mockImplementation(function (
    this: AddFeedModal,
  ) {
    events.push("modal open");
    modals.push(this);
  });

  await plugin.onload();

  const call = registerProtocolHandler.mock.calls.find(
    ([action]) => action === "rss-dashboard",
  );
  if (!call) throw new Error("onload did not register the protocol handler");

  const harness: Harness = {
    plugin,
    handler: call[1] as (params: Params) => unknown,
    events,
    modals,
    activateView,
    addFeed,
    refreshDashboardViews,
  };
  harnesses.push(harness);
  return harness;
}

/** Runs a link and waits for the asynchronous handler behind it to settle. */
async function open(harness: Harness, params: Params): Promise<void> {
  harness.handler(params);
  await vi.advanceTimersByTimeAsync(0);
}

function notices(harness: Harness): string[] {
  return harness.events
    .filter((event) => event.startsWith("notice: "))
    .map((event) => event.slice("notice: ".length));
}

function onlyModal(harness: Harness): AddFeedModal {
  expect(harness.modals).toHaveLength(1);
  return harness.modals[0];
}

beforeEach(() => {
  vi.useFakeTimers();
  harnesses = [];
});

afterEach(() => {
  for (const harness of harnesses) harness.plugin.onunload();
  harnesses = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.empty();
});

describe("URI action: which action a link asks for", () => {
  it("registers one protocol handler under the plugin id, and returns before the action finishes", async () => {
    const harness = await createHarness();

    // The handler starts the action and returns; it never hands back a promise.
    expect(
      harness.handler({ action: "add-feed", url: FEED_URL }),
    ).toBeUndefined();
    expect(harness.modals).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(0);
    expect(harness.modals).toHaveLength(1);
  });

  it("reports a link with no action at all", async () => {
    const harness = await createHarness();

    await open(harness, {});

    expect(notices(harness)).toEqual([NO_ACTION_NOTICE]);
    expect(harness.modals).toHaveLength(0);
  });

  it("reports a route-only link that carries no URL", async () => {
    const harness = await createHarness();

    await open(harness, { action: "rss-dashboard" });

    expect(notices(harness)).toEqual([NO_ACTION_NOTICE]);
  });

  it("treats a blank URL on a route-only link as no URL", async () => {
    const harness = await createHarness();

    await open(harness, { action: "rss-dashboard", url: "   " });

    expect(notices(harness)).toEqual([NO_ACTION_NOTICE]);
  });

  it("treats a non-string URL on a route-only link as no URL", async () => {
    const harness = await createHarness();

    await open(harness, { action: "rss-dashboard", url: 42 });

    expect(notices(harness)).toEqual([NO_ACTION_NOTICE]);
  });

  it("infers add-feed for a route-only link that carries a URL", async () => {
    const harness = await createHarness();

    await open(harness, { action: "rss-dashboard", url: FEED_URL });

    expect(onlyModal(harness).initialUrl).toBe(FEED_URL);
    expect(notices(harness)).toEqual([]);
  });

  it("matches the route against the plugin id without regard to case", async () => {
    const harness = await createHarness();

    await open(harness, { action: "RSS-Dashboard", url: FEED_URL });

    expect(onlyModal(harness).initialUrl).toBe(FEED_URL);
  });

  it("lets uriAction take precedence over the route action", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "rss-dashboard",
      uriAction: "bogus",
      url: FEED_URL,
    });

    expect(notices(harness)).toEqual([
      "Unsupported RSS Dashboard URI action: bogus",
    ]);
    expect(harness.modals).toHaveLength(0);
  });

  it("trims and lowercases uriAction", async () => {
    const harness = await createHarness();

    await open(harness, { uriAction: "  ADD-Feed ", url: FEED_URL });

    expect(onlyModal(harness).initialUrl).toBe(FEED_URL);
  });

  it("ignores a blank uriAction and falls back to the route", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", uriAction: "  ", url: FEED_URL });

    expect(onlyModal(harness).initialUrl).toBe(FEED_URL);
  });

  it("ignores a non-string uriAction and falls back to the route", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", uriAction: 7, url: FEED_URL });

    expect(onlyModal(harness).initialUrl).toBe(FEED_URL);
  });

  it("takes the route as the action when it names something other than the plugin", async () => {
    const harness = await createHarness();

    await open(harness, { action: " Add-Feed ", url: FEED_URL });

    expect(onlyModal(harness).initialUrl).toBe(FEED_URL);
  });

  it("names an unsupported action in lower case", async () => {
    const harness = await createHarness();

    await open(harness, { action: "Bogus" });

    expect(notices(harness)).toEqual([
      "Unsupported RSS Dashboard URI action: bogus",
    ]);
  });

  it("does not infer add-feed from a URL when the route names another action", async () => {
    const harness = await createHarness();

    await open(harness, { action: "refresh", url: FEED_URL });

    expect(notices(harness)).toEqual([
      "Unsupported RSS Dashboard URI action: refresh",
    ]);
    expect(harness.activateView).not.toHaveBeenCalled();
  });
});

describe("URI action: add-feed and the URL it is given", () => {
  it("reports a missing URL and opens nothing", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed" });

    expect(harness.events).toEqual([`notice: ${NO_URL_NOTICE}`]);
  });

  it("reports a blank URL the same way", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", url: "  " });

    expect(harness.events).toEqual([`notice: ${NO_URL_NOTICE}`]);
  });

  it("reports a non-string URL as missing", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", url: ["a", "b"] });

    expect(harness.events).toEqual([`notice: ${NO_URL_NOTICE}`]);
  });

  it("trims the URL before it reaches the modal", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", url: `  ${FEED_URL}  ` });

    expect(onlyModal(harness).initialUrl).toBe(FEED_URL);
  });

  it("decodes a percent-encoded URL once", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: encodeURIComponent("https://example.com/feed.xml?a=1&b=2"),
    });

    expect(onlyModal(harness).initialUrl).toBe(
      "https://example.com/feed.xml?a=1&b=2",
    );
  });

  it("decodes only one level, so a double-encoded URL fails validation", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: encodeURIComponent(encodeURIComponent(FEED_URL)),
    });

    expect(notices(harness)).toEqual([
      "URL must start with http:// or https://",
    ]);
    expect(harness.modals).toHaveLength(0);
  });

  it("leaves a URL without a percent sign as it is, including a plus", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: "https://example.com/feed?q=a+b",
    });

    expect(onlyModal(harness).initialUrl).toBe(
      "https://example.com/feed?q=a+b",
    );
  });

  it("reports malformed percent-encoding as a failed action, and logs it", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: "https://example.com/%E0%A4%A",
    });

    expect(harness.events).toEqual([
      "error: [RSS Dashboard] URI action failed: Feed URL is malformed. Ensure the url parameter is URL-encoded.",
      "notice: RSS Dashboard URI action failed: Feed URL is malformed. Ensure the url parameter is URL-encoded.",
    ]);
    expect(harness.activateView).not.toHaveBeenCalled();
  });

  it("treats a literal percent sign in a URL as malformed", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: "https://example.com/100%",
    });

    expect(notices(harness)).toEqual([
      "RSS Dashboard URI action failed: Feed URL is malformed. Ensure the url parameter is URL-encoded.",
    ]);
  });

  it("validates the URL after decoding it", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: encodeURIComponent("ftp://example.com/feed.xml"),
    });

    expect(notices(harness)).toEqual([
      "URL must start with http:// or https://",
    ]);
    expect(harness.activateView).not.toHaveBeenCalled();
  });

  it("reports a URL without a scheme", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", url: "example.com/feed.xml" });

    expect(notices(harness)).toEqual([
      "URL must start with http:// or https://",
    ]);
  });

  it("reports a URL with no host", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", url: "https://" });

    expect(notices(harness)).toEqual(["Invalid URL format."]);
  });
});

describe("URI action: what the Add feed modal is given", () => {
  it("activates the dashboard first, then opens one modal", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", url: FEED_URL });

    expect(harness.events).toEqual(["activateView", "modal open"]);
  });

  it("titles the feed with its host, without a leading www", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: "https://www.Example.com/feed.xml",
    });

    expect(onlyModal(harness).initialTitle).toBe("example.com");
  });

  it("keeps any other subdomain, and drops the port and path", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: "https://blog.example.com:8443/a/b.xml",
    });

    expect(onlyModal(harness).initialTitle).toBe("blog.example.com");
  });

  it("strips only a leading www", async () => {
    const harness = await createHarness();

    await open(harness, {
      action: "add-feed",
      url: "https://news.www.example.com/feed",
    });

    expect(onlyModal(harness).initialTitle).toBe("news.www.example.com");
  });

  it("starts in the configured default RSS folder, trimmed", async () => {
    const harness = await createHarness();
    harness.plugin.settings.media.defaultRssFolder = "  Podcasts ";

    await open(harness, { action: "add-feed", url: FEED_URL });

    expect(onlyModal(harness).defaultFolder).toBe("Podcasts");
  });

  it("falls back to the RSS folder when the setting is blank", async () => {
    const harness = await createHarness();
    harness.plugin.settings.media.defaultRssFolder = "   ";

    await open(harness, { action: "add-feed", url: FEED_URL });

    expect(onlyModal(harness).defaultFolder).toBe("RSS");
  });

  it("reads the default folder and folder list when the link is opened, not at startup", async () => {
    const harness = await createHarness();
    harness.plugin.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      folders: [{ name: "News", subfolders: [] }],
      media: { ...DEFAULT_SETTINGS.media, defaultRssFolder: "Later" },
    };

    await open(harness, { action: "add-feed", url: FEED_URL });

    const modal = onlyModal(harness);
    expect(modal.defaultFolder).toBe("Later");
    expect(modal.folders).toBe(harness.plugin.settings.folders);
  });

  it("gives the modal the plugin", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", url: FEED_URL });

    expect(onlyModal(harness).plugin).toBe(harness.plugin);
  });

  it("adds the feed through the plugin's addFeed with the modal's fields", async () => {
    const harness = await createHarness();
    await open(harness, { action: "add-feed", url: FEED_URL });
    const request: AddFeedRequest = {
      title: "Example",
      url: FEED_URL,
      folder: "News",
      autoDeleteDuration: 7,
      maxItemsLimit: 20,
      scanInterval: 30,
      feedKeywordRules: undefined,
      customTemplate: "tpl",
      excludeFromRefresh: true,
      customTags: ["a"],
      feedEncoding: "utf-8",
    } as AddFeedRequest;

    const result = await onlyModal(harness).onAdd(request);

    expect(result).toBe(true);
    expect(harness.addFeed).toHaveBeenCalledTimes(1);
    expect(harness.addFeed).toHaveBeenCalledWith(
      "Example",
      FEED_URL,
      "News",
      7,
      20,
      30,
      undefined,
      "tpl",
      true,
      ["a"],
      { feedEncoding: "utf-8" },
    );
  });

  it("redraws the dashboards when the modal saves", async () => {
    const harness = await createHarness();
    await open(harness, { action: "add-feed", url: FEED_URL });

    onlyModal(harness).onSave();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.refreshDashboardViews).toHaveBeenCalledTimes(1);
  });

  it("opens a new modal for each link", async () => {
    const harness = await createHarness();

    await open(harness, { action: "add-feed", url: FEED_URL });
    await open(harness, { action: "add-feed", url: "https://example.org/rss" });

    expect(harness.modals.map((modal) => modal.initialUrl)).toEqual([
      FEED_URL,
      "https://example.org/rss",
    ]);
  });
});

describe("URI action: failures while acting", () => {
  it("reports an activateView failure as a failed action and opens no modal", async () => {
    const harness = await createHarness();
    harness.activateView.mockRejectedValueOnce(new Error("no leaf"));

    await open(harness, { action: "add-feed", url: FEED_URL });

    expect(notices(harness)).toEqual([
      "RSS Dashboard URI action failed: no leaf",
    ]);
    expect(harness.modals).toHaveLength(0);
  });

  it("reports a thrown non-Error as an unknown failure", async () => {
    const harness = await createHarness();
    harness.activateView.mockRejectedValueOnce("boom");

    await open(harness, { action: "add-feed", url: FEED_URL });

    expect(notices(harness)).toEqual([
      "RSS Dashboard URI action failed: Unknown error",
    ]);
  });
});
