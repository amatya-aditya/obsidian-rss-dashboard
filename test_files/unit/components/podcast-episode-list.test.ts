import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedItem } from "../../../src/types/types";
import { PodcastEpisodeList } from "../../../src/components/podcast-episode-list";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function episode(index: number): FeedItem {
  return {
    title: `Episode ${index}`,
    link: `https://example.com/${index}`,
    description: "",
    pubDate: `2026-01-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    guid: `episode-${index}`,
    read: false,
    starred: false,
    tags: [],
    feedTitle: "AI Data",
    feedUrl: "https://example.com/feed.xml",
    mediaType: "podcast",
  };
}

describe("PodcastEpisodeList", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.empty();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a bounded episode list and loads another batch on request", () => {
    const container = document.body.createDiv();
    new PodcastEpisodeList(container, {
      episodes: Array.from({ length: 45 }, (_, index) => episode(index + 1)),
      activeEpisodeGuid: "episode-1",
      theme: "obsidian",
      sortOrder: "recent",
      onEpisodeSelected: vi.fn(),
      onSortRequested: vi.fn(),
    }).render();

    expect(container.querySelector(".episode-list-title")?.textContent).toBe(
      "More episodes from AI Data",
    );
    expect(container.querySelectorAll(".episode-list-row")).toHaveLength(20);
    expect(container.querySelector(".episode-list-range")?.textContent).toBe(
      "Showing 20 of 45",
    );
    const statusRow = container.querySelector(".episode-list-status-row");
    const sort = container.querySelector(".episode-list-sort");
    expect(statusRow?.contains(container.querySelector(".episode-list-range"))).toBe(true);
    expect(statusRow?.contains(sort)).toBe(true);
    expect(sort?.tagName).toBe("SELECT");

    (container.querySelector(".episode-list-load-more") as HTMLButtonElement).click();

    expect(container.querySelectorAll(".episode-list-row")).toHaveLength(40);
    expect(container.querySelector(".episode-list-range")?.textContent).toBe(
      "Showing 40 of 45",
    );
  });

  it("restores the active episode's batch without selecting it", () => {
    const container = document.body.createDiv();
    const onEpisodeSelected = vi.fn();
    new PodcastEpisodeList(container, {
      episodes: Array.from({ length: 45 }, (_, index) => episode(index + 1)),
      activeEpisodeGuid: "episode-36",
      theme: "obsidian",
      sortOrder: "recent",
      onEpisodeSelected,
      onSortRequested: vi.fn(),
    }).render();

    expect(container.querySelector(".episode-list-current")).not.toBeNull();
    (container.querySelector(".episode-list-current") as HTMLButtonElement).click();

    expect(container.querySelectorAll(".episode-list-row")).toHaveLength(40);
    expect(container.querySelector(".episode-list-row.active")?.getAttribute("data-episode-guid")).toBe("episode-36");
    expect(onEpisodeSelected).not.toHaveBeenCalled();
  });

  it("keeps Autoplay next episode interactive in its own episode-list row", () => {
    const container = document.body.createDiv();
    const onAutoplayChanged = vi.fn();
    new PodcastEpisodeList(container, {
      episodes: Array.from({ length: 2 }, (_, index) => episode(index + 1)),
      activeEpisodeGuid: "episode-1",
      theme: "obsidian",
      sortOrder: "recent",
      isAutoplayEnabled: false,
      onEpisodeSelected: vi.fn(),
      onSortRequested: vi.fn(),
      onAutoplayChanged,
    }).render();

    const statusRow = container.querySelector(".episode-list-status-row");
    const autoplayRow = container.querySelector(".episode-list-autoplay-row");
    const autoplay = container.querySelector<HTMLInputElement>(
      ".podcast-autoplay-checkbox",
    );
    const controls = container.querySelector(".episode-list-controls");
    expect(autoplayRow?.contains(autoplay)).toBe(true);
    expect(statusRow?.contains(controls)).toBe(true);

    autoplay?.click();

    expect(onAutoplayChanged).toHaveBeenCalledWith(true);
  });

  it("places Autoplay next episode above the count and sort row", () => {
    const container = document.body.createDiv();
    new PodcastEpisodeList(container, {
      episodes: Array.from({ length: 2 }, (_, index) => episode(index + 1)),
      activeEpisodeGuid: "episode-1",
      theme: "obsidian",
      sortOrder: "recent",
      onEpisodeSelected: vi.fn(),
      onSortRequested: vi.fn(),
    }).render();

    const section = container.querySelector(".podcast-episode-list-section");
    const children = Array.from(section?.children ?? []);
    const autoplayIndex = children.findIndex((child) =>
      child.classList.contains("episode-list-autoplay-row"),
    );
    const statusIndex = children.findIndex((child) =>
      child.classList.contains("episode-list-status-row"),
    );

    expect(autoplayIndex).toBe(1);
    expect(statusIndex).toBe(autoplayIndex + 1);
    expect(
      section?.querySelector(".episode-list-autoplay-row .podcast-autoplay-container"),
    ).not.toBeNull();
  });
});
