import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderCardView } from "../../../../../src/components/article-list/views/card-view";
import { renderFeedView } from "../../../../../src/components/article-list/views/feed-view";
import { renderListView } from "../../../../../src/components/article-list/views/list-view";
import {
  getArticleFilterSummaryText,
  getArticlePreviewSummaryText,
} from "../../../../../src/utils/article-preview-utils";
import { KeywordFilterService } from "../../../../../src/services/keyword-filter-service";
import { DEFAULT_SETTINGS } from "../../../../../src/types/types";
import { HighlightService } from "../../../../../src/services/highlight-service";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

const cases = [true, false].flatMap((showSummary) =>
  [true, false].flatMap((showCoverImage) =>
    [true, false].flatMap((hasText) =>
      ["missing", "available", "failed", "cached-failed"].map((imageState) => ({
        showSummary,
        showCoverImage,
        hasText,
        imageState,
      })),
    ),
  ),
);

for (const view of ["card", "feed"] as const) {
  describe(`${view} empty preview placeholder`, () => {
    let container: HTMLElement;
    beforeEach(() => {
      container = document.body.createDiv();
    });
    afterEach(() => {
      document.body.empty();
      vi.restoreAllMocks();
    });

    it.each(cases)(
      "summary=$showSummary cover=$showCoverImage text=$hasText image=$imageState",
      ({ showSummary, showCoverImage, hasText, imageState }) => {
        const article = makeArticle({
          description: hasText ? "An article preview" : "",
          coverImage:
            imageState === "missing" ? "" : "https://example.com/cover.jpg",
        });
        const snapshot = { ...article };
        const ctx = baseViewContext();
        Object.assign(ctx.settings.display, {
          showSummary,
          showCoverImage,
          allowImageCaching: imageState === "cached-failed",
        });
        ctx.resolveCachedImageUrl = () => "app://cache/cover.jpg";
        const deps = baseViewDeps();
        if (view === "card") {
          renderCardView(
            container,
            [article],
            { ...ctx, showCardToolbar: true },
            deps,
          );
        } else {
          renderFeedView(container, [article], ctx, deps);
        }
        const image = container.querySelector("img");
        const placeholderSelector = `.rss-dashboard-${view}-preview-placeholder`;
        if (imageState === "cached-failed" && image) {
          image.dispatchEvent(new Event("error"));
          expect(image.getAttribute("src")).toBe(article.coverImage);
          expect(container.querySelector(placeholderSelector)).toBeNull();
        }
        if (
          (imageState === "failed" || imageState === "cached-failed") &&
          image
        ) {
          image.dispatchEvent(new Event("error"));
          // Repeated late errors must not duplicate a placeholder or its ID.
          image.dispatchEvent(new Event("error"));
        }
        const hasDisplayedImage = showCoverImage && imageState === "available";
        const expected = showSummary && !hasText && !hasDisplayedImage;
        const placeholder =
          container.querySelector<HTMLElement>(placeholderSelector);
        expect(container.querySelectorAll(placeholderSelector)).toHaveLength(
          expected ? 1 : 0,
        );
        expect(!!container.querySelector("img")).toBe(hasDisplayedImage);
        if (view === "feed" && hasDisplayedImage) {
          expect(
            container
              .querySelector(".rss-dashboard-feed-content")
              ?.firstElementChild?.classList.contains(
                "rss-dashboard-feed-preview-region",
              ),
          ).toBe(true);
        }
        if (placeholder) {
          expect(placeholder.textContent).toBe("No description");
          expect(placeholder.getAttribute("role")).toBe("note");
          expect(placeholder.closest('[aria-hidden="true"]')).toBeNull();
          if (view === "card") {
            const opener = container.querySelector(
              ".rss-dashboard-card-open-button",
            );
            expect(opener?.getAttribute("aria-describedby")).toBe(
              placeholder.id,
            );
            expect(
              placeholder.closest(".rss-dashboard-card-preview-region"),
            ).not.toBeNull();
            expect(placeholder.tabIndex).toBe(0);
            const bubbledEnter = vi.fn();
            container.addEventListener("keydown", bubbledEnter);
            placeholder.dispatchEvent(
              new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
            );
            expect(bubbledEnter).not.toHaveBeenCalled();
          } else {
            const feedItem = placeholder.closest(".rss-dashboard-feed-item");
            expect(feedItem?.hasAttribute("aria-describedby")).toBe(false);
            expect(feedItem?.hasAttribute("tabindex")).toBe(false);
            expect(placeholder.tabIndex).toBe(-1);
            expect(
              placeholder.parentElement?.classList.contains(
                "rss-dashboard-feed-text-region",
              ),
            ).toBe(true);
            expect(
              placeholder.previousElementSibling?.classList.contains(
                "rss-dashboard-feed-header",
              ),
            ).toBe(true);
          }
        }
        if (showSummary && hasText) {
          expect(container.textContent).toContain("An article preview");
        }
        expect(article).toEqual(snapshot);
        expect(getArticlePreviewSummaryText(article)).toBe(
          hasText ? "An article preview" : "",
        );
        expect(getArticleFilterSummaryText(article)).toBe(
          hasText ? "An article preview" : "",
        );
        expect(
          KeywordFilterService.evaluateRules(
            article,
            [
              {
                id: "placeholder-rule",
                enabled: true,
                type: "include",
                keyword: "No description",
                matchMode: "partial",
                applyToTitle: false,
                applyToSummary: true,
                applyToContent: false,
                createdAt: 1,
              },
            ],
            "AND",
          ),
        ).toBe(false);
      },
    );

    it("does not highlight placeholder text as article content", () => {
      const ctx = baseViewContext();
      ctx.settings.highlights.highlightInSummaries = true;
      ctx.highlightService = new HighlightService({
        ...DEFAULT_SETTINGS.highlights,
        highlightInSummaries: true,
      });
      const highlight = vi.spyOn(ctx.highlightService, "setHighlightedText");
      const article = makeArticle({ description: "" });
      if (view === "card") {
        renderCardView(
          container,
          [article],
          { ...ctx, showCardToolbar: true },
          baseViewDeps(),
        );
      } else {
        renderFeedView(container, [article], ctx, baseViewDeps());
      }
      expect(container.textContent).toContain("No description");
      expect(highlight).not.toHaveBeenCalled();
    });
  });
}

it("leaves list view without a preview or placeholder", () => {
  const container = document.body.createDiv();
  renderListView(
    container,
    [makeArticle({ description: "" })],
    {
      ...baseViewContext(),
      showListToolbar: false,
      listToolbarStyle: "left-grid",
    },
    baseViewDeps(),
  );
  expect(container.textContent).not.toContain("No description");
  expect(container.querySelector('[role="note"]')).toBeNull();
  document.body.empty();
});
