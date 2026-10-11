import { describe, it, expect, vi } from "vitest";
import { buildArticle, createArticleListHarness } from "./article-list-harness";
import {
  LEFT_HANDED_LAYOUT_ROOT_CLASS,
  LEFT_HANDED_LAYOUT_STORAGE_KEY,
} from "../../../src/utils/left-handed-layout";

/** The footer's action controls, in their required document order. */
const ACTION_CLASSES = [
  "rss-dashboard-read-toggle",
  "rss-dashboard-save-toggle",
  "rss-dashboard-star-toggle",
  "rss-dashboard-tags-toggle",
];

const MIRRORED_VIEWS = [
  { name: "card", viewStyle: "card", footer: ".rss-dashboard-card-footer" },
  { name: "feed", viewStyle: "feed", footer: ".rss-dashboard-feed-footer" },
] as const;

function actionClass(el: Element): string | undefined {
  return ACTION_CLASSES.find((cls) => el.classList.contains(cls));
}

function rootHasMirrorClass(container: HTMLElement): boolean {
  return (
    container
      .querySelector(".rss-dashboard-articles-list")
      ?.classList.contains(LEFT_HANDED_LAYOUT_ROOT_CLASS) ?? false
  );
}

describe("ArticleList mirrored footer", () => {
  it("omits the mirror class when the per-device value is off", () => {
    const { container, list, cleanup } = createArticleListHarness({
      settings: { viewStyle: "card" },
      articles: [buildArticle()],
    });

    try {
      list.render();

      expect(rootHasMirrorClass(container)).toBe(false);
    } finally {
      cleanup();
    }
  });

  it.each(MIRRORED_VIEWS)(
    "adds the mirror class to the $name root when the per-device value is on",
    ({ viewStyle }) => {
      const { container, list, app, cleanup } = createArticleListHarness({
        settings: { viewStyle },
        articles: [buildArticle()],
      });

      try {
        app.saveLocalStorage(LEFT_HANDED_LAYOUT_STORAGE_KEY, true);
        list.render();

        expect(rootHasMirrorClass(container)).toBe(true);
      } finally {
        cleanup();
      }
    },
  );

  it.each(MIRRORED_VIEWS)(
    "keeps the $name footer document order and Mark read as the first footer stop while mirrored",
    ({ viewStyle, footer }) => {
      const { container, list, app, cleanup } = createArticleListHarness({
        settings: { viewStyle },
        articles: [buildArticle()],
      });

      try {
        app.saveLocalStorage(LEFT_HANDED_LAYOUT_STORAGE_KEY, true);
        list.render();

        const footerEl = container.querySelector(footer);
        expect(footerEl).toBeTruthy();

        const stops = Array.from(
          footerEl!.querySelectorAll<HTMLElement>('[role="button"]'),
        );
        expect(stops.map(actionClass)).toEqual(ACTION_CLASSES);
        expect(stops[0].getAttribute("aria-label")).toBe("Mark as read");

        // The toolbar is the first footer child and the date the last, so the
        // flattened order is read -> save -> star -> tags -> date.
        const children = Array.from(footerEl!.children);
        expect(
          children[0].classList.contains("rss-dashboard-action-toolbar"),
        ).toBe(true);
        expect(
          children[children.length - 1].classList.contains(
            "rss-dashboard-article-date",
          ),
        ).toBe(true);
      } finally {
        cleanup();
      }
    },
  );

  it("leaves list view without card or feed footers even when the value is on", () => {
    const { container, list, app, cleanup } = createArticleListHarness({
      settings: { viewStyle: "list" },
      articles: [buildArticle()],
    });

    try {
      app.saveLocalStorage(LEFT_HANDED_LAYOUT_STORAGE_KEY, true);
      list.render();

      expect(container.querySelector(".rss-dashboard-card-footer")).toBeFalsy();
      expect(container.querySelector(".rss-dashboard-feed-footer")).toBeFalsy();
    } finally {
      cleanup();
    }
  });

  it("shows no card footer when the mobile card toolbar is off, even when the value is on", () => {
    // A mobile viewport is required for the card toolbar to be hideable.
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(max-width: 768px)",
        }) as MediaQueryList,
    );

    const { container, list, app, cleanup } = createArticleListHarness({
      settings: {
        viewStyle: "card",
        display: { mobileShowCardToolbar: false },
      },
      articles: [buildArticle()],
    });

    try {
      app.saveLocalStorage(LEFT_HANDED_LAYOUT_STORAGE_KEY, true);
      list.render();

      expect(rootHasMirrorClass(container)).toBe(true);
      expect(container.querySelector(".rss-dashboard-card-footer")).toBeFalsy();
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });
});
