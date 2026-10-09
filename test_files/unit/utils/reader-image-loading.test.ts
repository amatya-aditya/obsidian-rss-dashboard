import { afterEach, describe, expect, it } from "vitest";
import {
  applyReaderImageLoading,
  applyReaderImageLoadingToAll,
} from "../../../src/utils/reader-image-loading";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

function makeImage(attrs: Record<string, string> = {}): HTMLImageElement {
  const img = createEl("img", {
    attr: { src: "https://img.example.com/photo.jpg" },
  });
  for (const [key, value] of Object.entries(attrs)) {
    img.setAttribute(key, value);
  }
  document.body.appendChild(img);
  return img;
}

/** jsdom has no image decoder, so a cached image is simulated via `complete`. */
function markAlreadyLoaded(img: HTMLImageElement): void {
  Object.defineProperty(img, "complete", { value: true });
}

describe("applyReaderImageLoading", () => {
  afterEach(() => {
    document.body.empty();
  });

  // AC1
  it("defers off-screen images and decodes them without blocking the page", () => {
    const img = makeImage();

    applyReaderImageLoading(img);

    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  // AC2
  it("marks a pending image as loading and reveals it once it loads", () => {
    const img = makeImage();

    applyReaderImageLoading(img);
    expect(img.classList.contains("rss-reader-lazy-img")).toBe(true);
    expect(img.classList.contains("is-loading")).toBe(true);

    img.dispatchEvent(new Event("load"));
    expect(img.classList.contains("is-loading")).toBe(false);
    expect(img.classList.contains("is-revealed")).toBe(true);
  });

  // AC2
  it("never hides an image that failed to load", () => {
    const img = makeImage();

    applyReaderImageLoading(img);
    img.dispatchEvent(new Event("error"));

    expect(img.classList.contains("is-loading")).toBe(false);
    expect(img.classList.contains("is-revealed")).toBe(true);
  });

  // AC2
  it("does not hide an image the browser already has cached", () => {
    const img = makeImage();
    markAlreadyLoaded(img);

    applyReaderImageLoading(img);

    expect(img.classList.contains("is-loading")).toBe(false);
  });

  // AC3
  it("reserves the image's aspect ratio while it loads when dimensions are known", () => {
    const img = makeImage({ width: "1200", height: "800" });

    applyReaderImageLoading(img);

    expect(img.style.getPropertyValue("--rss-img-ratio")).toBe("1200 / 800");
    expect(img.style.getPropertyValue("--rss-img-width")).toBe("1200px");
    img.dispatchEvent(new Event("load"));
    expect(img.style.getPropertyValue("--rss-img-ratio")).toBe("");
    expect(img.style.getPropertyValue("--rss-img-width")).toBe("");
  });

  // AC3
  it.each([
    ["no dimensions", {}],
    ["only a width", { width: "600" }],
    ["percentage dimensions", { width: "100%", height: "50%" }],
    ["zero dimensions", { width: "0", height: "0" }],
  ])("reserves no space for an image with %s", (_label, attrs) => {
    const img = makeImage(attrs);

    applyReaderImageLoading(img);

    expect(img.style.getPropertyValue("--rss-img-ratio")).toBe("");
    expect(img.style.getPropertyValue("--rss-img-width")).toBe("");
  });

  // AC4
  it("leaves rendered LaTeX formula images untouched", () => {
    const img = makeImage({
      src: "https://example.com/latex.php?latex=x%5E2",
    });

    applyReaderImageLoading(img);

    expect(img.hasAttribute("loading")).toBe(false);
    expect(img.classList.contains("rss-reader-lazy-img")).toBe(false);
    expect(img.classList.contains("is-loading")).toBe(false);
  });

  // AC5
  it("keeps the hero image eager because it is above the fold", () => {
    const hero = createDiv({ cls: "rss-reader-cover-image" });
    const img = hero.createEl("img", { attr: { src: "https://x/hero.jpg" } });
    document.body.appendChild(hero);

    applyReaderImageLoading(img);

    expect(img.hasAttribute("loading")).toBe(false);
    expect(img.classList.contains("is-loading")).toBe(false);
  });

  // AC6
  it("is safe to apply twice to the same image", () => {
    const img = makeImage({ width: "10", height: "10" });

    applyReaderImageLoading(img);
    applyReaderImageLoading(img);
    img.dispatchEvent(new Event("load"));

    expect(img.classList.contains("is-loading")).toBe(false);
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  // AC6
  it("does not override an eager loading hint the author set explicitly", () => {
    const img = makeImage({ loading: "eager" });

    applyReaderImageLoading(img);

    expect(img.getAttribute("loading")).toBe("eager");
  });
});

describe("applyReaderImageLoadingToAll", () => {
  afterEach(() => {
    document.body.empty();
  });

  it("applies loading behavior to every image inside a container", () => {
    const container = createDiv();
    container.createEl("img", { attr: { src: "https://x/a.jpg" } });
    container.createEl("img", { attr: { src: "https://x/b.jpg" } });
    document.body.appendChild(container);

    applyReaderImageLoadingToAll(container);

    const images = Array.from(container.querySelectorAll("img"));
    expect(images).toHaveLength(2);
    expect(images.every((i) => i.getAttribute("loading") === "lazy")).toBe(
      true,
    );
  });
});
