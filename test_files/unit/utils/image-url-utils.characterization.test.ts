import { describe, expect, it } from "vitest";
import { optimizeImageUrl } from "../../../src/utils/image-url-utils";

describe("optimizeImageUrl host handling", () => {
  describe("NPR and Brightspot images", () => {
    it.each([
      "https://media.npr.org/assets/img/2024/01/01/pic.jpg",
      "http://media.npr.org/assets/img/2024/01/01/pic.jpg",
      "https://media.npr.org:8443/assets/img/2024/01/01/pic.jpg",
    ])("rewrites the resize segment of %s", (url) => {
      const input = url.replace("/pic.jpg", "/resize/1200x800/pic.jpg");
      expect(optimizeImageUrl(input, 300)).toBe(
        url.replace("/pic.jpg", "/resize/300x/pic.jpg"),
      );
    });

    it("rewrites Brightspot CDN images on a subdomain", () => {
      expect(
        optimizeImageUrl(
          "https://npr.brightspotcdn.com/dims4/default/resize/1200x800!/pic.jpg",
          300,
        ),
      ).toBe("https://npr.brightspotcdn.com/dims4/default/resize/300x/pic.jpg");
    });

    it("keeps the query string and fragment while rewriting the path", () => {
      expect(
        optimizeImageUrl(
          "https://media.npr.org/a/resize/900x600/pic.jpg?q=1#frag",
          300,
        ),
      ).toBe("https://media.npr.org/a/resize/300x/pic.jpg?q=1#frag");
    });

    it("rewrites a protocol-relative NPR image URL", () => {
      expect(
        optimizeImageUrl("//media.npr.org/a/resize/900x600/pic.jpg", 300),
      ).toBe("//media.npr.org/a/resize/300x/pic.jpg");
    });

    it("leaves an unrelated host untouched", () => {
      const url = "https://example.com/a/resize/900x600/pic.jpg";
      expect(optimizeImageUrl(url, 300)).toBe(url);
    });

    it("does not rewrite an uppercase host", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      const url = "https://MEDIA.NPR.ORG/a/resize/900x600/pic.jpg";
      expect(optimizeImageUrl(url, 300)).toBe(url);
    });

    it("rewrites a host that contains the domain as a prefix", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        optimizeImageUrl(
          "https://media.npr.org.example.net/resize/900x600/p.jpg",
          300,
        ),
      ).toBe("https://media.npr.org.example.net/resize/300x/p.jpg");
    });

    it("rewrites a URL whose query merely mentions the domain", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        optimizeImageUrl(
          "https://example.net/resize/900x600/p.jpg?u=media.npr.org",
          300,
        ),
      ).toBe("https://example.net/resize/300x/p.jpg?u=media.npr.org");
    });
  });

  describe("WordPress Photon images", () => {
    it.each(["i0.wp.com", "i1.wp.com", "i2.wp.com"])(
      "sets the width and drops the height on %s",
      (host) => {
        expect(
          optimizeImageUrl(
            `https://${host}/example.com/pic.jpg?w=1000&h=500&x=1`,
            300,
          ),
        ).toBe(`https://${host}/example.com/pic.jpg?w=300&x=1`);
      },
    );

    it("handles http, an explicit port, and a fragment", () => {
      expect(
        optimizeImageUrl("http://i0.wp.com:8080/example.com/pic.jpg?h=5#f", 300),
      ).toBe("http://i0.wp.com:8080/example.com/pic.jpg?w=300#f");
    });

    it("leaves i3.wp.com untouched", () => {
      const url = "https://i3.wp.com/example.com/pic.jpg?w=1000";
      expect(optimizeImageUrl(url, 300)).toBe(url);
    });

    it("does not rewrite an uppercase host", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      const url = "https://I0.WP.COM/example.com/pic.jpg?w=1000";
      expect(optimizeImageUrl(url, 300)).toBe(url);
    });

    it("rewrites a host that contains the domain as a prefix", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        optimizeImageUrl("https://i0.wp.com.example.net/pic.jpg?w=1000", 300),
      ).toBe("https://i0.wp.com.example.net/pic.jpg?w=300");
    });

    it("rewrites a host that ends with the domain preceded by other text", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(optimizeImageUrl("https://xi0.wp.com/pic.jpg?w=1000", 300)).toBe(
        "https://xi0.wp.com/pic.jpg?w=300",
      );
    });
  });

  describe("Cloudinary images", () => {
    it("inserts the width transform on the bare domain", () => {
      expect(
        optimizeImageUrl(
          "https://cloudinary.com/demo/image/upload/v1/pic.jpg",
          300,
        ),
      ).toBe("https://cloudinary.com/demo/image/upload/w_300,c_scale/v1/pic.jpg");
    });

    it("inserts the width transform on a subdomain", () => {
      expect(
        optimizeImageUrl(
          "https://res.cloudinary.com/demo/image/upload/v1/pic.jpg?x=1#f",
          300,
        ),
      ).toBe(
        "https://res.cloudinary.com/demo/image/upload/w_300,c_scale/v1/pic.jpg?x=1#f",
      );
    });

    it("returns a Cloudinary URL without an upload segment unchanged", () => {
      const url = "https://res.cloudinary.com/demo/image/fetch/pic.jpg";
      expect(optimizeImageUrl(url, 300)).toBe(url);
    });

    it("does not rewrite an uppercase host", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      const url = "https://RES.CLOUDINARY.COM/demo/image/upload/v1/pic.jpg";
      expect(optimizeImageUrl(url, 300)).toBe(url);
    });

    it("rewrites a host that contains the domain as a prefix", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        optimizeImageUrl(
          "https://cloudinary.com.example.net/image/upload/v1/p.jpg",
          300,
        ),
      ).toBe(
        "https://cloudinary.com.example.net/image/upload/w_300,c_scale/v1/p.jpg",
      );
    });

    it("rewrites a URL whose query merely mentions the domain", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        optimizeImageUrl(
          "https://example.net/image/upload/v1/p.jpg?u=cloudinary.com",
          300,
        ),
      ).toBe(
        "https://example.net/image/upload/w_300,c_scale/v1/p.jpg?u=cloudinary.com",
      );
    });
  });
});
