import { describe, it, expect } from "vitest";
import { App } from "obsidian";
import { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import {
  DEFAULT_SETTINGS,
  type Feed,
  type RssDashboardSettings,
} from "../../../src/types/types";
import { cloneJson } from "../../../src/services/storage-json";

interface PersistedSettingsHost {
  createPersistedSettings(settings: RssDashboardSettings): {
    feeds: Array<Record<string, unknown>>;
    storageFolder: string;
  };
}

function persist(settings: RssDashboardSettings) {
  const repository = new FeedStorageRepository(new App());
  return (
    repository as unknown as PersistedSettingsHost
  ).createPersistedSettings(settings);
}

/** The implementation before #1521: clone everything, then drop the items. */
function referencePersist(settings: RssDashboardSettings) {
  const cloned = cloneJson(settings);
  return {
    ...cloned,
    storageFolder: cloned.storageFolder.replace(/\/+$/, ""),
    feeds: cloned.feeds.map((feed) => {
      const { items: _items, feedId, ...config } = feed;
      void _items;
      return { ...config, feedId };
    }),
  };
}

function makeSettings(): RssDashboardSettings {
  const settings = cloneJson(DEFAULT_SETTINGS);
  settings.storageFolder = "RSS/Data/";
  settings.feeds = [
    {
      title: "One",
      url: "https://example.com/one.xml",
      folder: "RSS",
      feedId: "feed-one",
      items: [],
      lastUpdated: 1,
    },
    {
      title: "Two",
      url: "https://example.com/two.xml",
      folder: "RSS/Sub",
      feedId: "feed-two",
      items: [],
      lastUpdated: 2,
    },
  ] as Feed[];
  return settings;
}

describe("FeedStorageRepository persisted settings", () => {
  it("matches the clone-everything reference without reading any feed's items", () => {
    const settings = makeSettings();
    const reference = referencePersist(settings);

    for (const feed of settings.feeds) {
      Object.defineProperty(feed, "items", {
        enumerable: true,
        get() {
          throw new Error("items must not be read");
        },
      });
    }

    const result = persist(settings);

    expect(JSON.stringify(result)).toBe(JSON.stringify(reference));
    expect(result.feeds[0]).not.toHaveProperty("items");
    expect(result.feeds[1]).not.toHaveProperty("items");
  });

  it("shares no object with the live settings", () => {
    const settings = makeSettings();
    const result = persist(settings);
    const before = JSON.stringify(result);

    settings.feeds[0].title = "Changed";
    settings.folders.push({ name: "New", subfolders: [] });
    settings.availableTags.push({ name: "extra", color: "#fff" });

    expect(JSON.stringify(result)).toBe(before);
  });
});
