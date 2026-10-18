import { afterEach, describe, expect, it, vi } from "vitest";
import { App, type MockApp, type PluginManifest } from "obsidian";
import RssDashboardPlugin from "../../../main";
import { getFilteredArticleScope } from "../../../src/services/article-scope";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type FeedItem,
} from "../../../src/types/types";

const FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=UC1";
const startedPlugins: RssDashboardPlugin[] = [];

function manifest(app: MockApp): PluginManifest {
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

function video(): FeedItem {
  return {
    title: "A video",
    link: "https://www.youtube.com/watch?v=abc123",
    description: "",
    pubDate: "2026-09-01T00:00:00.000Z",
    guid: "yt:video:abc123",
    read: false,
    starred: false,
    tags: [],
    feedTitle: "A channel",
    feedUrl: FEED_URL,
    coverImage: "",
    mediaType: "video",
    videoId: "abc123",
    playbackProgress: { position: 235, duration: 802, lastUpdated: 1 },
  };
}

async function startPlugin(app: MockApp): Promise<RssDashboardPlugin> {
  const plugin = new RssDashboardPlugin(app, manifest(app));
  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.media.rememberPlaybackProgress = true;
  plugin.loadData = vi.fn().mockResolvedValue(settings);
  plugin.saveData = vi.fn().mockResolvedValue(undefined);
  await plugin.onload();
  plugin.settings.media.rememberPlaybackProgress = true;
  plugin.settings.feeds = [
    {
      title: "A channel",
      url: FEED_URL,
      folder: "",
      lastUpdated: Date.now(),
      items: [video()],
    } as Feed,
  ];
  startedPlugins.push(plugin);
  return plugin;
}

/** The item a dashboard card holds: a copy made by the article scope. */
function dashboardCardItem(plugin: RssDashboardPlugin): FeedItem {
  const [card] = getFilteredArticleScope({
    currentFeed: null,
    currentFolder: null,
    selectedFolders: [],
    selectedFeeds: [],
    selectedTags: [],
    settings: plugin.settings,
    getAllDescendantFolders: () => [],
  });
  return card;
}

afterEach(() => {
  startedPlugins.splice(0).forEach((plugin) => plugin.unload());
  vi.restoreAllMocks();
  document.body.empty();
});

describe("playback progress saved through a dashboard card's copy (#1236)", () => {
  it("keeps the card's item current, so reopening it resumes at the new position", async () => {
    const plugin = await startPlugin(App.createMock());
    const card = dashboardCardItem(plugin);
    expect(card).not.toBe(plugin.settings.feeds[0].items[0]);

    // The Reader saves through the item the card handed it.
    plugin.updatePlaybackProgress(card.feedUrl, card.guid, 4, 802, true, card);

    expect(plugin.settings.feeds[0].items[0].playbackProgress?.position).toBe(
      4,
    );
    // A split view or sidebar Reader leaves the dashboard on screen, so the
    // next click on the same card passes this same copy back to the Reader.
    expect(card.playbackProgress?.position).toBe(4);
  });
});
