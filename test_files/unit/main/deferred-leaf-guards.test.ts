/**
 * The deferred-leaf guards in `main.ts` wait for `WorkspaceLeaf.loadIfDeferred`
 * only on Obsidian 1.7.2+. These tests pin that branch against the stub's real
 * leaves, now that `requireApiVersion` is modeled (#431). The version hook
 * exercises the minimum-version path the old "always false" stub could not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RssDashboardPlugin from "../../../main";
import {
  App,
  __resetObsidianVersion,
  __setObsidianVersion,
  type MockApp,
  type PluginManifest,
} from "obsidian";
import { RSS_DASHBOARD_VIEW_TYPE } from "../../../src/views/dashboard-view";
import { RSS_DISCOVER_VIEW_TYPE } from "../../../src/views/discover-view";
import { RSS_READER_VIEW_TYPE } from "../../../src/views/reader-view";

function createManifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    dir: ".",
  } as PluginManifest;
}

/**
 * Opens a stub leaf and records when the guard loads it (`loadIfDeferred`) and
 * when the guard reads its view. `getLeavesOfType` is stubbed to return this
 * leaf directly, so indexing the workspace does not count as a view read.
 */
function openTrackedLeaf(app: MockApp, viewType: string): string[] {
  const leaf = app.workspace.getLeaf("tab");
  const events: string[] = [];
  const loadIfDeferred = leaf.loadIfDeferred.bind(leaf);

  Object.defineProperty(leaf, "view", {
    configurable: true,
    get() {
      events.push("view");
      return { getViewType: () => viewType };
    },
  });
  vi.spyOn(leaf, "loadIfDeferred").mockImplementation(async () => {
    events.push("loadIfDeferred");
    await loadIfDeferred();
  });
  vi.spyOn(app.workspace, "getLeavesOfType").mockReturnValue([leaf] as never);

  return events;
}

type GuardRun = (plugin: RssDashboardPlugin) => Promise<unknown>;

const guards: Array<{ name: string; viewType: string; run: GuardRun }> = [
  {
    name: "getActiveDashboardView",
    viewType: RSS_DASHBOARD_VIEW_TYPE,
    run: (plugin) => plugin.getActiveDashboardView(),
  },
  {
    name: "refreshDashboardViews",
    viewType: RSS_DASHBOARD_VIEW_TYPE,
    run: (plugin) => plugin.refreshDashboardViews(),
  },
  {
    name: "getActiveDiscoverView",
    viewType: RSS_DISCOVER_VIEW_TYPE,
    run: (plugin) => plugin.getActiveDiscoverView(),
  },
  {
    name: "getActiveReaderView",
    viewType: RSS_READER_VIEW_TYPE,
    run: (plugin) => plugin.getActiveReaderView(),
  },
];

describe("deferred-leaf guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    __resetObsidianVersion();
  });

  it.each(guards)(
    "waits for the deferred leaf in $name on the current API",
    async ({ run, viewType }) => {
      const app = App.createMock();
      const plugin = new RssDashboardPlugin(app, createManifest());
      const events = openTrackedLeaf(app, viewType);

      await run(plugin);

      expect(events).toEqual(["loadIfDeferred", "view"]);
    },
  );

  it.each(guards)(
    "skips the deferred load in $name below 1.7.2",
    async ({ run, viewType }) => {
      __setObsidianVersion("1.6.0");
      const app = App.createMock();
      const plugin = new RssDashboardPlugin(app, createManifest());
      const events = openTrackedLeaf(app, viewType);

      await run(plugin);

      expect(events).toEqual(["view"]);
    },
  );
});
