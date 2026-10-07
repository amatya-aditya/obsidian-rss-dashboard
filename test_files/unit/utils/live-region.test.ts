import { afterEach, describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createLiveRegion } from "../../../src/utils/live-region";
import { clearViewReady, markViewReady } from "../../../src/utils/view-ready";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const srcDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../src",
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : [full];
  });
}

afterEach(() => {
  document.body.empty();
});

describe("createLiveRegion", () => {
  it("builds a polite, atomic status region in its parent", () => {
    const parent = document.body.createDiv();

    const region = createLiveRegion(parent, "hidden-announcer");

    expect(region.el.parentElement).toBe(parent);
    expect(region.el.classList.contains("hidden-announcer")).toBe(true);
    expect(region.el.getAttribute("role")).toBe("status");
    expect(region.el.getAttribute("aria-live")).toBe("polite");
    expect(region.el.getAttribute("aria-atomic")).toBe("true");
    expect(region.el.textContent).toBe("");
  });

  it("shows only the latest message", () => {
    const region = createLiveRegion(document.body.createDiv(), "x");

    region.announce("first");
    region.announce("second");

    expect(region.el.textContent).toBe("second");
  });

  it("replaces the node for a repeated message so it is announced again", () => {
    const region = createLiveRegion(document.body.createDiv(), "x");
    region.announce("same");
    const firstNode = region.el.firstElementChild;

    region.announce("same");

    expect(region.el.firstElementChild).not.toBe(firstNode);
    expect(region.el.textContent).toBe("same");
  });
});

describe("view readiness flag", () => {
  it("is set and cleared on the root", () => {
    const root = document.body.createDiv();
    expect(root.hasAttribute("data-rss-ready")).toBe(false);

    markViewReady(root);
    markViewReady(root);
    expect(root.hasAttribute("data-rss-ready")).toBe(true);

    clearViewReady(root);
    expect(root.hasAttribute("data-rss-ready")).toBe(false);
  });

  it("is written by one production file only", () => {
    const writers = sourceFiles(srcDir)
      .filter((file) => readFileSync(file, "utf-8").includes("data-rss-ready"))
      .map((file) => path.relative(srcDir, file).split(path.sep).join("/"));

    expect(writers).toEqual(["utils/view-ready.ts"]);
  });
});
