import { afterEach, describe, expect, it, vi } from "vitest";
import { extractCoverImage } from "../../../../src/services/feed-parser/feed-cover-image.js";

const BASE = "https://example.com/rss/feed.xml";
const REAL = "https://img.example.com/real.jpg";
const PIXEL = "https://t.example.com/pixel.gif";

/** A resolver that records its calls, like the one `FeedParser` passes in. */
function makeResolver() {
  return vi.fn((relativeUrl: string, baseUrl: string) =>
    new URL(relativeUrl, baseUrl).href,
  );
}

function extract(html: string, baseUrl = BASE) {
  const resolver = makeResolver();
  return { cover: extractCoverImage(html, baseUrl, resolver), resolver };
}

describe("extractCoverImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("input", () => {
    it("returns an empty string for empty html without parsing it", () => {
      const parseSpy = vi.spyOn(DOMParser.prototype, "parseFromString");

      const { cover, resolver } = extract("");

      expect(cover).toBe("");
      expect(parseSpy).not.toHaveBeenCalled();
      expect(resolver).not.toHaveBeenCalled();
    });

    it("returns an empty string for html with no image", () => {
      expect(extract("<p>Words</p>").cover).toBe("");
    });

    it("returns an empty string when the html cannot be parsed", () => {
      vi.spyOn(DOMParser.prototype, "parseFromString").mockImplementation(() => {
        throw new Error("parse failure");
      });

      expect(extract(`<img src="${REAL}">`).cover).toBe("");
    });

    it("returns an empty string when the resolver throws", () => {
      const resolver = vi.fn(() => {
        throw new Error("bad url");
      });

      expect(extractCoverImage('<img src="/a.png">', BASE, resolver)).toBe("");
    });
  });

  describe("og:image", () => {
    function og(content: string): string {
      return `<meta property="og:image" content="${content}">`;
    }

    it("returns an absolute url without calling the resolver", () => {
      const { cover, resolver } = extract(og("https://img.example.com/og.jpg"));

      expect(cover).toBe("https://img.example.com/og.jpg");
      expect(resolver).not.toHaveBeenCalled();
    });

    it("passes a relative url and the base url to the resolver", () => {
      const { cover, resolver } = extract(og("/og/a.png"));

      expect(cover).toBe("https://example.com/og/a.png");
      expect(resolver).toHaveBeenCalledWith("/og/a.png", BASE);
    });

    it("resolves a relative filename that starts with http", () => {
      const { cover, resolver } = extract(og("http-banner.jpg"));

      expect(cover).toBe("https://example.com/rss/http-banner.jpg");
      expect(resolver).toHaveBeenCalledWith("http-banner.jpg", BASE);
    });

    it("wins over an image in the document", () => {
      expect(extract(`<img src="${REAL}">${og("https://img.example.com/og.jpg")}`).cover).toBe(
        "https://img.example.com/og.jpg",
      );
    });

    it("shrinks a supported CDN image", () => {
      expect(
        extract(og("https://res.cloudinary.com/demo/image/upload/s.jpg")).cover,
      ).toBe("https://res.cloudinary.com/demo/image/upload/w_600,c_scale/s.jpg");
    });

    it("falls through to the images when the content is empty", () => {
      expect(extract(`${og("")}<img src="${REAL}">`).cover).toBe(REAL);
    });

    it("falls through to the images when it is a formula image", () => {
      expect(
        extract(`${og("https://s0.wp.com/latex.php?latex=x")}<img src="${REAL}">`).cover,
      ).toBe(REAL);
    });

    it("falls through to the images when a relative url has no base url to resolve against", () => {
      const { cover, resolver } = extract(`${og("og/a.png")}<img src="${REAL}">`, "");

      expect(cover).toBe(REAL);
      expect(resolver).not.toHaveBeenCalled();
    });

    it("skips a data: URI and tries the images", () => {
      expect(extract(`${og("data:image/png;base64,AAAA")}<img src="${REAL}">`).cover).toBe(
        REAL,
      );
    });

    it("returns no cover when the only og:image is a data: URI", () => {
      expect(extract(og("data:image/png;base64,AAAA")).cover).toBe("");
    });

    it("logs a double-encoded url", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      extract(og("https://img.example.com/a%2520b.jpg"));

      expect(debugSpy).toHaveBeenCalledWith(
        "[RSS Dashboard] extractCoverImage: og:image contains double-encoded: https://img.example.com/a%2520b.jpg",
      );
    });
  });

  describe("first image", () => {
    it.each([
      ["an absolute url", "https://img.example.com/photo", "https://img.example.com/photo"],
      ["a url with no image extension", "https://example.com/photo", "https://example.com/photo"],
      ["a relative path", "pics/a.png", "https://example.com/rss/pics/a.png"],
      ["a root-relative path", "/pics/a.png", "https://example.com/pics/a.png"],
      ["a protocol-relative url", "//cdn.example.com/a.png", "https://cdn.example.com/a.png"],
    ])("takes %s", (_label, src, expected) => {
      expect(extract(`<img src="${src}"><img src="${REAL}">`).cover).toBe(expected);
    });

    it("does not call the resolver for an absolute src and passes a relative one with the base url", () => {
      const absolute = extract(`<img src="${REAL}">`);
      const relative = extract('<img src="pics/a.png">');

      expect(absolute.resolver).not.toHaveBeenCalled();
      expect(relative.resolver).toHaveBeenCalledWith("pics/a.png", BASE);
    });

    it("shrinks a supported CDN image, absolute or resolved", () => {
      const shrunk = "https://res.cloudinary.com/demo/image/upload/w_600,c_scale/s.jpg";

      expect(extract('<img src="https://res.cloudinary.com/demo/image/upload/s.jpg">').cover).toBe(shrunk);
      expect(extract('<img src="//res.cloudinary.com/demo/image/upload/s.jpg">').cover).toBe(shrunk);
    });

    it("skips formula images", () => {
      expect(
        extract(`<img class="latex" src="https://img.example.com/f.png"><img src="${REAL}">`).cover,
      ).toBe(REAL);
      expect(
        extract(`<img src="https://s0.wp.com/latex.php?latex=x"><img src="${REAL}">`).cover,
      ).toBe(REAL);
    });

    it("finds no cover when every image is a formula", () => {
      expect(extract('<img class="latex" src="https://img.example.com/f.png">').cover).toBe("");
    });

    it.each([
      ["an empty src", ""],
      ["a blank src", "  "],
      ["undefined", "undefined"],
      ["null", "null"],
      ["a hash", "#"],
      ["about:blank", "about:blank"],
    ])("skips %s for the next image", (_label, src) => {
      expect(extract(`<img src="${src}"><img src="${REAL}">`).cover).toBe(REAL);
    });

    it("skips an image with no src attribute for the next image", () => {
      expect(extract(`<img alt="x"><img src="${REAL}">`).cover).toBe(REAL);
    });

    it.each([
      "tracking/a.png",
      "pixel.gif",
      "beacon.png",
      "1x1.png",
      "track/a.png",
      "rss-pixel.png",
    ])("skips a src that contains a tracking pattern: %s", (name) => {
      expect(
        extract(`<img src="https://t.example.com/${name}"><img src="${REAL}">`).cover,
      ).toBe(REAL);
    });

    it("does not call a near miss a tracking pixel", () => {
      expect(extract(`<img src="https://t.example.com/pixel.png"><img src="${REAL}">`).cover).toBe(
        "https://t.example.com/pixel.png",
      );
    });

    it("takes a relative src when there is no base url only if it is absolute", () => {
      const { cover, resolver } = extract(`<img src="a.png"><img src="${REAL}">`, "");

      expect(cover).toBe(REAL);
      expect(resolver).not.toHaveBeenCalled();
    });

    it("skips a data: URI and tries later images", () => {
      expect(extract(`<img src="data:image/gif;base64,AAAA"><img src="${REAL}">`).cover).toBe(
        REAL,
      );
    });

    it("logs a double-encoded src", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      extract('<img src="/a%2520b.png">');

      expect(debugSpy).toHaveBeenCalledWith(
        "[RSS Dashboard] extractCoverImage: first img src contains double-encoded: /a%2520b.png",
      );
    });
  });

  describe("scan after a skipped first image", () => {
    function afterPixel(...images: string[]): string {
      return `<img src="${PIXEL}">${images.map((src) => `<img src="${src}">`).join("")}`;
    }

    it.each([
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
    ])("accepts an absolute src ending in %s", (extension) => {
      const src = `https://img.example.com/a${extension}`;

      expect(extract(afterPixel(src)).cover).toBe(src);
    });

    it.each([
      "https://img.example.com/image/12345",
      "https://images.example.com/a",
    ])("accepts an absolute src that contains image: %s", (src) => {
      expect(extract(afterPixel(src)).cover).toBe(src);
    });

    it.each([
      "https://img.example.com/A.JPG",
      "https://img.example.com/a.jpg?w=1",
      "https://img.example.com/a.svg",
      "https://img.example.com/photo",
    ])("rejects an absolute src that is not image-like: %s", (src) => {
      expect(extract(afterPixel(src)).cover).toBe("");
    });

    it.each([
      ["pics/a.webp", "https://example.com/rss/pics/a.webp"],
      ["/images/a", "https://example.com/images/a"],
      ["../a.png", "https://example.com/a.png"],
      ["//cdn.example.com/a.png", "https://cdn.example.com/a.png"],
    ])("resolves the relative src %s against the base url", (src, expected) => {
      const { cover, resolver } = extract(afterPixel(src));

      expect(cover).toBe(expected);
      expect(resolver).toHaveBeenCalledWith(src, BASE);
    });

    it("rejects a relative src that is not image-like", () => {
      expect(extract(afterPixel("/a")).cover).toBe("");
    });

    it("accepts only an absolute src when there is no base url", () => {
      const { cover, resolver } = extract(afterPixel("/a.png", REAL), "");

      expect(cover).toBe(REAL);
      expect(resolver).not.toHaveBeenCalled();
    });

    it("keeps an absolute src exactly as written and normalizes only a resolved one", () => {
      expect(extract(afterPixel("https://img.example.com/a%2520b.png")).cover).toBe(
        "https://img.example.com/a%2520b.png",
      );
    });

    it("skips later tracking pixels, junk and formula images, then takes the first qualifying image", () => {
      const html = afterPixel(
        "https://t.example.com/tracking/b.png",
        "#",
        "https://s0.wp.com/latex.php?latex=z.png",
        "https://img.example.com/photo",
        REAL,
        "https://img.example.com/second.jpg",
      );

      expect(extract(html).cover).toBe(REAL);
    });

    it("shrinks a supported CDN image", () => {
      expect(
        extract(afterPixel("https://res.cloudinary.com/demo/image/upload/s.jpg")).cover,
      ).toBe("https://res.cloudinary.com/demo/image/upload/w_600,c_scale/s.jpg");
    });

    it("logs a double-encoded src for the first image and again for the scan", () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const src = "https://t.example.com/tracking/%2520a.gif";

      extract(`<img src="${src}"><img src="${REAL}">`);

      expect(debugSpy.mock.calls.map((args) => args[0])).toEqual([
        `[RSS Dashboard] extractCoverImage: first img src contains double-encoded: ${src}`,
        `[RSS Dashboard] extractCoverImage: img src contains double-encoded: ${src}`,
      ]);
    });
  });
});
