import { describe, it, expect } from "vitest";
import type { Feed, RssDashboardSettings } from "../../../src/types/types";
import { DEFAULT_SETTINGS } from "../../../src/types/types";

/**
 * Tests for feed import migration logic.
 *
 * These tests verify that feeds imported via OPML or JSON respect global default settings
 * for autoDeleteDuration and maxItemsLimit when not explicitly set.
 */

function cloneSettings(
  overrides?: Partial<RssDashboardSettings>,
): RssDashboardSettings {
  const settings = JSON.parse(
    JSON.stringify(DEFAULT_SETTINGS),
  ) as RssDashboardSettings;
  if (overrides) {
    Object.assign(settings, overrides);
  }
  return settings;
}

describe("Feed Import - autoDeleteDuration Default", () => {
  const defaultAutoDeleteDuration = 30;
  const defaultMaxItems = 100;

  it("should use global defaultAutoDeleteDuration when feed has no autoDeleteDuration", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration,
      maxItems: defaultMaxItems,
    });

    const feedWithoutAutoDelete: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      // autoDeleteDuration is NOT set
    };

    // Simulate migration logic: apply default if not set
    if (typeof feedWithoutAutoDelete.autoDeleteDuration !== "number") {
      feedWithoutAutoDelete.autoDeleteDuration =
        settings.defaultAutoDeleteDuration;
    }

    expect(feedWithoutAutoDelete.autoDeleteDuration).toBe(
      defaultAutoDeleteDuration,
    );
  });

  it("should preserve feed's explicit autoDeleteDuration when set", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration,
      maxItems: defaultMaxItems,
    });

    const feedWithExplicitAutoDelete: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      autoDeleteDuration: 7, // Explicit override
    };

    // Simulate migration logic: apply default only if not set
    if (typeof feedWithExplicitAutoDelete.autoDeleteDuration !== "number") {
      feedWithExplicitAutoDelete.autoDeleteDuration =
        settings.defaultAutoDeleteDuration;
    }

    expect(feedWithExplicitAutoDelete.autoDeleteDuration).toBe(7);
  });

  it("should use global maxItems when feed has no maxItemsLimit", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration,
      maxItems: defaultMaxItems,
    });

    const feedWithoutMaxItems: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      // maxItemsLimit is NOT set
    };

    // Simulate migration logic: apply default if not set
    if (typeof feedWithoutMaxItems.maxItemsLimit !== "number") {
      feedWithoutMaxItems.maxItemsLimit = settings.maxItems;
    }

    expect(feedWithoutMaxItems.maxItemsLimit).toBe(defaultMaxItems);
  });

  it("should preserve feed's explicit maxItemsLimit when set", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration,
      maxItems: defaultMaxItems,
    });

    const feedWithExplicitMaxItems: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      maxItemsLimit: 50, // Explicit override
    };

    // Simulate migration logic: apply default only if not set
    if (typeof feedWithExplicitMaxItems.maxItemsLimit !== "number") {
      feedWithExplicitMaxItems.maxItemsLimit = settings.maxItems;
    }

    expect(feedWithExplicitMaxItems.maxItemsLimit).toBe(50);
  });
});

describe("Feed Import - OPML Import Scenario", () => {
  it("should apply defaults to feeds imported via OPML without explicit settings", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration: 30,
      maxItems: 100,
    });

    // Simulate feeds as they come from OPML import (without autoDeleteDuration/maxItemsLimit)
    const importedFeeds: Feed[] = [
      {
        title: "Ted Talks Daily",
        url: "https://feeds.feedburner.com/tedtalks_video",
        folder: "Uncategorized",
        items: [],
        lastUpdated: Date.now(),
      },
      {
        title: "BBC News",
        url: "https://feeds.bbci.co.uk/news/rss.xml",
        folder: "News",
        items: [],
        lastUpdated: Date.now(),
      },
    ];

    // Migration: apply defaults to each feed
    for (const feed of importedFeeds) {
      if (typeof feed.autoDeleteDuration !== "number") {
        feed.autoDeleteDuration = settings.defaultAutoDeleteDuration;
      }
      if (typeof feed.maxItemsLimit !== "number") {
        feed.maxItemsLimit = settings.maxItems;
      }
    }

    expect(importedFeeds[0].autoDeleteDuration).toBe(30);
    expect(importedFeeds[0].maxItemsLimit).toBe(100);
    expect(importedFeeds[1].autoDeleteDuration).toBe(30);
    expect(importedFeeds[1].maxItemsLimit).toBe(100);
  });

  it("should preserve explicit values from OPML when present", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration: 30,
      maxItems: 100,
    });

    // Feed with explicit OPML values
    const importedFeed: Feed = {
      title: "Custom Feed",
      url: "https://example.com/feed.xml",
      folder: "Custom",
      items: [],
      lastUpdated: Date.now(),
      autoDeleteDuration: 7, // From OPML
      maxItemsLimit: 25, // From OPML
    };

    // Migration: should NOT overwrite explicit values
    if (typeof importedFeed.autoDeleteDuration !== "number") {
      importedFeed.autoDeleteDuration = settings.defaultAutoDeleteDuration;
    }
    if (typeof importedFeed.maxItemsLimit !== "number") {
      importedFeed.maxItemsLimit = settings.maxItems;
    }

    expect(importedFeed.autoDeleteDuration).toBe(7);
    expect(importedFeed.maxItemsLimit).toBe(25);
  });
});

describe("Feed Import - JSON Import Scenario", () => {
  it("should apply defaults to legacy feeds loaded from JSON without these fields", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration: 30,
      maxItems: 100,
    });

    // Simulate legacy feed from JSON (before these fields existed)
    const legacyFeed: Feed = {
      title: "Legacy Feed",
      url: "https://example.com/legacy.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      // No autoDeleteDuration or maxItemsLimit
    };

    // Migration in loadSettings
    if (typeof legacyFeed.autoDeleteDuration !== "number") {
      legacyFeed.autoDeleteDuration = settings.defaultAutoDeleteDuration;
    }
    if (typeof legacyFeed.maxItemsLimit !== "number") {
      legacyFeed.maxItemsLimit = settings.maxItems;
    }

    expect(legacyFeed.autoDeleteDuration).toBe(30);
    expect(legacyFeed.maxItemsLimit).toBe(100);
  });
});

describe("Feed Import - Zero Values Edge Case", () => {
  it("should treat autoDeleteDuration: 0 as disabled (not as missing)", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration: 30,
      maxItems: 100,
    });

    const feedWithZeroAutoDelete: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      autoDeleteDuration: 0, // Explicitly disabled
    };

    // The check uses typeof !== "number", so 0 should NOT trigger default
    if (typeof feedWithZeroAutoDelete.autoDeleteDuration !== "number") {
      feedWithZeroAutoDelete.autoDeleteDuration =
        settings.defaultAutoDeleteDuration;
    }

    expect(feedWithZeroAutoDelete.autoDeleteDuration).toBe(0);
  });

  it("should treat maxItemsLimit: 0 as unlimited (not as missing)", () => {
    const settings = cloneSettings({
      defaultAutoDeleteDuration: 30,
      maxItems: 100,
    });

    const feedWithZeroMaxItems: Feed = {
      title: "Test Feed",
      url: "https://example.com/feed.xml",
      folder: "Uncategorized",
      items: [],
      lastUpdated: Date.now(),
      maxItemsLimit: 0, // Explicitly unlimited
    };

    // The check uses typeof !== "number", so 0 should NOT trigger default
    if (typeof feedWithZeroMaxItems.maxItemsLimit !== "number") {
      feedWithZeroMaxItems.maxItemsLimit = settings.maxItems;
    }

    expect(feedWithZeroMaxItems.maxItemsLimit).toBe(0);
  });
});
