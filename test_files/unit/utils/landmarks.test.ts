import { afterEach, describe, expect, it } from "vitest";
import {
  markMainLandmark,
  markNamedLandmark,
} from "../../../src/utils/landmarks";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

describe("landmarks", () => {
  afterEach(() => {
    document.body.empty();
  });

  it("marks an element as the main landmark without a name", () => {
    const el = document.body.createDiv();
    markMainLandmark(el);

    expect(el.getAttribute("role")).toBe("main");
    expect(el.hasAttribute("aria-labelledby")).toBe(false);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });

  it("names a landmark from the text of another element, never an aria-label", () => {
    const label = document.body.createSpan({ text: "Feeds" });
    const nav = document.body.createDiv();

    markNamedLandmark(nav, "navigation", label);

    expect(nav.getAttribute("role")).toBe("navigation");
    expect(label.id).not.toBe("");
    expect(nav.getAttribute("aria-labelledby")).toBe(label.id);
    expect(nav.hasAttribute("aria-label")).toBe(false);
  });

  it("keeps an id the label already has", () => {
    const label = document.body.createSpan({ text: "Title" });
    label.id = "existing-title";
    const region = document.body.createDiv();

    markNamedLandmark(region, "region", label);

    expect(label.id).toBe("existing-title");
    expect(region.getAttribute("aria-labelledby")).toBe("existing-title");
  });

  it("gives two labels two different ids", () => {
    const first = document.body.createSpan();
    const second = document.body.createSpan();

    markNamedLandmark(document.body.createDiv(), "region", first);
    markNamedLandmark(document.body.createDiv(), "region", second);

    expect(first.id).not.toBe(second.id);
  });
});
