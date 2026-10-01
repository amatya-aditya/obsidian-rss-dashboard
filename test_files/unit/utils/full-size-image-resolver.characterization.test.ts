import { beforeEach, describe, expect, it } from "vitest";
import {
  resolveFullResolutionImageSource,
  stripCdnResizeParameters,
} from "../../../src/utils/full-size-image-resolver";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

describe("stripCdnResizeParameters host handling", () => {
  describe("Cloudinary images", () => {
    it.each([
      "https://res.cloudinary.com",
      "https://cloudinary.com",
      "http://res.cloudinary.com",
      "https://res.cloudinary.com:8443",
    ])("removes the transform segment on %s", (origin) => {
      expect(
        stripCdnResizeParameters(
          `${origin}/demo/image/upload/w_300,c_scale/v1/pic.jpg?x=1#f`,
        ),
      ).toBe(`${origin}/demo/image/upload/v1/pic.jpg?x=1#f`);
    });

    it("leaves the path alone when there is no upload segment", () => {
      const url =
        "https://res.cloudinary.com/demo/image/fetch/w_300,c_scale/pic.jpg";
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("recognises an uppercase host because the URL parser lowercases it", () => {
      expect(
        stripCdnResizeParameters(
          "https://RES.CLOUDINARY.COM/demo/image/upload/w_300,c_scale/v1/pic.jpg",
        ),
      ).toBe("https://res.cloudinary.com/demo/image/upload/v1/pic.jpg");
    });

    it("leaves a host that contains the domain as a prefix untouched", () => {
      const url =
        "https://cloudinary.com.example.net/i/upload/w_300,c_scale/v1/p.jpg";
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("leaves a host that ends with the domain preceded by other text untouched", () => {
      const url = "https://xcloudinary.com/i/upload/w_300,c_scale/v1/p.jpg";
      expect(stripCdnResizeParameters(url)).toBe(url);
    });
  });

  describe("NPR and Brightspot images", () => {
    it.each([
      "https://media.npr.org",
      "http://media.npr.org",
      "https://npr.brightspotcdn.com",
      "https://brightspotcdn.com",
      "https://media.npr.org:8443",
    ])("removes the resize segment on %s", (origin) => {
      expect(
        stripCdnResizeParameters(`${origin}/a/resize/1200x800!/pic.jpg?x=1#f`),
      ).toBe(`${origin}/a/pic.jpg?x=1#f`);
    });

    it("recognises an uppercase host because the URL parser lowercases it", () => {
      expect(
        stripCdnResizeParameters(
          "https://MEDIA.NPR.ORG/a/resize/1200x800/pic.jpg",
        ),
      ).toBe("https://media.npr.org/a/pic.jpg");
    });

    it("leaves a host that contains the domain as a prefix untouched", () => {
      const url = "https://media.npr.org.example.net/a/resize/1200x800/p.jpg";
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("leaves a host that ends with the domain preceded by other text untouched", () => {
      const url = "https://xbrightspotcdn.com/a/resize/1200x800/p.jpg";
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("leaves an unrelated host's resize path alone", () => {
      const url = "https://example.com/a/resize/1200x800/p.jpg";
      expect(stripCdnResizeParameters(url)).toBe(url);
    });
  });

  describe("Substack CDN images", () => {
    const target = "https%3A%2F%2Fexample.com%2Fimage%2F123";
    const decoded = "https://example.com/image/123";

    it.each([
      `https://substackcdn.com/image/fetch/w_1456,c_limit/${target}`,
      `http://substackcdn.com/image/fetch/w_1456,c_limit/${target}`,
      `https://www.substackcdn.com/image/fetch/w_1456,c_limit/${target}`,
    ])("unwraps the original address from %s", (url) => {
      expect(stripCdnResizeParameters(url)).toBe(decoded);
    });

    it("unwraps a protocol-relative address", () => {
      expect(
        stripCdnResizeParameters(
          `//substackcdn.com/image/fetch/w_1456,c_limit/${target}`,
        ),
      ).toBe(decoded);
    });

    it("leaves a protocol-relative look-alike host untouched", () => {
      const url = `//example.net/?u=substackcdn.com/image/fetch/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("leaves an unrelated host's fetch path alone", () => {
      const url = `https://example.com/image/fetch/w_1456,c_limit/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("leaves the Substack host without the fetch path alone", () => {
      const url = `https://substackcdn.com/other/w_1456,c_limit/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("leaves a host that contains the domain as a prefix untouched", () => {
      const url = `https://substackcdn.com.example.net/image/fetch/w_1,c_limit/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("unwraps an uppercase host", () => {
      const url = `https://SUBSTACKCDN.COM/image/fetch/w_1456,c_limit/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(decoded);
    });

    it("unwraps an address with an explicit port", () => {
      const url = `https://substackcdn.com:8443/image/fetch/w_1456,c_limit/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(decoded);
    });

    it("leaves a host that ends with the domain preceded by other text untouched", () => {
      const url = `https://xsubstackcdn.com/image/fetch/w_1,c_limit/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("leaves a URL whose query merely mentions the domain and path untouched", () => {
      const url = `https://example.net/?u=substackcdn.com/image/fetch/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(url);
    });

    it("leaves a URL whose path holds the domain and fetch path untouched", () => {
      const url = `https://example.net/substackcdn.com/image/fetch/${target}`;
      expect(stripCdnResizeParameters(url)).toBe(url);
    });
  });
});

describe("resolveFullResolutionImageSource Substack anchors", () => {
  const target = "https%3A%2F%2Fexample.com%2Fimage%2F123";
  const decoded = "https://example.com/image/123";
  const thumb = "https://example.com/thumb.jpg";

  beforeEach(() => {
    installObsidianDomPolyfills();
    document.body.replaceChildren();
  });

  function resolve(href: string) {
    const anchor = createEl("a", { attr: { href } });
    const img = anchor.createEl("img", { attr: { src: thumb } });
    document.body.replaceChildren(anchor);
    return resolveFullResolutionImageSource(img);
  }

  it.each([
    `https://substackcdn.com/image/fetch/w_1456,c_limit/${target}`,
    `https://www.substackcdn.com/image/fetch/w_1456,c_limit/${target}`,
  ])("uses the anchor %s as the image address", (href) => {
    const resolved = resolve(href);
    expect(resolved.fullUrl).toBe(decoded);
    expect(resolved.externalHref).toBeUndefined();
  });

  it("treats an unrelated https anchor as an external link", () => {
    const resolved = resolve("https://example.com/article");
    expect(resolved.fullUrl).toBe(thumb);
    expect(resolved.externalHref).toBe("https://example.com/article");
  });

  it("treats an anchor whose query merely mentions the domain and path as an external link", () => {
    const href = `https://example.net/?u=substackcdn.com/image/fetch/${target}`;
    const resolved = resolve(href);
    expect(resolved.fullUrl).toBe(thumb);
    expect(resolved.externalHref).toBe(href);
  });
});
