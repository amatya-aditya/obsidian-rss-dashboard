import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const stylesheet = postcss.parse(
  readFileSync(path.resolve(testDir, "../../../src/styles/modals.css"), "utf8"),
);

function declarationsFor(selector: string): Map<string, string> {
  const declarations = new Map<string, string>();
  stylesheet.walkRules((rule) => {
    const selectors = rule.selectors.map((s) => s.replace(/\s+/g, " "));
    if (!selectors.includes(selector)) return;
    rule.walkDecls((declaration) => {
      declarations.set(declaration.prop, declaration.value);
    });
  });
  return declarations;
}

describe("Reader custom save modal styles", () => {
  it("puts the template label and textarea on separate full-width rows", () => {
    expect(
      declarationsFor(".rss-dashboard-custom-save-modal label").get("display"),
    ).toBe("block");

    const textarea = declarationsFor(
      ".rss-dashboard-custom-save-modal textarea",
    );
    expect(textarea.get("display")).toBe("block");
    expect(textarea.get("width")).toBe("100%");
  });

  it("keeps the folder input full-width around its inset clear control", () => {
    const folderInput = declarationsFor(
      ".rss-dashboard-custom-save-modal .rss-dashboard-folder-input-container input",
    );

    expect(folderInput.get("width")).toBe("100%");
    expect(folderInput.get("min-width")).toBe("0");
    expect(folderInput.get("box-sizing")).toBe("border-box");
    expect(declarationsFor(".rss-dashboard-clear-icon").get("position")).toBe(
      "absolute",
    );
  });

  it("keeps the filename pattern override full-width and keyboard-visible", () => {
    const input = declarationsFor(
      ".rss-dashboard-custom-save-modal #rss-dashboard-filename-pattern",
    );
    expect(input.get("display")).toBe("block");
    expect(input.get("width")).toBe("100%");
    expect(input.get("box-sizing")).toBe("border-box");
    const focus = declarationsFor(
      ".rss-dashboard-custom-save-modal #rss-dashboard-filename-pattern:focus-visible",
    );
    expect(focus.get("outline")).toBe("2px solid var(--interactive-accent)");
    expect(focus.get("outline-offset")).toBe("2px");
  });

  it("keeps the action buttons in a horizontal row", () => {
    const actions = declarationsFor(
      ".rss-dashboard-custom-save-modal .rss-dashboard-modal-buttons",
    );
    const buttons = declarationsFor(
      ".rss-dashboard-custom-save-modal .rss-dashboard-modal-buttons button",
    );

    expect(actions.get("flex-direction")).toBe("row");
    expect(actions.get("justify-content")).toBe("center");
    expect(actions.get("flex-wrap")).toBe("wrap");
    expect(buttons.get("width")).toBe("auto");
    expect(buttons.get("max-width")).toBe("100%");
    expect(buttons.get("white-space")).toBe("normal");
    expect(buttons.get("overflow-wrap")).toBe("anywhere");
    expect(
      declarationsFor(
        ".rss-dashboard-custom-save-modal .rss-dashboard-custom-save-confirm-button",
      ).get("border"),
    ).toBe("1px solid var(--background-modifier-border)");
  });

  it("hides an action button that has the hidden attribute", () => {
    // The button rule sets a display value, which beats the browser's
    // [hidden] rule; this selector must outrank it so the button disappears.
    const buttonRule =
      ".rss-dashboard-custom-save-modal .rss-dashboard-modal-buttons button";
    expect(declarationsFor(`${buttonRule}[hidden]`).get("display")).toBe(
      "none",
    );
  });

  it("shows a visible focus ring on every action button", () => {
    for (const buttonClass of [
      "rss-dashboard-custom-save-cancel-button",
      "rss-dashboard-custom-save-confirm-button",
      "rss-dashboard-custom-save-template-button",
    ]) {
      const focus = declarationsFor(
        `.rss-dashboard-custom-save-modal .${buttonClass}:focus-visible`,
      );
      expect(focus.get("outline")).toBe("2px solid var(--interactive-accent)");
      expect(focus.get("outline-offset")).toBe("2px");
    }
  });

  it("shows visible focus on the folder and template text fields", () => {
    const templateSelectFocus = declarationsFor(
      ".rss-dashboard-template-select:focus-visible",
    );
    expect(templateSelectFocus.get("outline")).toBe("none");
    expect(templateSelectFocus.get("border-color")).toBe(
      "var(--interactive-accent)",
    );
    expect(templateSelectFocus.get("box-shadow")).toContain(
      "var(--interactive-accent)",
    );

    for (const selector of [
      ".rss-dashboard-folder-input-container input:focus-visible",
      "textarea:focus-visible",
    ]) {
      const focus = declarationsFor(
        `.rss-dashboard-custom-save-modal ${selector}`,
      );
      expect(focus.get("outline")).toBe("2px solid var(--interactive-accent)");
      expect(focus.get("outline-offset")).toBe("2px");
    }
  });
});
