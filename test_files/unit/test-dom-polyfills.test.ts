import { describe, expect, it } from "vitest";
import { installObsidianDomPolyfills } from "./test-dom-polyfills";

describe("Obsidian DOM polyfills", () => {
  it("exposes the owning window from documents and nodes", () => {
    installObsidianDomPolyfills();

    const element = createDiv();

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

  it("creates helper descendants in the active document when an element has no owner", () => {
    const globalScope = window as Window & { activeDocument?: Document };
    const originalActiveDocument = globalScope.activeDocument;
    const originalCreateDiv = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "createDiv",
    );
    const activeDocument = document.implementation.createHTMLDocument("active");
    let appendedChild: Node | undefined;
    const host = {
      ownerDocument: null,
      appendChild(child: Node): Node {
        appendedChild = child;
        return child;
      },
    } as unknown as HTMLElement;

    globalScope.activeDocument = activeDocument;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)["createDiv"];
    installObsidianDomPolyfills();

    try {
      HTMLElement.prototype.createDiv.call(host);

      expect(appendedChild?.ownerDocument).toBe(activeDocument);
    } finally {
      globalScope.activeDocument = originalActiveDocument;
      if (originalCreateDiv) {
        Object.defineProperty(
          HTMLElement.prototype,
          "createDiv",
          originalCreateDiv,
        );
      }
    }
  });
});
