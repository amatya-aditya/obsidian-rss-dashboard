import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { RssDashboardView } from "../../../src/views/dashboard-view";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
  shouldUseMobileSidebarLayout: () => false,
}));

vi.mock("../../../src/views/reader-view", () => ({
  ReaderView: class ReaderViewMock {},
  RSS_READER_VIEW_TYPE: "rss-reader-view",
}));

interface ViewingFilterRowHost {
  activeStatusFilters: Set<string>;
  activeTagFilters: Set<string>;
  openViewingFiltersMenu: (opener?: HTMLElement) => void;
}

function renderRow(statusFilters: string[]): HTMLElement {
  const host: ViewingFilterRowHost = {
    activeStatusFilters: new Set(statusFilters),
    activeTagFilters: new Set(),
    openViewingFiltersMenu: vi.fn(),
  };
  const render = (
    RssDashboardView.prototype as unknown as {
      renderViewingFiltersRow(
        this: ViewingFilterRowHost,
        parent: HTMLElement,
        counts: { shown: number; filteredOut: number; total: number },
      ): void;
    }
  ).renderViewingFiltersRow;
  const parent = document.body.createDiv();
  render.call(host, parent, { shown: 2, filteredOut: 1, total: 3 });
  return parent.querySelector(
    ".rss-dashboard-viewing-filter-stats-text",
  ) as HTMLElement;
}

beforeEach(() => {
  installObsidianDomPolyfills();
});

afterEach(() => {
  document.body.empty();
});

describe("viewing filter status text (#1704)", () => {
  it("puts the Viewing filters label in its own span ahead of the counts", () => {
    const text = renderRow(["unread"]);

    expect(
      text.querySelector(".rss-dashboard-viewing-filter-stats-label")
        ?.textContent,
    ).toBe("Viewing filters: ");
    expect(text.textContent).toBe(
      "Viewing filters: Showing 2 | Filtered out 1 | Total 3",
    );
  });

  it("puts the No filters applied prefix in the same hideable span", () => {
    const text = renderRow([]);

    expect(
      text.querySelector(".rss-dashboard-viewing-filter-stats-label")
        ?.textContent,
    ).toBe("No filters applied - ");
    expect(text.textContent).toBe(
      "No filters applied - Showing 2 | Filtered out 1 | Total 3",
    );
  });
});
