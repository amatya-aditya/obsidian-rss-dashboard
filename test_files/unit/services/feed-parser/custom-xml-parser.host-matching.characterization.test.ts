import { describe, expect, it } from "vitest";
import { CustomXMLParser } from "../../../../src/services/feed-parser/xml-parser/custom-xml-parser.js";

// transformSageUrl is private; it is reached here through the parser instance.
function transform(url: string): string {
  const parser = new CustomXMLParser() as unknown as {
    transformSageUrl(value: string): string;
  };
  return parser.transformSageUrl(url);
}

describe("CustomXMLParser article link host handling", () => {
  it.each([
    [
      "https://journals.sagepub.com/doi/abs/10.1/abc",
      "https://journals.sagepub.com/doi/full/10.1/abc",
    ],
    [
      "http://journals.sagepub.com/doi/abs/10.1/abc",
      "http://journals.sagepub.com/doi/full/10.1/abc",
    ],
    [
      "https://journals.sagepub.com:8443/doi/10.1/abc?x=1#f",
      "https://journals.sagepub.com:8443/doi/full/10.1/abc?x=1#f",
    ],
    [
      "https://journals.sagepub.com/doi/full/10.1/abc",
      "https://journals.sagepub.com/doi/full/10.1/abc",
    ],
  ])("rewrites %s", (input, expected) => {
    expect(transform(input)).toBe(expected);
  });

  it("leaves an unrelated host untouched", () => {
    const url = "https://example.com/doi/abs/10.1/abc";
    expect(transform(url)).toBe(url);
  });

  it("does not rewrite an uppercase host", () => {
    // Pinned as-is: matches by substring; replaced by hostname matching
    const url = "https://JOURNALS.SAGEPUB.COM/doi/abs/10.1/abc";
    expect(transform(url)).toBe(url);
  });

  it("rewrites a host that contains the domain as a prefix", () => {
    // Pinned as-is: matches by substring; replaced by hostname matching
    expect(
      transform("https://journals.sagepub.com.example.net/doi/abs/10.1/abc"),
    ).toBe("https://journals.sagepub.com.example.net/doi/full/10.1/abc");
  });

  it("rewrites a URL whose query merely mentions the domain", () => {
    // Pinned as-is: matches by substring; replaced by hostname matching
    expect(
      transform("https://example.net/doi/abs/10.1/abc?u=journals.sagepub.com"),
    ).toBe("https://example.net/doi/full/10.1/abc?u=journals.sagepub.com");
  });
});
