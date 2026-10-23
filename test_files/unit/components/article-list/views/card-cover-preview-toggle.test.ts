import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderCardView } from "../../../../../src/components/article-list/views/card-view";
import { baseViewContext, baseViewDeps, makeArticle } from "./test-helpers";

function stubHover(hover: "none" | "hover"): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({ matches: query === `(hover: ${hover})` }) as MediaQueryList,
  );
}

describe("card cover Preview toggle (#1530)", () => {
  let container: HTMLElement;
  const onArticleClick = vi.fn();

  const render = () => {
    container.empty();
    const ctx = baseViewContext();
    renderCardView(
      container,
      [
        makeArticle({
          coverImage: "https://example.com/cover.jpg",
          summary: "A summary worth previewing",
        }),
      ],
      {
        ...ctx,
        callbacks: { ...ctx.callbacks, onArticleClick },
        showCardToolbar: false,
      },
      baseViewDeps(),
    );
    return {
      cover: container.querySelector<HTMLElement>(
        ".rss-dashboard-cover-container",
      )!,
      overlay: container.querySelector<HTMLElement>(
        ".rss-dashboard-summary-overlay",
      )!,
      image: container.querySelector<HTMLElement>(
        ".rss-dashboard-cover-image",
      )!,
    };
  };

  beforeEach(() => {
    container = createDiv();
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = "";
    onArticleClick.mockReset();
    vi.restoreAllMocks();
  });

  it("keeps the Preview a keyboard stop, so focus can reveal it", () => {
    stubHover("hover");
    const { overlay } = render();

    expect(overlay.getAttribute("tabindex")).toBe("0");
    overlay.focus();
    expect(document.activeElement).toBe(overlay);
  });

  describe("on a no-hover device", () => {
    beforeEach(() => stubHover("none"));

    it("starts with the Preview hidden, including after a rebuild", () => {
      const first = render();
      first.image.click();
      expect(first.cover.classList.contains("is-previewing")).toBe(true);

      const rebuilt = render();
      expect(rebuilt.cover.classList.contains("is-previewing")).toBe(false);
    });

    it("reveals the Preview on a tap without opening the article", () => {
      const { cover, image } = render();

      image.click();

      expect(cover.classList.contains("is-previewing")).toBe(true);
      expect(onArticleClick).not.toHaveBeenCalled();
    });

    it("hides the Preview and clears its focus on the second tap", () => {
      const { cover, overlay, image } = render();
      image.click();
      overlay.focus();
      expect(document.activeElement).toBe(overlay);

      overlay.click();

      expect(cover.classList.contains("is-previewing")).toBe(false);
      expect(document.activeElement).not.toBe(overlay);
      expect(onArticleClick).not.toHaveBeenCalled();
    });

    it("still opens the article from a tap outside the cover", () => {
      render();

      container
        .querySelector<HTMLElement>(".rss-dashboard-article-card")!
        .click();

      expect(onArticleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("on a hover-capable device", () => {
    beforeEach(() => stubHover("hover"));

    it("opens the article from a click on the image and leaves the reveal to hover", () => {
      const { cover, image } = render();

      image.click();

      expect(onArticleClick).toHaveBeenCalledTimes(1);
      expect(cover.classList.contains("is-previewing")).toBe(false);
    });
  });
});
