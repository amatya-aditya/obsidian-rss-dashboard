import { afterEach, describe, expect, it } from "vitest";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";
import { moveFocusIfRemoved } from "../../../src/utils/focus-utils";

installObsidianDomPolyfills();

afterEach(() => {
  document.body.empty();
});

describe("moveFocusIfRemoved", () => {
  it("moves focus to fallback when the element itself is focused", () => {
    const element = document.body.createEl("button");
    const fallback = document.body.createEl("button");
    element.focus();
    expect(document.activeElement).toBe(element);

    moveFocusIfRemoved(element, fallback);
    expect(document.activeElement).toBe(fallback);
  });

  it("moves focus to fallback when a descendant of element is focused", () => {
    const parent = document.body.createDiv();
    const link = parent.createEl("a", { href: "https://example.com" });
    const fallback = document.body.createEl("button");
    link.focus();
    expect(document.activeElement).toBe(link);

    moveFocusIfRemoved(parent, fallback);
    expect(document.activeElement).toBe(fallback);
  });

  it("leaves focus alone when activeElement is outside element", () => {
    const element = document.body.createDiv();
    element.createEl("a", { href: "https://example.com" });
    const other = document.body.createEl("button");
    const fallback = document.body.createEl("button");
    other.focus();
    expect(document.activeElement).toBe(other);

    moveFocusIfRemoved(element, fallback);
    expect(document.activeElement).toBe(other);
  });

  it("does nothing when element or fallback is null or undefined", () => {
    const fallback = document.body.createEl("button");
    expect(() => moveFocusIfRemoved(null, fallback)).not.toThrow();
    expect(() => moveFocusIfRemoved(undefined, fallback)).not.toThrow();

    const element = document.body.createEl("button");
    element.focus();
    expect(() => moveFocusIfRemoved(element, null)).not.toThrow();
    expect(() => moveFocusIfRemoved(element, undefined)).not.toThrow();
    expect(document.activeElement).toBe(element);
  });
});
