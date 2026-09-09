import { describe, expect, it, vi } from "vitest";
import {
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
    });

    expect(httpClient.requests.map((r) => r.method + " " + r.url.split("?")[0])).toEqual([
      "POST https://reader.example.test/api/greader.php/accounts/ClientLogin",
      "GET https://reader.example.test/api/greader.php/reader/api/0/subscription/list",
      "GET https://reader.example.test/api/greader.php/reader/api/0/tag/list",
      "GET https://reader.example.test/api/greader.php/reader/api/0/stream/items/ids",
      "POST https://reader.example.test/api/greader.php/reader/api/0/stream/items/contents",
      // Read-state reconciliation pull, once articles are bound.
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

  it("reports credentials-rejected without any request when authentication itself fails", async () => {
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
    expect(httpClient.requests).toHaveLength(1);
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
});
