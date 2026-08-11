import { describe, expect, it } from "vitest";
import { installObsidianDomPolyfills } from "./test-dom-polyfills";

describe("Obsidian DOM polyfills", () => {
  it("exposes the owning window from documents and nodes", () => {
    installObsidianDomPolyfills();

    const element = document.createElement("div");

    expect(document.win).toBe(window);
    expect(element.win).toBe(window);
  });

  it("creates detached elements and fragments through window helpers", () => {
    installObsidianDomPolyfills();

    const element = window.createEl("button", {
      cls: "rss-test-button",
      text: "Test",
    });
    const fragment = window.createFragment();

    expect(element.ownerDocument).toBe(document);
    expect(element.parentNode).toBeNull();
    expect(element.className).toBe("rss-test-button");
    expect(element.textContent).toBe("Test");
    expect(fragment.ownerDocument).toBe(document);
  });
});
