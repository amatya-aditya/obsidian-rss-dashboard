import { describe, expect, it } from "vitest";
import { stripCdnResizeParameters } from "../../../src/utils/full-size-image-resolver";

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

    it("strips a host that contains the domain as a prefix", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        stripCdnResizeParameters(
          "https://cloudinary.com.example.net/i/upload/w_300,c_scale/v1/p.jpg",
        ),
      ).toBe("https://cloudinary.com.example.net/i/upload/v1/p.jpg");
    });

    it("strips a host that ends with the domain preceded by other text", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        stripCdnResizeParameters(
          "https://xcloudinary.com/i/upload/w_300,c_scale/v1/p.jpg",
        ),
      ).toBe("https://xcloudinary.com/i/upload/v1/p.jpg");
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

    it("strips a host that contains the domain as a prefix", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        stripCdnResizeParameters(
          "https://media.npr.org.example.net/a/resize/1200x800/p.jpg",
        ),
      ).toBe("https://media.npr.org.example.net/a/p.jpg");
    });

    it("strips a host that ends with the domain preceded by other text", () => {
      // Pinned as-is: matches by substring; replaced by hostname matching
      expect(
        stripCdnResizeParameters(
          "https://xbrightspotcdn.com/a/resize/1200x800/p.jpg",
        ),
      ).toBe("https://xbrightspotcdn.com/a/p.jpg");
    });

    it("leaves an unrelated host's resize path alone", () => {
      const url = "https://example.com/a/resize/1200x800/p.jpg";
      expect(stripCdnResizeParameters(url)).toBe(url);
    });
  });
});
