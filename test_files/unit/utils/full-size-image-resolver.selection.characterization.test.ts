import { beforeEach, describe, expect, it } from "vitest";
import { resolveFullResolutionImageSource } from "../../../src/utils/full-size-image-resolver";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

describe("resolveFullResolutionImageSource selection behavior", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.replaceChildren();
  });

  it("keeps an image anchor ahead of srcset and lazy-loading candidates", () => {
    const anchor = createEl("a", {
      attr: { href: "https://images.example/full.jpg" },
    });
    const img = anchor.createEl("img", {
      attr: {
        src: "https://images.example/preview.jpg",
        srcset: "https://images.example/large.jpg 1600w",
        "data-original": "https://images.example/original.jpg",
      },
    });

    expect(resolveFullResolutionImageSource(img).fullUrl).toBe(
      "https://images.example/full.jpg",
    );
  });

  it("keeps an external page link while selecting the largest srcset image", () => {
    const anchor = createEl("a", {
      attr: { href: "https://news.example/article" },
    });
    const img = anchor.createEl("img", {
      attr: {
        src: "https://images.example/preview.jpg",
        srcset:
          "https://images.example/small.jpg 400w, https://images.example/large.jpg 1600w",
        "data-original": "https://images.example/original.jpg",
      },
    });

    expect(resolveFullResolutionImageSource(img)).toMatchObject({
      fullUrl: "https://images.example/large.jpg",
      externalHref: "https://news.example/article",
    });
  });

  it("uses the first available lazy-loading attribute before the image src", () => {
    const img = createEl("img", {
      attr: {
        src: "https://images.example/preview.jpg",
        "data-original": " https://images.example/original.jpg ",
        "data-full-url": "https://images.example/full.jpg",
      },
    });

    expect(resolveFullResolutionImageSource(img).fullUrl).toBe(
      "https://images.example/original.jpg",
    );
  });

  it("falls back to the image src when no higher-resolution candidate exists", () => {
    const img = createEl("img", {
      attr: { src: "https://images.example/preview.jpg?width=320" },
    });

    expect(resolveFullResolutionImageSource(img).fullUrl).toBe(
      "https://images.example/preview.jpg",
    );
  });
});
