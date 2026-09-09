import { describe, expect, it, vi } from "vitest";
import {
  FRESHRSS_HISTORY_FETCH_BUDGET,
  FRESHRSS_ITEM_ID_PAGE_SIZE,
  FreshRssSyncCoordinator,
  isFreshRssFeedEligibleForMoreHistory,
  selectFreshRssHistoryEligibleFeeds,
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

/**
 * Mocked-protocol coverage for ticket 10's "Fetch more history" action:
 * `FreshRssSyncCoordinator.runFetchMoreHistory`. Reuses the same test-double
 * shapes as `freshrss-sync-coordinator.test.ts` (the shared coordinator seam)
 * rather than inventing a parallel test harness.
 */

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
  return { feeds, availableTags: [] } as unknown as RssDashboardSettings;
}

function createView(): DashboardViewLike & { render: ReturnType<typeof vi.fn> } {
  return { render: vi.fn() };
}

function remoteArticle(id: string): Record<string, unknown> {
  return {
    id,
    title: `Article ${id}`,
    alternate: [{ href: `https://example.test/${id}` }],
    content: { content: `<p>${id}</p>` },
  };
}

function boundFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    feedId: "local-1",
    title: "Feed One",
    url: "https://example.test/feed.xml",
    folder: "Tech",
    items: [],
    lastUpdated: 0,
    ...overrides,
  };
}

async function writeSidecar(
  repository: FreshRssSidecarRepository,
  overrides: Partial<FreshRssSidecarFile> = {},
): Promise<void> {
  await repository.write({
    version: 2,
    scope,
    pendingFacetMutations: [],
    feedBindings: [{ feedId: "local-1", remoteSubscriptionId: "feed/1" }],
    articleBindings: [],
    checkpoints: [],
    labelMappings: [],
    syncHealth: { consecutiveTransientFailureCount: 0, backoffUntilMs: null },
    ...overrides,
  });
}

describe("FreshRssSyncCoordinator.runFetchMoreHistory", () => {
  it("is ineligible for a local-only feed with no FreshRSS binding", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository } = createSidecarRepository();
    await repository.activate(scope);
    const localOnlyFeed: Feed = {
      feedId: "local-only",
      title: "Local Only",
      url: "https://local.example.test/feed.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: 0,
    };
    const settings = createSettings([localOnlyFeed]);
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    const outcome = await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-only",
    });

    expect(outcome).toEqual({ outcome: "ineligible" });
    expect(settings.feeds[0]).toEqual(localOnlyFeed);
  });

  it("is ineligible once a feed's content stream already reached full completion", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository } = createSidecarRepository();
    await repository.activate(scope);
    await writeSidecar(repository, {
      checkpoints: [{ remoteSubscriptionId: "feed/1", completedAtMs: 500 }],
    });
    const settings = createSettings([boundFeed()]);
    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    const outcome = await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-1",
    });

    expect(outcome).toEqual({ outcome: "ineligible" });
  });

  it("imports older articles beyond the ordinary sync window, marks the checkpoint complete, and refreshes the view once", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/stream/items/ids")) {
        return jsonResponse({ itemRefs: [{ id: "item-1" }, { id: "item-2" }] });
      }
      if (request.url.includes("/stream/items/contents")) {
        return jsonResponse({ items: [remoteArticle("item-1"), remoteArticle("item-2")] });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository, store } = createSidecarRepository();
    await repository.activate(scope);
    await writeSidecar(repository);
    const settings = createSettings([boundFeed()]);
    const view = createView();
    const saveSettings = vi.fn().mockResolvedValue(undefined);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings,
      sidecarRepository: repository,
      getView: async () => view,
    });

    const outcome = await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-1",
    });

    expect(outcome).toEqual({ outcome: "extended", complete: true, importedArticleCount: 2 });
    expect(settings.feeds[0].items.map((i) => i.guid).sort()).toEqual(["item-1", "item-2"]);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(view.render).toHaveBeenCalledTimes(1);

    const sidecar = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
    expect(sidecar.checkpoints).toHaveLength(1);
    expect(sidecar.checkpoints[0].remoteSubscriptionId).toBe("feed/1");
    expect(sidecar.checkpoints[0].completedAtMs).toBeGreaterThan(0);
    expect(sidecar.checkpoints[0].historyFetchCursor ?? null).toBeNull();
    expect(
      isFreshRssFeedEligibleForMoreHistory("local-1", sidecar.feedBindings, sidecar.checkpoints),
    ).toBe(false);
    expect(selectFreshRssHistoryEligibleFeeds(settings.feeds, sidecar.feedBindings, sidecar.checkpoints)).toEqual(
      [],
    );
  });

  it("caps a budget-exhausted invocation at partial, persists a resume cursor, and a later invocation resumes from it to reach completion", async () => {
    const maxPages = Math.ceil(FRESHRSS_HISTORY_FETCH_BUDGET / FRESHRSS_ITEM_ID_PAGE_SIZE);
    let pageCount = 0;
    const seenContinuationParams: Array<string | null> = [];
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/stream/items/ids")) {
        const url = new URL(request.url);
        seenContinuationParams.push(url.searchParams.get("c"));
        pageCount++;
        // Never terminates on its own: every page returns exactly one new
        // item and a fresh continuation cursor, so the invocation is capped
        // purely by the bounded budget.
        return jsonResponse({
          itemRefs: [{ id: `budget-item-${pageCount}` }],
          continuation: `cursor-${pageCount}`,
        });
      }
      if (request.url.includes("/stream/items/contents")) {
        return jsonResponse({ items: [remoteArticle(`budget-item-${pageCount}`)] });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository, store } = createSidecarRepository();
    await repository.activate(scope);
    await writeSidecar(repository);
    const settings = createSettings([boundFeed()]);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    const outcome = await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-1",
    });

    expect(outcome).toEqual({
      outcome: "extended",
      complete: false,
      importedArticleCount: maxPages,
    });
    expect(pageCount).toBe(maxPages);
    // The very first page of this invocation started from the beginning
    // (no prior "Fetch more history" progress on file yet).
    expect(seenContinuationParams[0]).toBeNull();

    const sidecarAfterFirst = JSON.parse(store.files.get("sidecar.json") ?? "") as FreshRssSidecarFile;
    expect(sidecarAfterFirst.checkpoints[0].completedAtMs).toBe(0);
    expect(sidecarAfterFirst.checkpoints[0].historyFetchCursor).toBe(`cursor-${maxPages}`);
    expect(
      isFreshRssFeedEligibleForMoreHistory(
        "local-1",
        sidecarAfterFirst.feedBindings,
        sidecarAfterFirst.checkpoints,
      ),
    ).toBe(true);

    // A second, later invocation resumes deeper rather than re-walking pages
    // 1..maxPages again, and this time the stream terminates.
    const secondOutcome = await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-1",
    });

    expect(seenContinuationParams[maxPages]).toBe(`cursor-${maxPages}`);
    expect(secondOutcome).toEqual({
      outcome: "extended",
      complete: false,
      importedArticleCount: maxPages,
    });
    // Total distinct imported articles across both invocations: no duplicates.
    expect(settings.feeds[0].items).toHaveLength(maxPages * 2);
    expect(new Set(settings.feeds[0].items.map((i) => i.guid)).size).toBe(maxPages * 2);
  });

  it("stops on a mid-page content fetch failure without losing already-merged pages, and a retry safely re-reads without duplicating articles", async () => {
    // Persistently fails (through every in-cycle retry attempt) until flipped
    // for the second, later invocation -- keeps this test independent of
    // exactly how many in-cycle attempts the retry wrapper makes.
    let contentShouldFail = true;
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/stream/items/ids")) {
        return jsonResponse({ itemRefs: [{ id: "item-1" }] });
      }
      if (request.url.includes("/stream/items/contents")) {
        if (contentShouldFail) {
          return { status: 503, text: "" };
        }
        return jsonResponse({ items: [remoteArticle("item-1")] });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository, store } = createSidecarRepository();
    await repository.activate(scope);
    await writeSidecar(repository);
    const settings = createSettings([boundFeed()]);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
      retry: { sleep: async () => {} },
    });

    const interruptedOutcome = await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-1",
    });

    expect(interruptedOutcome).toEqual({
      outcome: "extended",
      complete: false,
      importedArticleCount: 0,
    });
    expect(settings.feeds[0].items).toHaveLength(0);
    const sidecarAfterInterruption = JSON.parse(
      store.files.get("sidecar.json") ?? "",
    ) as FreshRssSidecarFile;
    // No page was ever confirmed complete, so the resume cursor stays at the
    // beginning rather than skipping the page that failed.
    expect(sidecarAfterInterruption.checkpoints[0].historyFetchCursor ?? null).toBeNull();

    contentShouldFail = false;
    const retryOutcome = await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-1",
    });

    expect(retryOutcome).toEqual({ outcome: "extended", complete: true, importedArticleCount: 1 });
    expect(settings.feeds[0].items.map((i) => i.guid)).toEqual(["item-1"]);
  });

  it("applies local retention limits to newly imported older articles immediately", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/stream/items/ids")) {
        return jsonResponse({ itemRefs: [{ id: "item-1" }, { id: "item-2" }] });
      }
      if (request.url.includes("/stream/items/contents")) {
        return jsonResponse({ items: [remoteArticle("item-1"), remoteArticle("item-2")] });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository } = createSidecarRepository();
    await repository.activate(scope);
    await writeSidecar(repository);
    const settings = createSettings([boundFeed({ maxItemsLimit: 1 })]);

    const coordinator = new FreshRssSyncCoordinator({
      httpClient,
      getSettings: () => settings,
      saveSettings: vi.fn().mockResolvedValue(undefined),
      sidecarRepository: repository,
      getView: async () => null,
    });

    await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-1",
    });

    expect(settings.feeds[0].items).toHaveLength(1);
  });

  it("applies a pending facet mutation as authoritative for an older article discovered by this action", async () => {
    const httpClient = createHttpClient((request) => {
      if (request.url.includes("/accounts/ClientLogin")) return loginResponse();
      if (request.url.includes("/stream/items/ids")) {
        return jsonResponse({ itemRefs: [{ id: "item-1" }] });
      }
      if (request.url.includes("/stream/items/contents")) {
        return jsonResponse({ items: [remoteArticle("item-1")] });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const { repository } = createSidecarRepository();
    await repository.activate(scope);
    await writeSidecar(repository, {
      pendingFacetMutations: [
        {
          operationId: "op-1",
          remoteArticleId: "item-1",
          facet: "read",
          desiredState: true,
          createdAtMs: 1000,
          lastAttemptAtMs: null,
          attemptCount: 0,
          error: null,
        },
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

    await coordinator.runFetchMoreHistory({
      endpoint,
      credentials,
      scope,
      owner: activeOwner,
      feedId: "local-1",
    });

    const imported = settings.feeds[0].items.find((i) => i.guid === "item-1");
    expect(imported?.read).toBe(true);
  });
});

describe("selectFreshRssHistoryEligibleFeeds / isFreshRssFeedEligibleForMoreHistory", () => {
  it("excludes local-only feeds and feeds already fully enumerated, including only capped/never-run bound feeds", () => {
    const feeds: Feed[] = [
      { feedId: "local-only", title: "Local Only", url: "u1", folder: "f", items: [], lastUpdated: 0 },
      { feedId: "capped", title: "Capped Feed", url: "u2", folder: "f", items: [], lastUpdated: 0 },
      { feedId: "complete", title: "Complete Feed", url: "u3", folder: "f", items: [], lastUpdated: 0 },
    ];
    const feedBindings = [
      { feedId: "capped", remoteSubscriptionId: "sub/capped" },
      { feedId: "complete", remoteSubscriptionId: "sub/complete" },
    ];
    const checkpoints = [{ remoteSubscriptionId: "sub/complete", completedAtMs: 999 }];

    expect(selectFreshRssHistoryEligibleFeeds(feeds, feedBindings, checkpoints)).toEqual([
      { feedId: "capped", title: "Capped Feed" },
    ]);
    expect(isFreshRssFeedEligibleForMoreHistory("local-only", feedBindings, checkpoints)).toBe(false);
    expect(isFreshRssFeedEligibleForMoreHistory("capped", feedBindings, checkpoints)).toBe(true);
    expect(isFreshRssFeedEligibleForMoreHistory("complete", feedBindings, checkpoints)).toBe(false);
  });
});
