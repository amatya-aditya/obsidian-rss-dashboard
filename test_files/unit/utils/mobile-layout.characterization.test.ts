import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { FolderSelectorPopup } from "../../../src/components/folder-selector-popup";
import { addTagMultiSelectControl } from "../../../src/components/tag-multi-select-control";
import { DiscoverView } from "../../../src/views/discover-view";
import { createReaderFormatPortal } from "../../../src/utils/reader-format-portal";
import { createTagsDropdownPortal } from "../../../src/utils/tags-dropdown-portal";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import {
  buildArticle,
  createArticleListHarness,
} from "../components/article-list-harness";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

beforeEach(() => {
  installObsidianDomPolyfills();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.empty();
});

function viewport(matches: boolean) {
  const matchMedia = vi.fn(() => ({ matches }));
  // A distinct owning window exposes accidental reads of the global window.
  const win = {
    matchMedia,
    innerWidth: 1000,
    innerHeight: 800,
    getComputedStyle: window.getComputedStyle.bind(window),
    setTimeout: window.setTimeout.bind(window),
    createEl: window.createEl.bind(window),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as typeof window;
  return { win, matchMedia };
}

describe("mobile-layout call sites before centralization", () => {
  it.each([true, false])(
    "uses activeWindow's 600px query for the folder popup (matches=%s)",
    (matches) => {
      const { win, matchMedia } = viewport(matches);
      vi.stubGlobal("activeWindow", win);
      const popup = new FolderSelectorPopup(
        { settings: DEFAULT_SETTINGS } as ConstructorParameters<
          typeof FolderSelectorPopup
        >[0],
        {
          anchorEl: document.body.createDiv(),
          onSelect: vi.fn(),
          listOnly: true,
        },
      );
      expect(matchMedia).toHaveBeenCalledWith("(max-width: 600px)");
      expect(
        document.querySelector<HTMLElement>(".rss-folder-selector-popup")?.style
          .left,
      ).toBe(matches ? "" : "0px");
      vi.runOnlyPendingTimers();
      popup.close();
    },
  );

  it.each([true, false])(
    "uses activeWindow's 768px query for card toolbar visibility (matches=%s)",
    (matches) => {
      const { win, matchMedia } = viewport(matches);
      const h = createArticleListHarness({
        settings: {
          viewStyle: "card",
          display: { mobileShowCardToolbar: false },
        },
        articles: [buildArticle()],
      });
      vi.stubGlobal("activeWindow", win);
      try {
        h.list.render();
        expect(matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
        expect(
          h.container.querySelector(".rss-dashboard-card-footer") === null,
        ).toBe(matches);
      } finally {
        h.list.destroy();
        h.cleanup();
      }
    },
  );

  it.each([true, false, undefined])(
    "keeps Discover pagination compact only when activeWindow matches (matches=%s)",
    (matches) => {
      const { win, matchMedia } = viewport(matches ?? false);
      if (matches === undefined) Object.assign(win, { matchMedia: undefined });
      vi.stubGlobal("activeWindow", win);
      const view = Object.create(DiscoverView.prototype) as DiscoverView;
      const container = document.body.createDiv();
      view["renderPagination"](container, 5, 10, 10, 100);
      const pageLabels = Array.from(
        container.querySelectorAll(
          ".rss-dashboard-pagination-btn:not(.prev):not(.next)",
        ),
        (el) => el.textContent,
      );
      expect(pageLabels).toEqual(
        matches
          ? ["1", "4", "5", "6", "10"]
          : ["1", "3", "4", "5", "6", "7", "10"],
      );
      if (matches !== undefined)
        expect(matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
    },
  );

  it.each([true, false])(
    "uses the anchor's owning window for both reader portals (matches=%s)",
    (matches) => {
      const { win, matchMedia } = viewport(matches);
      const globalQuery = vi.spyOn(window, "matchMedia");
      vi.spyOn(document, "defaultView", "get").mockReturnValue(win);
      const anchor = document.body.createDiv();
      const format = {
        textAlign: "justify",
        paragraphWidth: 100,
        fontScalePct: 100,
        lineHeightPct: 140,
        fontFamily: "default",
        paragraphSpacing: "default",
      } as const;
      const reader = createReaderFormatPortal({
        anchor,
        format: { ...format },
        defaults: { ...format },
        applyFormat: vi.fn(),
        scheduleSave: vi.fn(),
        flushSave: vi.fn(),
        openReaderDisplaySettings: vi.fn(),
      });
      const closeTags = createTagsDropdownPortal({
        app: new App(),
        anchor,
        settings: structuredClone(DEFAULT_SETTINGS),
        item: buildArticle(),
        onTagAssignmentChange: vi.fn(),
      });
      expect(
        document.querySelector(".rss-reader-format-mobile-sheet") !== null,
      ).toBe(matches);
      expect(
        document.querySelector(".rss-dashboard-tags-mobile-sheet") !== null,
      ).toBe(matches);
      expect(matchMedia).toHaveBeenCalledTimes(2);
      expect(matchMedia).toHaveBeenNthCalledWith(1, "(max-width: 768px)");
      expect(matchMedia).toHaveBeenNthCalledWith(2, "(max-width: 768px)");
      expect(globalQuery).not.toHaveBeenCalled();
      vi.runOnlyPendingTimers();
      reader.close(false);
      closeTags();
    },
  );

  it.each([true, false])(
    "uses the control's owning window for the tag selector (matches=%s)",
    (matches) => {
      const { win, matchMedia } = viewport(matches);
      const globalQuery = vi.spyOn(window, "matchMedia");
      vi.spyOn(document, "defaultView", "get").mockReturnValue(win);
      const controlEl = document.body.createDiv();
      addTagMultiSelectControl({
        setting: { controlEl } as unknown as import("obsidian").Setting,
        availableTags: [{ name: "News", color: "#123456" }],
        selectedTagNames: [],
        onChange: vi.fn(),
      });
      const trigger = controlEl.querySelector<HTMLButtonElement>("button")!;
      trigger.click();
      expect(
        document.querySelector(
          ".rss-dashboard-tag-multi-select-mobile-sheet",
        ) !== null,
      ).toBe(matches);
      expect(matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
      expect(globalQuery).not.toHaveBeenCalled();
      vi.runOnlyPendingTimers();
      trigger.click();
    },
  );
});
