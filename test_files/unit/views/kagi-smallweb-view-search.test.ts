import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import type RssDashboardPlugin from "../../../main";
import { KagiSmallwebView } from "../../../src/views/kagi-smallweb-view";

const SEARCH_DEBOUNCE_MS = 150;

interface SmallwebEntry {
  postTitle: string;
  postUrl: string;
  blogName: string;
  blogUrl: string;
  updatedAt: Date;
  excerpt: string;
  domain: string;
}

type KagiSmallwebViewInternals = {
  smallwebEntries: SmallwebEntry[];
  smallwebFilteredEntries: SmallwebEntry[];
  smallwebSearchQuery: string;
  filterSmallwebEntries: () => void;
  render: () => void;
};

function entry(blogName: string, domain: string): SmallwebEntry {
  return {
    postTitle: `A post by ${blogName}`,
    postUrl: `https://${domain}/post`,
    blogName,
    blogUrl: `https://${domain}`,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    excerpt: `${blogName} writes about things.`,
    domain,
  };
}

function createView(entries: SmallwebEntry[]): {
  view: KagiSmallwebView;
  internals: KagiSmallwebViewInternals;
} {
  const plugin = {
    settings: {
      feeds: [],
      media: { defaultSmallwebFolder: "Smallweb" },
      useWebViewer: false,
    },
  } as unknown as RssDashboardPlugin;
  const leaf = { app: {} } as unknown as WorkspaceLeaf;
  const view = new KagiSmallwebView(leaf, plugin);
  const internals = view as unknown as KagiSmallwebViewInternals;
  internals.smallwebEntries = entries;
  internals.smallwebFilteredEntries = [...entries];

  document.body.appendChild(view.containerEl);
  view.render();
  return { view, internals };
}

function searchInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>(
    ".rss-discover-search-input",
  );
  if (!input) {
    throw new Error("The Small Web view did not render its search input");
  }
  return input;
}

function typeQuery(input: HTMLInputElement, query: string): void {
  input.value = query;
  input.dispatchEvent(new Event("input"));
}

function renderedCards(): number {
  return document.body.querySelectorAll(".rss-discover-card").length;
}

beforeEach(() => {
  // Drive the search debounce without waiting for real time.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.empty();
});

describe("Kagi Small Web search", () => {
  it("filters once with the last value after a typing burst", () => {
    const { internals } = createView([
      entry("Alpha", "alpha.example"),
      entry("Beta", "beta.example"),
    ]);
    const filterSpy = vi.spyOn(internals, "filterSmallwebEntries");

    const input = searchInput();
    typeQuery(input, "Alpha");
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS / 3);
    typeQuery(input, "Beta");
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);

    expect(internals.smallwebSearchQuery).toBe("");
    expect(filterSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(filterSpy).toHaveBeenCalledTimes(1);
    expect(internals.smallwebSearchQuery).toBe("Beta");
    expect(internals.smallwebFilteredEntries.map((e) => e.blogName)).toEqual([
      "Beta",
    ]);
    expect(renderedCards()).toBe(1);
  });

  it("does not filter or render when the view closes before the wait elapses", async () => {
    const { view, internals } = createView([
      entry("Alpha", "alpha.example"),
      entry("Beta", "beta.example"),
    ]);
    const filterSpy = vi.spyOn(internals, "filterSmallwebEntries");
    const renderSpy = vi.spyOn(internals, "render");

    typeQuery(searchInput(), "Alpha");
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50);

    await view.onClose();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(filterSpy).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
    expect(internals.smallwebSearchQuery).toBe("");
  });

  it("leaves the query empty when cleared before the wait elapses", () => {
    const { internals } = createView([
      entry("Alpha", "alpha.example"),
      entry("Beta", "beta.example"),
    ]);

    typeQuery(searchInput(), "Alpha");
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50);

    const clearButton = document.body.querySelector<HTMLButtonElement>(
      ".rss-input-clear-button",
    );
    if (!clearButton) {
      throw new Error("The Small Web view did not render its clear button");
    }
    clearButton.click();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(internals.smallwebSearchQuery).toBe("");
    expect(searchInput().value).toBe("");
    expect(internals.smallwebFilteredEntries).toHaveLength(2);
    expect(renderedCards()).toBe(2);
  });
});
