import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizeSubstackImageUrlsInElement,
  recoverFailedSubstackImageElement,
} from "../../../src/utils/substack-image-url";

describe("substack-image-url", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("normalizes raw Substack fetch URLs in a live DOM element tree", () => {
    const container = document.createElement("div");
    const fragment = document.createRange().createContextualFragment(`
      <picture>
        <source
          srcset="https://substackcdn.com/image/fetch/$s_!YDr_!,w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png 424w, https://substackcdn.com/image/fetch/$s_!YDr_!,w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png 848w"
        >
        <img src="https://substackcdn.com/image/fetch/$s_!YDr_!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png">
      </picture>
    `);
    container.replaceChildren(fragment);

    normalizeSubstackImageUrlsInElement(container);

    const img = container.querySelector("img");
    const source = container.querySelector("source");

    expect(img?.getAttribute("src")).toBe(
      "https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png",
    );
    expect(source?.getAttribute("srcset") || "").toContain(
      "https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png",
    );
    expect(source?.getAttribute("srcset") || "").not.toContain(
      "substackcdn.com/image/fetch/",
    );
  });

  it("recovers a failed image element by decoding raw Substack fetch URLs", () => {
    const picture = document.createElement("picture");
    const source = document.createElement("source");
    source.setAttribute(
      "srcset",
      "https://substackcdn.com/image/fetch/$s_!SA5R!,w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F2ffc7282-03c5-4312-ae24-6fddb3050102_970x722.png 424w",
    );
    const img = document.createElement("img");
    img.setAttribute(
      "src",
      "https://substackcdn.com/image/fetch/$s_!SA5R!,w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F2ffc7282-03c5-4312-ae24-6fddb3050102_970x722.png",
    );
    picture.appendChild(source);
    picture.appendChild(img);

    const recovered = recoverFailedSubstackImageElement(img);

    expect(recovered).toBe(true);
    expect(img.getAttribute("src")).toBe(
      "https://substack-post-media.s3.amazonaws.com/public/images/2ffc7282-03c5-4312-ae24-6fddb3050102_970x722.png",
    );
    expect(source.getAttribute("srcset") || "").toContain(
      "https://substack-post-media.s3.amazonaws.com/public/images/2ffc7282-03c5-4312-ae24-6fddb3050102_970x722.png",
    );
    expect(source.getAttribute("srcset") || "").not.toContain(
      "substackcdn.com/image/fetch/",
    );
  });

  it("forces a fresh S3 img selection when currentSrc is a malformed custom-domain Substack URL", () => {
    const picture = document.createElement("picture");
    const source = document.createElement("source");
    source.setAttribute(
      "srcset",
      "https://substack-post-media.s3.amazonaws.com/public/images/09233796-bc94-4a3b-ac97-921397cef69c_850x496.png 424w, https://substack-post-media.s3.amazonaws.com/public/images/09233796-bc94-4a3b-ac97-921397cef69c_850x496.png 848w",
    );
    const img = document.createElement("img");
    img.setAttribute(
      "src",
      "https://substack-post-media.s3.amazonaws.com/public/images/09233796-bc94-4a3b-ac97-921397cef69c_850x496.png",
    );
    img.setAttribute(
      "srcset",
      "https://substack-post-media.s3.amazonaws.com/public/images/09233796-bc94-4a3b-ac97-921397cef69c_850x496.png 424w, https://substack-post-media.s3.amazonaws.com/public/images/09233796-bc94-4a3b-ac97-921397cef69c_850x496.png 848w",
    );
    Object.defineProperty(img, "currentSrc", {
      configurable: true,
      value:
        "https://astralcodexten.substack.com/fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F09233796-bc94-4a3b-ac97-921397cef69c_850x496.png",
    });
    picture.appendChild(source);
    picture.appendChild(img);

    const recovered = recoverFailedSubstackImageElement(img);
    const replacementImg = picture.querySelector("img");

    expect(recovered).toBe(true);
    expect(picture.querySelector("source")).toBeNull();
    expect(replacementImg?.getAttribute("src")).toBe(
      "https://substack-post-media.s3.amazonaws.com/public/images/09233796-bc94-4a3b-ac97-921397cef69c_850x496.png",
    );
    expect(replacementImg?.hasAttribute("srcset")).toBe(false);
  });

  it("forces a fresh S3 img selection when currentSrc is a truncated raw Substack candidate", () => {
    const picture = document.createElement("picture");
    const source = document.createElement("source");
    source.setAttribute(
      "srcset",
      "https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png 424w, https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png 848w",
    );
    const img = document.createElement("img");
    img.setAttribute(
      "src",
      "https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png",
    );
    img.setAttribute(
      "srcset",
      "https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png 424w, https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png 848w",
    );
    Object.defineProperty(img, "currentSrc", {
      configurable: true,
      value: "https://substackcdn.com/image/fetch/$s_!YDr_!",
    });
    picture.appendChild(source);
    picture.appendChild(img);

    const recovered = recoverFailedSubstackImageElement(img);
    const replacementImg = picture.querySelector("img");

    expect(recovered).toBe(true);
    expect(picture.querySelector("source")).toBeNull();
    expect(replacementImg?.getAttribute("src")).toBe(
      "https://substack-post-media.s3.amazonaws.com/public/images/78bc0b7f-5818-4597-b47e-9178ac5df0f2_513x478.png",
    );
    expect(replacementImg?.hasAttribute("srcset")).toBe(false);
  });
});
