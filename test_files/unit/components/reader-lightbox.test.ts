import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReaderLightbox } from "../../../src/components/reader-lightbox";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

describe("ReaderLightbox", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("mounts to document body when opened and renders toolbar buttons", () => {
    const lightbox = new ReaderLightbox({
      source: {
        previewUrl: "https://example.com/thumb.jpg",
        fullUrl: "https://example.com/full.jpg",
        altText: "A majestic mountain",
        externalHref: "https://nationalgeographic.com/photo-of-the-day",
      },
      doc: document,
    });

    lightbox.open();

    const backdrop = document.body.querySelector(".rss-reader-lightbox-backdrop");
    expect(backdrop).not.toBeNull();

    // Toolbar buttons
    const closeBtn = backdrop?.querySelector(".rss-reader-lightbox-btn-close");
    expect(closeBtn).not.toBeNull();

    const zoomFitBtn = backdrop?.querySelector(".rss-reader-lightbox-btn-zoom-fit");
    expect(zoomFitBtn).not.toBeNull();

    const openImgBtn = backdrop?.querySelector(".rss-reader-lightbox-btn-open-external");
    expect(openImgBtn).not.toBeNull();

    // External link button
    const externalLinkBtn = backdrop?.querySelector(".rss-reader-lightbox-external-link");
    expect(externalLinkBtn).not.toBeNull();
    expect(externalLinkBtn?.textContent).toContain("nationalgeographic.com");

    // Caption
    const caption = backdrop?.querySelector(".rss-reader-lightbox-caption");
    expect(caption?.textContent).toBe("A majestic mountain");

    lightbox.close();
  });

  it("handles image load events by hiding spinner and preview", () => {
    const lightbox = new ReaderLightbox({
      source: {
        previewUrl: "https://example.com/thumb.jpg",
        fullUrl: "https://example.com/full.jpg",
        altText: "",
      },
      doc: document,
    });

    lightbox.open();

    const fullImg = document.body.querySelector<HTMLImageElement>(
      ".rss-reader-lightbox-full-img",
    );
    const previewImg = document.body.querySelector<HTMLImageElement>(
      ".rss-reader-lightbox-preview-img",
    );
    const spinner = document.body.querySelector(
      ".rss-reader-lightbox-spinner",
    );

    expect(fullImg).not.toBeNull();
    expect(previewImg).not.toBeNull();
    expect(spinner?.classList.contains("is-hidden")).toBe(false);

    // Simulate image loaded
    fullImg?.dispatchEvent(new Event("load"));

    expect(fullImg?.classList.contains("is-loaded")).toBe(true);
    expect(previewImg?.classList.contains("is-hidden")).toBe(true);
    expect(spinner?.classList.contains("is-hidden")).toBe(true);

    lightbox.close();
  });

  it("toggles zoom on double-click on stage", () => {
    const lightbox = new ReaderLightbox({
      source: {
        previewUrl: "https://example.com/thumb.jpg",
        fullUrl: "https://example.com/full.jpg",
        altText: "",
      },
      doc: document,
    });

    lightbox.open();

    const stage = document.body.querySelector<HTMLElement>(
      ".rss-reader-lightbox-stage",
    );
    const viewport = document.body.querySelector<HTMLElement>(
      ".rss-reader-lightbox-viewport",
    );

    expect(stage).not.toBeNull();
    expect(viewport?.classList.contains("is-zoomed")).toBe(false);

    // Double click to zoom in
    stage?.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, clientX: 200, clientY: 200 }),
    );
    expect(viewport?.classList.contains("is-zoomed")).toBe(true);
    expect(stage?.style.transform).toContain("scale(2.5)");

    // Double click again to reset zoom
    stage?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(viewport?.classList.contains("is-zoomed")).toBe(false);
    expect(stage?.style.transform).toContain("scale(1)");

    lightbox.close();
  });

  it("closes on Escape key press", () => {
    const lightbox = new ReaderLightbox({
      source: {
        previewUrl: "https://example.com/thumb.jpg",
        fullUrl: "https://example.com/full.jpg",
        altText: "",
      },
      doc: document,
    });

    lightbox.open();
    expect(document.body.querySelector(".rss-reader-lightbox-backdrop")).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    // Closes and schedules removal
    const backdrop = document.body.querySelector(".rss-reader-lightbox-backdrop");
    expect(backdrop?.classList.contains("is-open")).toBe(false);
  });

  it("opens external webpage in new window on clicking external link button", () => {
    const windowOpenMock = vi.fn();
    window.open = windowOpenMock;

    const lightbox = new ReaderLightbox({
      source: {
        previewUrl: "https://example.com/thumb.jpg",
        fullUrl: "https://example.com/full.jpg",
        altText: "",
        externalHref: "https://example.org/article",
      },
      doc: document,
    });

    lightbox.open();

    const linkBtn = document.body.querySelector<HTMLButtonElement>(
      ".rss-reader-lightbox-external-link",
    );
    linkBtn?.click();

    expect(windowOpenMock).toHaveBeenCalledWith(
      "https://example.org/article",
      "_blank",
      "noopener,noreferrer",
    );

    lightbox.close();
  });
});
