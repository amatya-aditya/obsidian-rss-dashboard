import { beforeEach, describe, expect, it } from "vitest";
import {
  extractHighestResolutionFromSrcset,
  isLightboxEligibleImage,
  resolveFullResolutionImageSource,
  stripCdnResizeParameters,
} from "../../../src/utils/full-size-image-resolver";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

describe("full-size-image-resolver", () => {
  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.replaceChildren();
  });

  describe("isLightboxEligibleImage", () => {
    it("returns false for null or undefined", () => {
      expect(isLightboxEligibleImage(null)).toBe(false);
      expect(isLightboxEligibleImage(undefined)).toBe(false);
    });

    it("returns false for LaTeX formula images", () => {
      const img = createEl("img", {
        cls: "alignnone latex size-full",
        attr: { src: "https://example.com/formula.png" },
      });
      expect(isLightboxEligibleImage(img)).toBe(false);
    });

    it("returns false for tracking pixels and transparent spacers", () => {
      const trackingImg = createEl("img", {
        attr: {
          src: "data:image/gif;base64,R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
        },
      });
      expect(isLightboxEligibleImage(trackingImg)).toBe(false);

      const tinyImg = createEl("img", {
        attr: {
          width: "1",
          height: "1",
          src: "https://tracker.example.com/pixel.gif",
        },
      });
      expect(isLightboxEligibleImage(tinyImg)).toBe(false);
    });

    it("returns false for UI and feed icons", () => {
      const icon = createEl("img", {
        cls: "rss-feed-icon",
        attr: { src: "https://example.com/favicon.ico" },
      });
      expect(isLightboxEligibleImage(icon)).toBe(false);
    });

    it("returns true for standard article images", () => {
      const img = createEl("img", {
        attr: {
          src: "https://example.com/photo.jpg",
          alt: "Beautiful scenery",
        },
      });
      expect(isLightboxEligibleImage(img)).toBe(true);
    });
  });

  describe("extractHighestResolutionFromSrcset", () => {
    it("returns null for empty or null srcset", () => {
      expect(extractHighestResolutionFromSrcset(null)).toBe(null);
      expect(extractHighestResolutionFromSrcset("")).toBe(null);
    });

    it("extracts the highest width descriptor", () => {
      const srcset =
        "https://example.com/img-300.jpg 300w, https://example.com/img-1200.jpg 1200w, https://example.com/img-600.jpg 600w";
      expect(extractHighestResolutionFromSrcset(srcset)).toBe(
        "https://example.com/img-1200.jpg",
      );
    });

    it("extracts the highest pixel density descriptor", () => {
      const srcset =
        "https://example.com/img-1x.jpg 1x, https://example.com/img-3x.jpg 3x, https://example.com/img-2x.jpg 2x";
      expect(extractHighestResolutionFromSrcset(srcset)).toBe(
        "https://example.com/img-3x.jpg",
      );
    });
  });

  describe("stripCdnResizeParameters", () => {
    it("normalizes Substack CDN fetch URLs to original unconstrained asset", () => {
      const substack =
        "https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fexample.com%2Foriginal-photo.jpg";
      expect(stripCdnResizeParameters(substack)).toBe(
        "https://example.com/original-photo.jpg",
      );
    });

    it("strips WordPress Photon sizing parameters", () => {
      const photon = "https://i0.wp.com/example.com/photo.jpg?w=600&h=400&crop=1";
      expect(stripCdnResizeParameters(photon)).toBe(
        "https://i0.wp.com/example.com/photo.jpg",
      );
    });

    it("strips Cloudinary upload resizing path segments", () => {
      const cloudinary =
        "https://res.cloudinary.com/demo/image/upload/w_300,c_scale/sample.jpg";
      expect(stripCdnResizeParameters(cloudinary)).toBe(
        "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      );
    });

    it("strips Brightspot resize paths", () => {
      const brightspot =
        "https://media.npr.brightspotcdn.com/dims4/default/resize/600x!/photo.jpg";
      expect(stripCdnResizeParameters(brightspot)).toBe(
        "https://media.npr.brightspotcdn.com/dims4/default/photo.jpg",
      );
    });

    it("strips generic width/resize query parameters", () => {
      const generic = "https://example.com/image.png?width=800&maxwidth=1200&resize=800x600";
      expect(stripCdnResizeParameters(generic)).toBe("https://example.com/image.png");
    });
  });

  describe("resolveFullResolutionImageSource", () => {
    it("prioritizes anchor href when pointing directly to an image asset", () => {
      const container = createDiv();
      const anchor = container.createEl("a", {
        attr: { href: "https://example.com/fullsize-original.jpg" },
      });
      const img = anchor.createEl("img", {
        attr: {
          src: "https://example.com/thumbnail-300.jpg",
          alt: "Test image",
        },
      });
      const result = resolveFullResolutionImageSource(img);

      expect(result.previewUrl).toBe("https://example.com/thumbnail-300.jpg");
      expect(result.fullUrl).toBe("https://example.com/fullsize-original.jpg");
      expect(result.altText).toBe("Test image");
      expect(result.externalHref).toBeUndefined();
    });

    it("captures externalHref when anchor href is a webpage rather than an image", () => {
      const container = createDiv();
      const anchor = container.createEl("a", {
        attr: { href: "https://nytimes.com/article-source" },
      });
      const img = anchor.createEl("img", {
        attr: {
          src: "https://example.com/scenery.jpg?w=500",
          alt: "Scenery",
        },
      });
      const result = resolveFullResolutionImageSource(img);

      expect(result.previewUrl).toBe("https://example.com/scenery.jpg?w=500");
      expect(result.fullUrl).toBe("https://example.com/scenery.jpg");
      expect(result.externalHref).toBe("https://nytimes.com/article-source");
    });

    it("resolves from srcset when no image anchor link exists", () => {
      const img = createEl("img", {
        attr: {
          src: "https://example.com/thumb.jpg",
          srcset: "https://example.com/small.jpg 400w, https://example.com/large.jpg 1600w",
        },
      });
      const result = resolveFullResolutionImageSource(img);

      expect(result.fullUrl).toBe("https://example.com/large.jpg");
    });

    it("resolves from data-full-url or data-original if present", () => {
      const img = createEl("img", {
        attr: {
          src: "https://example.com/placeholder.jpg",
          "data-full-url": "https://example.com/hires-version.jpg",
        },
      });
      const result = resolveFullResolutionImageSource(img);

      expect(result.fullUrl).toBe("https://example.com/hires-version.jpg");
    });
  });
});
