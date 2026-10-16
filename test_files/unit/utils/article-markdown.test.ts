import { describe, expect, it } from "vitest";
import { articleHtmlToMarkdown } from "../../../src/utils/article-markdown";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

// The block-link normalizer reads Obsidian's `doc.win` helpers on the block
// branch, so the parsed-document polyfills must be installed first.
installObsidianDomPolyfills();

describe("articleHtmlToMarkdown block links (#1200)", () => {
  const target = "https://example.com/story";
  const imageUrl = "https://example.com/photo.png";

  it("keeps the image linked and the caption beside it when an anchor wraps both", () => {
    const markdown = articleHtmlToMarkdown(
      `<p><a href="${target}"><img src="${imageUrl}" alt="Photo" />Caption</a></p>`,
    );

    expect(markdown).toBe(`[![Photo](${imageUrl})](${target}) Caption`);
  });

  it("decodes a Substack image-fetch href on an anchor that wraps an image and a caption", () => {
    const rawSubstackLink =
      "https://substackcdn.com/image/fetch/$s_!GtED!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F108fc67d-1f88-4d55-bb47-e44613e67b2a_1632x656.png";
    const decodedImageUrl =
      "https://substack-post-media.s3.amazonaws.com/public/images/108fc67d-1f88-4d55-bb47-e44613e67b2a_1632x656.png";

    const markdown = articleHtmlToMarkdown(
      `<figure><a href="${rawSubstackLink}"><img src="${decodedImageUrl}" alt="Photo" />Caption</a></figure>`,
    );

    expect(markdown).toBe(
      `[![Photo](${decodedImageUrl})](${decodedImageUrl}) Caption`,
    );
  });

  it("still flattens an anchor whose only content is a text label", () => {
    const markdown = articleHtmlToMarkdown(
      `<p><a href="${target}">Read more</a></p>`,
    );

    expect(markdown).toBe(`[Read more](${target})`);
  });

  it("still links an anchor that wraps only an image", () => {
    const markdown = articleHtmlToMarkdown(
      `<p><a href="${target}"><img src="${imageUrl}" alt="Photo" /></a></p>`,
    );

    expect(markdown).toBe(`[![Photo](${imageUrl})](${target})`);
  });

  it("still unwraps a label-less block link and keeps its image", () => {
    const markdown = articleHtmlToMarkdown(
      `<a href="${target}"><div><img src="${imageUrl}" alt="Photo" /></div></a>`,
    );

    expect(markdown).toBe(`![Photo](${imageUrl})`);
  });
});
