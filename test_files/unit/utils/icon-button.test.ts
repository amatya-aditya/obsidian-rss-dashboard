import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createIconButton } from "../../../src/utils/icon-button";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

installObsidianDomPolyfills();

const testDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(testDir, "../../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("createIconButton", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = createDiv();
    activeDocument.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.clearAllMocks();
  });

  it("renders a native button that does not submit forms, named by its label", () => {
    const button = createIconButton({
      parent: host,
      label: "Star article",
      icon: "star",
    });

    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-label")).toBe("Star article");
    expect(button.parentElement).toBe(host);
    // A native button needs neither a role nor a tabindex of its own.
    expect(button.hasAttribute("role")).toBe(false);
    expect(button.hasAttribute("tabindex")).toBe(false);
  });

  it("refuses to build an unnamed icon button", () => {
    expect(() =>
      createIconButton({ parent: host, label: "", icon: "star" }),
    ).toThrow(/accessible name/i);
    expect(() =>
      createIconButton({ parent: host, label: "   ", icon: "star" }),
    ).toThrow(/accessible name/i);
    expect(host.querySelector("button")).toBeNull();
  });

  it("fails to compile when the accessible name is omitted", () => {
    // @ts-expect-error the label is required, so omitting it is a type error
    const call = () => createIconButton({ parent: host, icon: "star" });
    expect(call).toThrow(/accessible name/i);
  });

  it("applies the given classes and calls the click handler with the event", () => {
    const onClick = vi.fn();
    const button = createIconButton({
      parent: host,
      label: "Open in browser",
      icon: "external-link",
      cls: "rss-reader-action-button extra",
      onClick,
    });

    expect(button.classList.contains("rss-reader-action-button")).toBe(true);
    expect(button.classList.contains("extra")).toBe(true);
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0][0]).toBeInstanceOf(MouseEvent);
  });

  it("renders an icon inside the button", () => {
    const button = createIconButton({
      parent: host,
      label: "Save article",
      icon: "save",
    });

    // The Obsidian stub records the icon id on the element `setIcon` receives.
    expect(button.dataset.icon).toBe("save");
  });

  it("sets aria-pressed, aria-expanded and aria-haspopup only when asked", () => {
    const plain = createIconButton({ parent: host, label: "Plain", icon: "x" });
    expect(plain.hasAttribute("aria-pressed")).toBe(false);
    expect(plain.hasAttribute("aria-expanded")).toBe(false);
    expect(plain.hasAttribute("aria-haspopup")).toBe(false);

    const toggle = createIconButton({
      parent: host,
      label: "Toggle",
      icon: "x",
      pressed: false,
      expanded: true,
      hasPopup: "menu",
    });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-haspopup")).toBe("menu");

    const pressed = createIconButton({
      parent: host,
      label: "Pressed",
      icon: "x",
      pressed: true,
      hasPopup: true,
    });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    expect(pressed.getAttribute("aria-haspopup")).toBe("true");
  });

  it("sets the data-rss test hooks only when action or region is given", () => {
    const bare = createIconButton({ parent: host, label: "Bare", icon: "x" });
    expect(bare.hasAttribute("data-rss-action")).toBe(false);
    expect(bare.hasAttribute("data-rss-region")).toBe(false);

    const hooked = createIconButton({
      parent: host,
      label: "Hooked",
      icon: "x",
      action: "star",
      region: "reader-toolbar",
    });
    expect(hooked.getAttribute("data-rss-action")).toBe("star");
    expect(hooked.getAttribute("data-rss-region")).toBe("reader-toolbar");
  });

  it("builds a detached button when no parent is given", () => {
    const button = createIconButton({ label: "Loose", icon: "x" });

    expect(button.parentElement).toBeNull();
    expect(button.tagName).toBe("BUTTON");
  });

  it("is the only production code that writes the data-rss hooks", () => {
    const writers = sourceFiles(srcDir)
      .filter((file) =>
        /data-rss-(action|region)/.test(readFileSync(file, "utf-8")),
      )
      .map((file) => path.relative(srcDir, file).split(path.sep).join("/"));

    expect(writers).toEqual(["utils/icon-button.ts"]);
  });
});
