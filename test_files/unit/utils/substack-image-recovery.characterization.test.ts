import { beforeEach, describe, expect, it } from "vitest";
import { recoverFailedSubstackImageElement } from "../../../src/utils/substack-image-url";

describe("recoverFailedSubstackImageElement current behavior", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("leaves an ordinary image alone and does not mark an attempt", () => {
    const img = createEl("img");
    img.setAttribute("src", "https://images.example.com/photo.png");

    expect(recoverFailedSubstackImageElement(img)).toBeNull();
    expect(img.getAttribute("src")).toBe(
      "https://images.example.com/photo.png",
    );
    expect(img.dataset.rssSubstackRecoverAttempted).toBeUndefined();
  });

  it("normalizes recoverable srcset candidates in place", () => {
    const img = createEl("img");
    img.setAttribute(
      "src",
      "https://substackcdn.com/image/fetch/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fphoto.png",
    );
    img.setAttribute(
      "srcset",
      "https://substackcdn.com/image/fetch/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fphoto.png 2x",
    );

    expect(recoverFailedSubstackImageElement(img)).toBeNull();
    expect(img.getAttribute("src")).toBe(
      "https://substack-post-media.s3.amazonaws.com/photo.png",
    );
    expect(img.getAttribute("srcset")).toBe(
      "https://substack-post-media.s3.amazonaws.com/photo.png 2x",
    );
    expect(img.dataset.rssSubstackRecoverAttempted).toBe("true");
  });

  it("normalizes picture source candidates and preserves the image element", () => {
    const picture = createEl("picture");
    const source = createEl("source");
    source.setAttribute(
      "srcset",
      "https://substackcdn.com/image/fetch/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fwide.png 800w",
    );
    const img = createEl("img");
    img.setAttribute(
      "src",
      "https://substackcdn.com/image/fetch/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fphoto.png",
    );
    picture.append(source, img);

    expect(recoverFailedSubstackImageElement(img)).toBeNull();
    expect(picture.querySelector("img")).toBe(img);
    expect(source.getAttribute("srcset")).toBe(
      "https://substack-post-media.s3.amazonaws.com/wide.png 800w",
    );
  });

  it("replaces an image when a malformed selected currentSrc has a recoverable raw src", () => {
    const picture = createEl("picture");
    const source = createEl("source");
    source.setAttribute("srcset", "https://images.example.com/photo.png 2x");
    const img = createEl("img");
    img.setAttribute(
      "src",
      "https://substackcdn.com/image/fetch/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fphoto.png",
    );
    img.setAttribute("srcset", "https://images.example.com/photo.png 2x");
    img.setAttribute("sizes", "100vw");
    img.setAttribute("alt", "Sample photo");
    Object.defineProperty(img, "currentSrc", {
      configurable: true,
      value: "https://publisher.substack.com/image/invalid",
    });
    picture.append(source, img);

    const replacement = recoverFailedSubstackImageElement(img);

    expect(replacement).toBe(picture.querySelector("img"));
    expect(replacement).not.toBe(img);
    expect(replacement?.getAttribute("src")).toBe(
      "https://substack-post-media.s3.amazonaws.com/photo.png",
    );
    expect(replacement?.getAttribute("alt")).toBe("Sample photo");
    expect(replacement?.hasAttribute("srcset")).toBe(false);
    expect(replacement?.hasAttribute("sizes")).toBe(false);
    expect(source.isConnected).toBe(false);
    expect(replacement?.dataset.rssSubstackRecoverAttempted).toBe("true");
  });

  it("does not repeat recovery after the attempt marker is set", () => {
    const img = createEl("img");
    img.dataset.rssSubstackRecoverAttempted = "true";
    img.setAttribute(
      "src",
      "https://substackcdn.com/image/fetch/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fphoto.png",
    );

    expect(recoverFailedSubstackImageElement(img)).toBeNull();
    expect(img.getAttribute("src")).toContain("substackcdn.com/image/fetch/");
  });
});
