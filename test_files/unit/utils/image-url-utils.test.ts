import { describe, it, expect } from "vitest";
import { optimizeImageUrl } from "../../../src/utils/image-url-utils.js";

describe("optimizeImageUrl", () => {
  it("rewrites Brightspot crop URLs without offset", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/8552x5292/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot crop URLs with +0+0 offset", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/8552x5292+0+0/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs with ! delimiter", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/8552x5292!/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/600x/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs without ! delimiter", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/8552x5292/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/600x/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot crop URLs on media.npr.org with +0+0 offset", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/crop/8552x5292+0+0/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs on media.npr.org with ! delimiter", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/8552x5292!/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/600x/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs on media.npr.org without ! delimiter", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/8552x5292/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/600x/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("does not mangle non-Brightspot URLs", () => {
    const url = "https://example.com/image.jpg";
    expect(optimizeImageUrl(url)).toBe(url);
  });

  it("leaves empty input as empty", () => {
    expect(optimizeImageUrl("")).toBe("");
  });
});

