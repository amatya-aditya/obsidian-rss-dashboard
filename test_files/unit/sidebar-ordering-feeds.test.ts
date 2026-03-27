import { describe, it, expect } from "vitest";
import {
  moveFeedAndInsert,
  moveFeedToFolderAppend,
} from "../../src/services/sidebar-ordering-controller";
import {
  DEFAULT_SETTINGS,
  type RssDashboardSettings,
  type Feed,
} from "../../src/types/types";

function cloneSettings(): RssDashboardSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as RssDashboardSettings;
}

function makeFeed(title: string, url: string, folder = ""): Feed {
  return { title, url, folder, items: [], lastUpdated: 0 };
}

describe("Sidebar feed ordering helpers (TDD)", () => {
  it("reorders within the same folder and switches that folder to custom", () => {
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("A", "a", "Work"),
      makeFeed("B", "b", "Work"),
      makeFeed("C", "c", "Work"),
    ];

    const result = moveFeedAndInsert(settings, {
      draggedUrl: "c",
      targetUrl: "a",
      placement: "before",
    });

    expect(result.ok).toBe(true);
    expect(settings.feeds.map((f) => f.url)).toEqual(["c", "a", "b"]);
    expect(settings.folderFeedSortOrders?.["Work"]?.by).toBe("custom");
  });

  it("moves into another folder and appends, switching destination to custom", () => {
    const settings = cloneSettings();
    settings.feeds = [
      makeFeed("A", "a", "Work"),
      makeFeed("B", "b", "Home"),
      makeFeed("C", "c", "Home"),
    ];

    const result = moveFeedToFolderAppend(settings, {
      draggedUrl: "a",
      destinationFolderPath: "Home",
    });

    expect(result.ok).toBe(true);
    expect(settings.feeds.find((f) => f.url === "a")?.folder).toBe("Home");
    expect(settings.folderFeedSortOrders?.["Home"]?.by).toBe("custom");
  });
});
