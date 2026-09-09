import { describe, expect, it, vi } from "vitest";
import {
  FRESHRSS_CONTENT_BATCH_SIZE,
  FRESHRSS_ITEM_ID_PAGE_SIZE,
  FRESHRSS_MUTATION_BATCH_SIZE,
  FRESHRSS_STREAM_ID_BUDGET,
  FreshRssSyncCoordinator,
  type DashboardViewLike,
} from "../../../src/services/freshrss-sync-coordinator";
import {
  FreshRssSidecarRepository,
  type FreshRssSidecarFile,
  type FreshRssSidecarStore,
} from "../../../src/services/freshrss-sidecar-repository";
import type {
  FreshRssHttpClient,
  FreshRssHttpRequest,
  FreshRssHttpResponse,
} from "../../../src/services/freshrss-connection-service";
import type { DataSyncLeaseOwner } from "../../../src/services/data-sync-lease";
import type { Feed, RssDashboardSettings } from "../../../src/types/types";
import { FRESHRSS_BACKOFF_INITIAL_MS } from "../../../src/services/freshrss-backoff";
import { FRESHRSS_MAX_REQUEST_ATTEMPTS } from "../../../src/services/freshrss-retry";

const endpoint = "https://reader.example.test/api/greader.php";
const scope = { endpoint, remoteUserId: "opaque-user" };
const credentials = { username: "test-user", apiPassword: "test-password" };

function createStore(): FreshRssSidecarStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    exists: async (path) => files.has(path),
    read: async (path) => files.get(path) ?? "",
    write: async (path, contents) => {
      files.set(path, contents);
    },
  };
}

function createSidecarRepository() {
  const store = createStore();
  const repository = new FreshRssSidecarRepository(store, {
    sidecarPath: "sidecar.json",
    createQuarantinePath: () => "sidecar.quarantine.json",
  });
  return { store, repository };
}

const activeOwner: DataSyncLeaseOwner = {
  signal: new AbortController().signal,
  isActive: () => true,
  throwIfInactive: () => {},
};

function createHttpClient(
  handler: (request: FreshRssHttpRequest) => FreshRssHttpResponse,
): FreshRssHttpClient & { requests: FreshRssHttpRequest[] } {
  const requests: FreshRssHttpRequest[] = [];
  return {
    requests,
    request: async (request) => {
      requests.push(request);
      return handler(request);
    },
  };
}

function jsonResponse(data: unknown): FreshRssHttpResponse {
  return { status: 200, text: JSON.stringify(data) };
}

function loginResponse(): FreshRssHttpResponse {
  return { status: 200, text: "Auth=opaque-session" };
}

function createSettings(feeds: Feed[]): RssDashboardSettings {
  return { feeds } as unknown as RssDashboardSettings;
}

function createView(): DashboardViewLike & { render: ReturnType<typeof vi.fn> } {
  return { render: vi.fn() };
}

const subscriptionOne = {
  id: "feed/1",
  title: "Feed One",
  url: "https://example.test/feed.xml",
  categories: [{ id: "user/-/label/Tech", label: "Tech" }],
};

describe("FreshRssSyncCoordinator", () => {
  it("creates a new feed for an unbound subscription, imports articles, advances the checkpoint, and refreshes the view once", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/subscription/list")) {
        return jsonResponse({ subscriptions: [subscriptionOne] });
      }
      if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
      if (request.url.includes("/stream/items/ids")) {
        return jsonResponse({ itemRefs: [{ id: "item-1" }] });
      }
      if (request.url.includes("/stream/items/contents")) {
        return jsonResponse({
          items: [
            {
              id: "item-1",
              title: "Hello",
              published: 1700000000,
              alternate: [{ href: "https://example.test/a" }],
              content: { content: "<p>Body</p>" },
            },
          ],
        });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository, store } = createSidecarRepository();
    await repository.activate(scope);
    const localOnlyFeed: Feed = {
      feedId: "local-only",
      title: "Local Only",
      url: "https://local.example.test/feed.xml",
      folder: "Uncategorized",
      items: [{ title: "existing", link: "x", description: "", pubDate: "", guid: "g1", feedTitle: "Local Only", feedUrl: "x", coverImage: "" }],
      lastUpdated: 123,
    };
    const settings = createSettings([localOnlyFeed]);
    const saveSettings = vi.fn().mockResolvedValue(undefined);
    const view = createView();

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings,
      sidecarRepository: repository,
      getView: async () => view,
    });

    const outcome = await coordinator.run({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
    });

    expect(outcome).toEqual({
      outcome: "synced",
      createdFeedCount: 1,
      linkedFeedCount: 0,
      ambiguousSubscriptionCount: 0,
      importedArticleCount: 1,
      partial: false,
      hasTerminalMutations: false,
    });

    expect(httpClient.requests.map((r) => r.method + " " + r.url.split("?")[0])).toEqual([
      "POST https://reader.example.test/api/greader.php/accounts/ClientLogin",
      "GET https://reader.example.test/api/greader.php/reader/api/0/subscription/list",
      "GET https://reader.example.test/api/greader.php/reader/api/0/tag/list",
      "GET https://reader.example.test/api/greader.php/reader/api/0/stream/items/ids",
      "POST https://reader.example.test/api/greader.php/reader/api/0/stream/items/contents",
      // Read-state reconciliation pull, once articles are bound.
      "GET https://reader.example.test/api/greader.php/reader/api/0/stream/items/ids",
      // Starred-state reconciliation pull, once articles are bound.
      "GET https://reader.example.test/api/greader.php/reader/api/0/stream/items/ids",
    ]);

    expect(settings.feeds).toHaveLength(2);
    expect(settings.feeds[0]).toEqual(localOnlyFeed);
    const created = settings.feeds[1];
    expect(created.title).toBe("Feed One");
    expect(created.folder).toBe("Tech");
    expect(created.excludeFromRefresh).toBe(true);
    expect(created.items).toHaveLength(1);
    expect(created.items[0].guid).toBe("item-1");
    expect(created.items[0].title).toBe("Hello");

    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(view.render).toHaveBeenCalledTimes(1);

    const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
    expect(sidecar.feedBindings).toEqual([
      { feedId: created.feedId, remoteSubscriptionId: "feed/1" },
    ]);
    expect(sidecar.articleBindings).toEqual([
      { feedId: created.feedId, guid: "item-1", remoteArticleId: "item-1" },
    ]);
    expect(sidecar.checkpoints).toHaveLength(1);
    expect(sidecar.checkpoints[0].remoteSubscriptionId).toBe("feed/1");
  });

  it("links to the one local feed with the same canonical URL and preserves its local configuration", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/subscription/list")) {
        return jsonResponse({ subscriptions: [subscriptionOne] });
      }
      if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
      if (request.url.includes("/stream/items/ids")) {
        return jsonResponse({ itemRefs: [] });
      }
      if (request.url.includes("/stream/items/contents")) {
        return jsonResponse({ items: [] });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository } = createSidecarRepository();
    await repository.activate(scope);
    const localFeed: Feed = {
      feedId: "local-1",
      title: "My Title",
      url: "https://example.test/feed.xml/",
      folder: "Custom Folder",
      customTemplate: "tmpl",
      maxItemsLimit: 10,
      items: [],
      lastUpdated: 0,
    };
    const settings = createSettings([localFeed]);
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    const outcome = await coordinator.run({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
    });

    expect(outcome).toMatchObject({ outcome: "synced", linkedFeedCount: 1, createdFeedCount: 0 });
    const linked = settings.feeds[0];
    expect(linked.title).toBe("My Title");
    expect(linked.folder).toBe("Custom Folder");
    expect(linked.customTemplate).toBe("tmpl");
    expect(linked.maxItemsLimit).toBe(10);
  });

  it("reports multiple matching local feeds as ambiguous without linking or guessing", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/subscription/list")) {
        return jsonResponse({ subscriptions: [subscriptionOne] });
      }
      if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository, store } = createSidecarRepository();
    await repository.activate(scope);
    const feedA: Feed = { feedId: "a", title: "A", url: "https://example.test/feed.xml", folder: "x", items: [], lastUpdated: 0 };
    const feedB: Feed = { feedId: "b", title: "B", url: "https://example.test/feed.xml", folder: "x", items: [], lastUpdated: 0 };
    const settings = createSettings([feedA, feedB]);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    const outcome = await coordinator.run({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
    });

    expect(outcome).toEqual({
      outcome: "synced",
      createdFeedCount: 0,
      linkedFeedCount: 0,
      ambiguousSubscriptionCount: 1,
      importedArticleCount: 0,
      partial: false,
      hasTerminalMutations: false,
    });
    expect(settings.feeds).toEqual([feedA, feedB]);
    const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
    expect(sidecar.feedBindings).toEqual([]);
  });

  it("marks a subscription partial on a continuation, keeps the prior checkpoint, and still persists what was fetched", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/subscription/list")) {
        return jsonResponse({ subscriptions: [subscriptionOne] });
      }
      if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
      if (request.url.includes("/stream/items/ids")) {
        return jsonResponse({ itemRefs: [{ id: "item-1" }], continuation: "more" });
      }
      if (request.url.includes("/stream/items/contents")) {
        return jsonResponse({ items: [{ id: "item-1", title: "Hello" }] });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository, store } = createSidecarRepository();
    await repository.activate(scope);
    const localFeed: Feed = { feedId: "local-1", title: "Feed One", url: "https://example.test/feed.xml", folder: "Tech", items: [], lastUpdated: 0 };
    await repository.write({
      version: 2,
      scope,
      pendingFacetMutations: [],
      feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
      articleBindings: [],
      checkpoints: [{ remoteSubscriptionId: "feed/1", completedAtMs: 500 }],
    });
    const settings = createSettings([localFeed]);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    const outcome = await coordinator.run({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
    });

    expect(outcome).toMatchObject({ outcome: "synced", partial: true, importedArticleCount: 1 });
    expect(settings.feeds[0].items).toHaveLength(1);
    const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
    expect(sidecar.checkpoints).toEqual([{ remoteSubscriptionId: "feed/1", completedAtMs: 500 }]);
    expect(sidecar.articleBindings).toEqual([
      { feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" },
    ]);
  });

  it("never deletes a local feed, article, or binding when a subscription is absent from a later response", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/subscription/list")) {
        return jsonResponse({ subscriptions: [] });
      }
      if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
      if (request.url.includes("/stream/items/ids")) {
        // Read-state reconciliation pull: nothing is remotely marked read.
        return jsonResponse({ itemRefs: [] });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository, store } = createSidecarRepository();
    await repository.activate(scope);
    const boundFeed: Feed = {
      feedId: "local-1",
      title: "Feed One",
      url: "https://example.test/feed.xml",
      folder: "Tech",
      items: [{ title: "kept", link: "x", description: "", pubDate: "", guid: "item-1", feedTitle: "Feed One", feedUrl: "x", coverImage: "" }],
      lastUpdated: 999,
    };
    await repository.write({
      version: 2,
      scope,
      pendingFacetMutations: [],
      feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
      articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
      checkpoints: [{ remoteSubscriptionId: "feed/1", completedAtMs: 500 }],
    });
    const settings = createSettings([boundFeed]);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    const outcome = await coordinator.run({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
    });

    expect(outcome).toEqual({
      outcome: "synced",
      createdFeedCount: 0,
      linkedFeedCount: 0,
      ambiguousSubscriptionCount: 0,
      importedArticleCount: 0,
      partial: false,
      hasTerminalMutations: false,
    });
    expect(settings.feeds).toHaveLength(1);
    expect(settings.feeds[0].items).toHaveLength(1);
    const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
    expect(sidecar.feedBindings).toEqual([{ feedId: "local-1", remoteSubscriptionId: "feed/1" }]);
    expect(sidecar.articleBindings).toEqual([
      { feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" },
    ]);
    expect(sidecar.checkpoints).toEqual([{ remoteSubscriptionId: "feed/1", completedAtMs: 500 }]);
  });

  it("aborts the whole cycle without persisting anything on a mid-cycle authentication rejection", async () => {
    const subscriptionTwo = {
      id: "feed/2",
      title: "Feed Two",
      url: "https://example.test/two.xml",
      categories: [],
    };
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/subscription/list")) {
        return jsonResponse({ subscriptions: [subscriptionOne, subscriptionTwo] });
      }
      if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
      if (request.url.includes("s=feed%2F1")) {
        return jsonResponse({ itemRefs: [{ id: "item-1" }] });
      }
      if (request.url.includes("/stream/items/contents")) {
        return jsonResponse({ items: [{ id: "item-1", title: "Hello" }] });
      }
      if (request.url.includes("s=feed%2F2")) {
        return { status: 401, text: "" };
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository, store } = createSidecarRepository();
    await repository.activate(scope);
    const beforeSidecar = store.files.get("sidecar.json");
    const settings = createSettings([]);
    const saveSettings = vi.fn().mockResolvedValue(undefined);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings,
      sidecarRepository: repository,
      getView: async () => null,
    });

    const outcome = await coordinator.run({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
    });

    expect(outcome).toEqual({ outcome: "credentials-rejected" });
    expect(settings.feeds).toEqual([]);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(store.files.get("sidecar.json")).toBe(beforeSidecar);
  });

  it("performs exactly one fresh login retry before reporting credentials-rejected when authentication itself fails", async () => {
    const httpClient = createHttpClient(() => ({ status: 403, text: "" }));
    const { repository } = createSidecarRepository();
    await repository.activate(scope);
    const settings = createSettings([]);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    await expect(
      coordinator.run({ endpoint, credentials, scope, owner: activeOwner }),
    ).resolves.toEqual({ outcome: "credentials-rejected" });
    // One initial login attempt, plus exactly one fresh retry -- never a loop.
    expect(httpClient.requests).toHaveLength(2);
    expect(
      httpClient.requests.every((r) => r.url.includes("/accounts/ClientLogin")),
    ).toBe(true);
  });

  describe("pending read-facet mutations", () => {
    function pendingReadMutation(overrides: Partial<{
      operationId: string;
      remoteArticleId: string;
      desiredState: boolean;
    }> = {}) {
      return {
        operationId: overrides.operationId ?? "op-1",
        remoteArticleId: overrides.remoteArticleId ?? "item-1",
        facet: "read" as const,
        desiredState: overrides.desiredState ?? true,
        createdAtMs: 1000,
        lastAttemptAtMs: null,
        attemptCount: 0,
        error: null,
      };
    }

    it("obtains a fresh modification token and flushes a pending read mutation before reading subscriptions, removing it on an exact OK acknowledgment", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) {
          return { status: 200, text: "fresh-token-xyz" };
        }
        if (request.url.includes("/edit-tag")) {
          expect(request.body).toContain("T=fresh-token-xyz");
          expect(request.body).toContain("i=item-1");
          expect(request.body).toContain("a=user%2F-%2Fstate%2Fcom.google%2Fread");
          return { status: 200, text: "OK" };
        }
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pendingReadMutation()],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced", partial: false });
      expect(httpClient.requests.map((r) => r.method + " " + r.url.split("?")[0])).toEqual([
        "POST https://reader.example.test/api/greader.php/accounts/ClientLogin",
        "GET https://reader.example.test/api/greader.php/reader/api/0/token",
        "POST https://reader.example.test/api/greader.php/reader/api/0/edit-tag",
        "GET https://reader.example.test/api/greader.php/reader/api/0/subscription/list",
        "GET https://reader.example.test/api/greader.php/reader/api/0/tag/list",
      ]);
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([]);
    });

    it("keeps the desired state pending (and does not report it acknowledged) when the mutation request is unavailable", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) return { status: 503, text: "" };
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const pending = pendingReadMutation();
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pending],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced", partial: true });
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([pending]);
    });

    it("dispatches a pending mutation for an article whose local copy no longer exists (retention removed it)", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) {
          expect(request.body).toContain("i=item-1");
          return { status: 200, text: "OK" };
        }
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      // No feed binding, no article binding, and no local article at all: the
      // pending record is the only surviving trace of this remote article.
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pendingReadMutation({ desiredState: false })],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced" });
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([]);
    });

    it("never overrides a still-pending local read facet with pulled remote read state", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) return { status: 503, text: "" };
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        if (request.url.includes("/stream/items/ids")) {
          // Remote says item-1 is NOT in the read set (i.e. unread).
          return jsonResponse({ itemRefs: [] });
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const boundFeed: Feed = {
        feedId: "local-1",
        title: "Feed One",
        url: "https://example.test/feed.xml",
        folder: "Tech",
        items: [{ title: "t", link: "x", description: "", pubDate: "", guid: "item-1", feedTitle: "Feed One", feedUrl: "x", coverImage: "", read: true }],
        lastUpdated: 0,
      };
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pendingReadMutation({ desiredState: true })],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
      });
      const settings = createSettings([boundFeed]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      // The flush attempt failed (503), so the pending record is still
      // authoritative: the pulled remote "unread" value must not win.
      expect(settings.feeds[0].items[0].read).toBe(true);
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toHaveLength(1);
    });

    it("clears local read state on remote absence only once the read-stream enumeration is complete", async () => {
      const boundFeed = (): Feed => ({
        feedId: "local-1",
        title: "Feed One",
        url: "https://example.test/feed.xml",
        folder: "Tech",
        items: [{ title: "t", link: "x", description: "", pubDate: "", guid: "item-1", feedTitle: "Feed One", feedUrl: "x", coverImage: "", read: true }],
        lastUpdated: 0,
      });
      const seedSidecar = async (repository: FreshRssSidecarRepository) => {
        await repository.activate(scope);
        await repository.write({
          version: 2,
          scope,
          pendingFacetMutations: [],
          feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
          articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
          checkpoints: [],
        });
      };

      // Capped/repeated-cursor enumeration: must not clear local state.
      {
        const httpClient = createHttpClient((request) => {
          if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
          if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
          if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
          if (request.url.includes("/stream/items/ids")) {
            return jsonResponse({ itemRefs: [], continuation: "stuck" });
          }
          throw new Error(`Unexpected request: ${request.url}`);
        });
        const { repository } = createSidecarRepository();
        await seedSidecar(repository);
        const settings = createSettings([boundFeed()]);
        const coordinator = new FreshRssSyncCoordinator({
          httpClient,
          getSettings: () => settings,
          saveSettings: vi.fn().mockResolvedValue(undefined),
          sidecarRepository: repository,
          getView: async () => null,
        });

        const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
        expect(outcome).toMatchObject({ outcome: "synced", partial: true });
        expect(settings.feeds[0].items[0].read).toBe(true);
      }

      // Fully-enumerated absence: local state is cleared.
      {
        const httpClient = createHttpClient((request) => {
          if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
          if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
          if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
          if (request.url.includes("/stream/items/ids")) {
            return jsonResponse({ itemRefs: [] });
          }
          throw new Error(`Unexpected request: ${request.url}`);
        });
        const { repository } = createSidecarRepository();
        await seedSidecar(repository);
        const settings = createSettings([boundFeed()]);
        const coordinator = new FreshRssSyncCoordinator({
          httpClient,
          getSettings: () => settings,
          saveSettings: vi.fn().mockResolvedValue(undefined),
          sidecarRepository: repository,
          getView: async () => null,
        });

        const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
        expect(outcome).toMatchObject({ outcome: "synced", partial: false });
        expect(settings.feeds[0].items[0].read).toBe(false);
      }
    });

    it("overlays a pending desired read state onto hydrated local state at the start of a cycle", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) return { status: 503, text: "" };
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        if (request.url.includes("/stream/items/ids")) return jsonResponse({ itemRefs: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository } = createSidecarRepository();
      await repository.activate(scope);
      // Local state was hydrated as unread (e.g. a crash before the commit's
      // saveSettings ran), but the pending mutation says the user marked it
      // read. The pending record must win immediately, before any network call.
      const boundFeed: Feed = {
        feedId: "local-1",
        title: "Feed One",
        url: "https://example.test/feed.xml",
        folder: "Tech",
        items: [{ title: "t", link: "x", description: "", pubDate: "", guid: "item-1", feedTitle: "Feed One", feedUrl: "x", coverImage: "", read: false }],
        lastUpdated: 0,
      };
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pendingReadMutation({ desiredState: true })],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
      });
      const settings = createSettings([boundFeed]);
      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(settings.feeds[0].items[0].read).toBe(true);
    });
  });

  describe("pending starred-facet mutations", () => {
    function pendingStarredMutation(overrides: Partial<{
      operationId: string;
      remoteArticleId: string;
      desiredState: boolean;
    }> = {}) {
      return {
        operationId: overrides.operationId ?? "op-1",
        remoteArticleId: overrides.remoteArticleId ?? "item-1",
        facet: "starred" as const,
        desiredState: overrides.desiredState ?? true,
        createdAtMs: 1000,
        lastAttemptAtMs: null,
        attemptCount: 0,
        error: null,
      };
    }

    it("obtains a fresh modification token and flushes a pending starred mutation against the starred stream, removing it on an exact OK acknowledgment", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) {
          return { status: 200, text: "fresh-token-xyz" };
        }
        if (request.url.includes("/edit-tag")) {
          expect(request.body).toContain("T=fresh-token-xyz");
          expect(request.body).toContain("i=item-1");
          expect(request.body).toContain("a=user%2F-%2Fstate%2Fcom.google%2Fstarred");
          return { status: 200, text: "OK" };
        }
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pendingStarredMutation()],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced", partial: false });
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([]);
    });

    it("dispatches an unstar (remove) mutation with r= against the starred stream", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) {
          expect(request.body).toContain("r=user%2F-%2Fstate%2Fcom.google%2Fstarred");
          return { status: 200, text: "OK" };
        }
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pendingStarredMutation({ desiredState: false })],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([]);
    });

    it("keeps the desired starred state pending when the mutation request is unavailable", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) return { status: 503, text: "" };
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const pending = pendingStarredMutation();
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pending],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced", partial: true });
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([pending]);
    });

    it("never overrides a still-pending local starred facet with pulled remote starred state", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) return { status: 503, text: "" };
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        if (request.url.includes("/stream/items/ids")) {
          // Remote says item-1 is NOT in the starred set.
          return jsonResponse({ itemRefs: [] });
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const boundFeed: Feed = {
        feedId: "local-1",
        title: "Feed One",
        url: "https://example.test/feed.xml",
        folder: "Tech",
        items: [{ title: "t", link: "x", description: "", pubDate: "", guid: "item-1", feedTitle: "Feed One", feedUrl: "x", coverImage: "", starred: true }],
        lastUpdated: 0,
      };
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pendingStarredMutation({ desiredState: true })],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
      });
      const settings = createSettings([boundFeed]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      // The flush attempt failed (503), so the pending record is still
      // authoritative: the pulled remote "unstarred" value must not win.
      expect(settings.feeds[0].items[0].starred).toBe(true);
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toHaveLength(1);
    });

    it("clears local starred state on remote absence only once the starred-stream enumeration is complete", async () => {
      const boundFeed = (): Feed => ({
        feedId: "local-1",
        title: "Feed One",
        url: "https://example.test/feed.xml",
        folder: "Tech",
        items: [{ title: "t", link: "x", description: "", pubDate: "", guid: "item-1", feedTitle: "Feed One", feedUrl: "x", coverImage: "", starred: true }],
        lastUpdated: 0,
      });
      const seedSidecar = async (repository: FreshRssSidecarRepository) => {
        await repository.activate(scope);
        await repository.write({
          version: 2,
          scope,
          pendingFacetMutations: [],
          feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
          articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
          checkpoints: [],
        });
      };

      // Capped/repeated-cursor enumeration: must not clear local state.
      {
        const httpClient = createHttpClient((request) => {
          if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
          if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
          if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
          if (request.url.includes("/stream/items/ids")) {
            return jsonResponse({ itemRefs: [], continuation: "stuck" });
          }
          throw new Error(`Unexpected request: ${request.url}`);
        });
        const { repository } = createSidecarRepository();
        await seedSidecar(repository);
        const settings = createSettings([boundFeed()]);
        const coordinator = new FreshRssSyncCoordinator({
          httpClient,
          getSettings: () => settings,
          saveSettings: vi.fn().mockResolvedValue(undefined),
          sidecarRepository: repository,
          getView: async () => null,
        });

        const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
        expect(outcome).toMatchObject({ outcome: "synced", partial: true });
        expect(settings.feeds[0].items[0].starred).toBe(true);
      }

      // Fully-enumerated absence: local state is cleared.
      {
        const httpClient = createHttpClient((request) => {
          if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
          if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
          if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
          if (request.url.includes("/stream/items/ids")) {
            return jsonResponse({ itemRefs: [] });
          }
          throw new Error(`Unexpected request: ${request.url}`);
        });
        const { repository } = createSidecarRepository();
        await seedSidecar(repository);
        const settings = createSettings([boundFeed()]);
        const coordinator = new FreshRssSyncCoordinator({
          httpClient,
          getSettings: () => settings,
          saveSettings: vi.fn().mockResolvedValue(undefined),
          sidecarRepository: repository,
          getView: async () => null,
        });

        const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
        expect(outcome).toMatchObject({ outcome: "synced", partial: false });
        expect(settings.feeds[0].items[0].starred).toBe(false);
      }
    });
  });

  describe("combined read and starred pending mutations", () => {
    it("flushes both a pending read and a pending starred mutation for different articles using one shared fresh modification token", async () => {
      let tokenRequests = 0;
      const editTagRequests: string[] = [];
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) {
          tokenRequests += 1;
          return { status: 200, text: "shared-token" };
        }
        if (request.url.includes("/edit-tag")) {
          expect(request.body).toContain("T=shared-token");
          editTagRequests.push(request.body ?? "");
          return { status: 200, text: "OK" };
        }
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [
          {
            operationId: "op-read",
            remoteArticleId: "item-read",
            facet: "read",
            desiredState: true,
            createdAtMs: 1000,
            lastAttemptAtMs: null,
            attemptCount: 0,
            error: null,
          },
          {
            operationId: "op-starred",
            remoteArticleId: "item-starred",
            facet: "starred",
            desiredState: true,
            createdAtMs: 1000,
            lastAttemptAtMs: null,
            attemptCount: 0,
            error: null,
          },
        ],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced", partial: false });
      // One fresh modification token covers the whole flush phase, not one
      // per facet.
      expect(tokenRequests).toBe(1);
      expect(editTagRequests.some((body) => body.includes("i=item-read") && body.includes("a=user%2F-%2Fstate%2Fcom.google%2Fread"))).toBe(true);
      expect(editTagRequests.some((body) => body.includes("i=item-starred") && body.includes("a=user%2F-%2Fstate%2Fcom.google%2Fstarred"))).toBe(true);
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([]);
    });
  });

  describe("mapped FreshRSS label sync (ticket 06)", () => {
    const techLabelId = "user/-/label/Tech";

    function boundFeed(overrides: Partial<{ tags: Array<{ name: string; color: string }> }> = {}): Feed {
      return {
        feedId: "local-1",
        title: "Feed One",
        url: "https://example.test/feed.xml",
        folder: "Tech",
        items: [
          {
            title: "t",
            link: "x",
            description: "",
            pubDate: "",
            guid: "item-1",
            feedTitle: "Feed One",
            feedUrl: "x",
            coverImage: "",
            tags: overrides.tags ?? [],
          },
        ],
        lastUpdated: 0,
      };
    }

    it("discovers a label mapping from tag/list, keyed by normalized name, and persists it -- excluding system streams and folder entries", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) {
          return jsonResponse({
            tags: [
              { id: techLabelId, label: " Tech " },
              { id: "user/-/state/com.google/read" },
              { id: "user/-/state/com.google/starred" },
              { id: "user/-/label/Archive", label: "Archive", type: "folder" },
            ],
          });
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
      expect(outcome).toMatchObject({ outcome: "synced" });

      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.labelMappings).toEqual([
        { normalizedName: "tech", remoteTagId: techLabelId, kind: "label", displayName: " Tech " },
      ]);
    });

    it("adds a local tag when the fully-enumerated label stream includes the bound article", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [{ id: techLabelId, label: "Tech" }] });
        if (request.url.includes("/stream/items/ids")) {
          // Only the Tech label stream reports item-1 as a member; the
          // read/starred system streams (also enumerated this cycle) report
          // it absent.
          if (request.url.includes(`s=${encodeURIComponent(techLabelId)}`)) {
            return jsonResponse({ itemRefs: [{ id: "item-1" }] });
          }
          return jsonResponse({ itemRefs: [] });
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
        labelMappings: [],
      });
      const settings = createSettings([boundFeed()]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
      expect(outcome).toMatchObject({ outcome: "synced", partial: false });
      expect(settings.feeds[0].items[0].tags).toEqual([
        { name: "Tech", color: "#95a5a6" },
      ]);
    });

    it("removes a local tag when the fully-enumerated label stream no longer includes the bound article, preserving color/spelling of unrelated tags", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [{ id: techLabelId, label: "Tech" }] });
        if (request.url.includes("/stream/items/ids")) return jsonResponse({ itemRefs: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
        labelMappings: [],
      });
      const settings = createSettings([
        boundFeed({ tags: [{ name: "Tech", color: "#custom" }, { name: "Favorite", color: "#f1c40f" }] }),
      ]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
      expect(outcome).toMatchObject({ outcome: "synced", partial: false });
      expect(settings.feeds[0].items[0].tags).toEqual([{ name: "Favorite", color: "#f1c40f" }]);
    });

    it("never overrides a still-pending local label facet with pulled remote label state", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) return { status: 503, text: "" };
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [{ id: techLabelId, label: "Tech" }] });
        if (request.url.includes("/stream/items/ids")) {
          // Remote says item-1 is NOT (yet) a member of the Tech label.
          return jsonResponse({ itemRefs: [] });
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [
          {
            operationId: "op-1",
            remoteArticleId: "item-1",
            facet: "label:tech",
            desiredState: true,
            createdAtMs: 1000,
            lastAttemptAtMs: null,
            attemptCount: 0,
            error: null,
          },
        ],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
        // The mapping is already known from a prior cycle so this cycle's
        // flush can actually attempt (and fail) to dispatch it.
        labelMappings: [
          { normalizedName: "tech", remoteTagId: techLabelId, kind: "label", displayName: "Tech" },
        ],
      });
      const settings = createSettings([boundFeed()]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      // The flush attempt failed (503), so the pending record is still
      // authoritative: the pulled remote "not a member" value must not win.
      expect(settings.feeds[0].items[0].tags).toEqual([{ name: "Tech", color: "#95a5a6" }]);
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toHaveLength(1);
    });

    it("overlays a pending desired mapped-label state onto hydrated local state at the start of a cycle", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) return { status: 503, text: "" };
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [{ id: techLabelId, label: "Tech" }] });
        if (request.url.includes("/stream/items/ids")) return jsonResponse({ itemRefs: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository } = createSidecarRepository();
      await repository.activate(scope);
      // Local state was hydrated without the Tech tag (e.g. a crash before
      // the commit's saveSettings ran), but the pending mutation says the
      // user added it. The pending record must win immediately, before any
      // network call.
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [
          {
            operationId: "op-1",
            remoteArticleId: "item-1",
            facet: "label:tech",
            desiredState: true,
            createdAtMs: 1000,
            lastAttemptAtMs: null,
            attemptCount: 0,
            error: null,
          },
        ],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
        labelMappings: [
          { normalizedName: "tech", remoteTagId: techLabelId, kind: "label", displayName: "Tech" },
        ],
      });
      const settings = createSettings([boundFeed()]);
      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(settings.feeds[0].items[0].tags).toEqual([{ name: "Tech", color: "#95a5a6" }]);
    });

    it("dispatches a pending label mutation against the label's exact remote tag reference, removing it on an exact OK acknowledgment", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "fresh-token" };
        if (request.url.includes("/edit-tag")) {
          expect(request.body).toContain("T=fresh-token");
          expect(request.body).toContain("i=item-1");
          expect(request.body).toContain(`a=${encodeURIComponent(techLabelId)}`);
          return { status: 200, text: "OK" };
        }
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [{ id: techLabelId, label: "Tech" }] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [
          {
            operationId: "op-1",
            remoteArticleId: "item-1",
            facet: "label:tech",
            desiredState: true,
            createdAtMs: 1000,
            lastAttemptAtMs: null,
            attemptCount: 0,
            error: null,
          },
        ],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
        labelMappings: [
          { normalizedName: "tech", remoteTagId: techLabelId, kind: "label", displayName: "Tech" },
        ],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced" });
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([]);
    });

    it("leaves a pending label mutation undispatched (not attempted, not marked failed) when its mapping isn't known yet", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const pending = {
        operationId: "op-1",
        remoteArticleId: "item-1",
        facet: "label:tech" as const,
        desiredState: true,
        createdAtMs: 1000,
        lastAttemptAtMs: null,
        attemptCount: 0,
        error: null,
      };
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pending],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
        labelMappings: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      // No /token or /edit-tag request was made for the unmapped label.
      expect(httpClient.requests.some((r) => r.url.includes("/edit-tag"))).toBe(false);
      expect(outcome).toMatchObject({ outcome: "synced", partial: false });
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([pending]);
      expect(sidecar.pendingFacetMutations[0].attemptCount).toBe(0);
      expect(sidecar.pendingFacetMutations[0].error).toBeNull();
    });

    it("excludes both sides of a mapping-name collision from reconciliation, without an extra network request for either", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) {
          return jsonResponse({
            tags: [
              { id: "user/-/label/Tech", label: "Tech" },
              { id: "user/-/label/tech-2", label: "tech" },
            ],
          });
        }
        // Only the fixed read/starred system streams are enumerated: with no
        // resolvable label mapping, no stream request is made for either
        // colliding label.
        if (request.url.includes("/stream/items/ids")) {
          expect(request.url).toMatch(/s=user%2F-%2Fstate%2Fcom\.google%2F(read|starred)/);
          return jsonResponse({ itemRefs: [] });
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
        labelMappings: [],
      });
      const settings = createSettings([boundFeed()]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced" });
      expect(settings.feeds[0].items[0].tags).toEqual([]);
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.labelMappings).toEqual([]);
    });
  });

  describe("ticket 07: paging budget, transient retry/backoff, reauthentication, and terminal-mutation repair", () => {
    const fastRetry = { sleep: async () => {} };

    it("exhausts in-cycle retries on a persistent transient failure, reports server-unavailable, and persists advanced cross-cycle backoff", async () => {
      let subscriptionListAttempts = 0;
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) {
          subscriptionListAttempts++;
          return { status: 503, text: "" };
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const settings = createSettings([]);
      const nowMs = 5_000_000;

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
        now: () => nowMs,
        retry: fastRetry,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toEqual({ outcome: "server-unavailable" });
      // The first attempt plus two in-cycle retries -- never more.
      expect(subscriptionListAttempts).toBe(FRESHRSS_MAX_REQUEST_ATTEMPTS);
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.syncHealth).toEqual({
        consecutiveTransientFailureCount: 1,
        backoffUntilMs: nowMs + FRESHRSS_BACKOFF_INITIAL_MS,
      });
    });

    it("resets a prior backoff streak to zero after the next cycle fully succeeds", async () => {
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
        labelMappings: [],
        syncHealth: { consecutiveTransientFailureCount: 2, backoffUntilMs: 123 },
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced", partial: false });
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.syncHealth).toEqual({
        consecutiveTransientFailureCount: 0,
        backoffUntilMs: null,
      });
    });

    it("performs exactly one fresh login on a mid-cycle 401 and continues the same cycle to completion", async () => {
      let subscriptionListAttempts = 0;
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) {
          subscriptionListAttempts++;
          if (subscriptionListAttempts === 1) return { status: 401, text: "" };
          return jsonResponse({ subscriptions: [] });
        }
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository } = createSidecarRepository();
      await repository.activate(scope);
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced" });
      expect(subscriptionListAttempts).toBe(2);
      expect(httpClient.requests.map((r) => r.url.split("?")[0])).toEqual([
        "https://reader.example.test/api/greader.php/accounts/ClientLogin",
        "https://reader.example.test/api/greader.php/reader/api/0/subscription/list",
        // Exactly one fresh login before retrying the same request.
        "https://reader.example.test/api/greader.php/accounts/ClientLogin",
        "https://reader.example.test/api/greader.php/reader/api/0/subscription/list",
        "https://reader.example.test/api/greader.php/reader/api/0/tag/list",
      ]);
    });

    it("marks a pending mutation terminal on HTTP 400, reports hasTerminalMutations, and never redispatches it automatically on a later cycle", async () => {
      let editTagAttempts = 0;
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) {
          editTagAttempts++;
          return { status: 400, text: "" };
        }
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const pending = {
        operationId: "op-1",
        remoteArticleId: "item-1",
        facet: "read" as const,
        desiredState: true,
        createdAtMs: 1000,
        lastAttemptAtMs: null,
        attemptCount: 0,
        error: null,
      };
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [pending],
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
        labelMappings: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const firstOutcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
      expect(firstOutcome).toMatchObject({
        outcome: "synced",
        partial: false,
        hasTerminalMutations: true,
      });
      expect(editTagAttempts).toBe(1);

      const sidecarAfterFirst = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecarAfterFirst.pendingFacetMutations).toHaveLength(1);
      expect(sidecarAfterFirst.pendingFacetMutations[0]).toMatchObject({
        remoteArticleId: "item-1",
        desiredState: true,
        error: { category: "terminal" },
      });

      const requestCountAfterFirstCycle = httpClient.requests.length;

      const secondOutcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });
      expect(secondOutcome).toMatchObject({ outcome: "synced", hasTerminalMutations: true });
      // A terminal record is never replayed automatically: no fresh
      // modification-token or edit-tag request is issued for it.
      const requestsDuringSecondCycle = httpClient.requests.slice(requestCountAfterFirstCycle);
      expect(requestsDuringSecondCycle.some((r) => r.url.includes("/edit-tag"))).toBe(false);
      expect(requestsDuringSecondCycle.some((r) => r.url.includes("/reader/api/0/token"))).toBe(false);
      expect(editTagAttempts).toBe(1);
    });

    it("caps a facet stream's enumeration at the 25,000-ID budget, reports partial, and never clears existing state on the cap", async () => {
      const maxPages = Math.ceil(FRESHRSS_STREAM_ID_BUDGET / FRESHRSS_ITEM_ID_PAGE_SIZE);
      let readStreamPageCount = 0;
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        if (request.url.includes("/stream/items/ids")) {
          if (request.url.includes("state%2Fcom.google%2Fread")) {
            readStreamPageCount++;
            // Deliberately never includes item-1 and never terminates: if this
            // capped enumeration were ever (incorrectly) treated as complete,
            // the locally-read article would be wrongly cleared to unread.
            return jsonResponse({
              itemRefs: [{ id: "other-item" }],
              continuation: `cursor-${readStreamPageCount}`,
            });
          }
          // Starred stream: fully enumerated immediately, empty.
          return jsonResponse({ itemRefs: [] });
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository } = createSidecarRepository();
      await repository.activate(scope);
      const boundFeed: Feed = {
        feedId: "local-1",
        title: "Feed One",
        url: "https://example.test/feed.xml",
        folder: "Tech",
        items: [
          {
            title: "t",
            link: "x",
            description: "",
            pubDate: "",
            guid: "item-1",
            feedTitle: "Feed One",
            feedUrl: "x",
            coverImage: "",
            read: true,
          },
        ],
        lastUpdated: 0,
      };
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: [],
        feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
        articleBindings: [{ feedId: "local-1", guid: "item-1", remoteArticleId: "item-1" }],
        checkpoints: [],
        labelMappings: [],
      });
      const settings = createSettings([boundFeed]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced", partial: true });
      expect(readStreamPageCount).toBe(maxPages);
      // The capped stream never reached completion, so absence must not be
      // treated as authoritative: the locally-read article stays read.
      expect(settings.feeds[0].items[0].read).toBe(true);
    });

    it("fetches item content in batches of at most FRESHRSS_CONTENT_BATCH_SIZE", async () => {
      const totalIds = FRESHRSS_CONTENT_BATCH_SIZE + 50;
      const remoteIds = Array.from({ length: totalIds }, (_, i) => `item-${i}`);
      let contentRequestCount = 0;
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/subscription/list")) {
          return jsonResponse({
            subscriptions: [
              { id: "feed/1", title: "Feed One", url: "https://example.test/feed.xml", categories: [] },
            ],
          });
        }
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        if (request.url.includes("/stream/items/ids")) {
          return jsonResponse({ itemRefs: remoteIds.map((id) => ({ id })) });
        }
        if (request.url.includes("/stream/items/contents")) {
          contentRequestCount++;
          const requestedIds = (request.body ?? "")
            .split("&")
            .filter((part) => part.startsWith("i="))
            .map((part) => decodeURIComponent(part.slice(2)));
          expect(requestedIds.length).toBeLessThanOrEqual(FRESHRSS_CONTENT_BATCH_SIZE);
          return jsonResponse({ items: requestedIds.map((id) => ({ id, title: id })) });
        }
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository } = createSidecarRepository();
      await repository.activate(scope);
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced", importedArticleCount: totalIds });
      expect(contentRequestCount).toBe(2);
    });

    it("dispatches pending mutations in batches of at most FRESHRSS_MUTATION_BATCH_SIZE", async () => {
      const totalMutations = FRESHRSS_MUTATION_BATCH_SIZE * 2 + 25;
      let editTagRequestCount = 0;
      const httpClient = createHttpClient((request) => {
        if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
        if (request.url.includes("/reader/api/0/token")) return { status: 200, text: "token" };
        if (request.url.includes("/edit-tag")) {
          editTagRequestCount++;
          const requestedIds = (request.body ?? "")
            .split("&")
            .filter((part) => part.startsWith("i="));
          expect(requestedIds.length).toBeLessThanOrEqual(FRESHRSS_MUTATION_BATCH_SIZE);
          return { status: 200, text: "OK" };
        }
        if (request.url.includes("/subscription/list")) return jsonResponse({ subscriptions: [] });
        if (request.url.includes("/tag/list")) return jsonResponse({ tags: [] });
        throw new Error(`Unexpected request: ${request.url}`);
      });
      const { repository, store } = createSidecarRepository();
      await repository.activate(scope);
      const pendingMutations = Array.from({ length: totalMutations }, (_, i) => ({
        operationId: `op-${i}`,
        remoteArticleId: `item-${i}`,
        facet: "read" as const,
        desiredState: true,
        createdAtMs: 1000,
        lastAttemptAtMs: null,
        attemptCount: 0,
        error: null,
      }));
      await repository.write({
        version: 2,
        scope,
        pendingFacetMutations: pendingMutations,
        feedBindings: [],
        articleBindings: [],
        checkpoints: [],
        labelMappings: [],
      });
      const settings = createSettings([]);

      const coordinator = new FreshRssSyncCoordinator({
        httpClient,
        getSettings: () => settings,
        saveSettings: vi.fn().mockResolvedValue(undefined),
        sidecarRepository: repository,
        getView: async () => null,
      });

      const outcome = await coordinator.run({ endpoint, credentials, scope, owner: activeOwner });

      expect(outcome).toMatchObject({ outcome: "synced" });
      expect(editTagRequestCount).toBe(3);
      const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
      expect(sidecar.pendingFacetMutations).toEqual([]);
    });
  });
});
