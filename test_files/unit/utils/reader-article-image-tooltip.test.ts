// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildReaderImageTooltipText,
  getReaderImageFilename,
} from "../../../src/utils/reader-article-render";

describe("Reader image tooltip text", () => {
  it("uses currentSrc before src and decodes only the final path segment", () => {
    const image = createEl("img");
    image.setAttribute("src", "https://example.test/fallback.png");
    Object.defineProperty(image, "currentSrc", {
      configurable: true,
      value: "https://cdn.example.test/photos/http-banner%20large.svg?v=2#preview",
    });

    expect(getReaderImageFilename(image)).toBe("http-banner large.svg");
  });

  it("returns no filename for a source without a final path segment", () => {
    const image = createEl("img");
    image.setAttribute("src", "https://example.test/photos/");

    expect(getReaderImageFilename(image)).toBe("");
  });

  it.each([
    ["Article title", "Article title", "image.jpg", "image.jpg"],
    ["Image", "Article title", "image.jpg", "image.jpg"],
    ["", "Article title", "image.jpg", "image.jpg"],
    ["A useful scene", "Article title", "scene.jpg", "A useful scene — scene.jpg"],
    ["scene.jpg", "Article title", "scene.jpg", "scene.jpg"],
    ["", "Article title", "", ""],
  ])("builds a concise tooltip for alt %j and filename %j", (alt, title, filename, expected) => {
    expect(buildReaderImageTooltipText(alt, title, filename)).toBe(expected);
  });
});
