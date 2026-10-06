// @vitest-environment jsdom

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "obsidian";
import { SavedTemplateEditorModal } from "../../../src/settings/modals/settings-modals";

const folderSuggestInputs = vi.hoisted(() => [] as HTMLInputElement[]);
vi.mock("../../../src/components/folder-suggest", () => ({
  VaultFolderSuggest: class {
    constructor(_app: unknown, input: HTMLInputElement) {
      folderSuggestInputs.push(input);
    }
  },
}));

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

function openEditor(editingId?: string): HTMLElement {
  const modal = new SavedTemplateEditorModal(
    new App(),
    {
      name: "Beta",
      template: "BETA: {{title}}",
      defaultFolder: "saved-articles/beta",
      filenamePattern: "",
      makeGlobalDefault: false,
    },
    [],
    editingId,
  );
  modal.open();
  return modal.contentEl;
}

afterEach(() => {
  activeDocument.body.replaceChildren();
  folderSuggestInputs.length = 0;
});

describe.each([
  ["Create saved template", undefined],
  ["Edit saved template", "template-1"],
])("%s dialog layout", (_title, editingId) => {
  it("wraps each field as a label above its control inside one form container", () => {
    const content = openEditor(editingId);
    const form = content.querySelector(".rss-template-form");
    expect(form).not.toBeNull();

    for (const id of [
      "rss-saved-template-name",
      "rss-saved-template-body",
      "rss-saved-template-folder",
      "rss-saved-template-filename",
    ]) {
      const control = content.querySelector(`#${id}`);
      const field = control?.closest(".rss-template-field");
      expect(field, id).not.toBeNull();
      expect(form?.contains(field ?? null), id).toBe(true);
      const label = field?.querySelector(`label[for="${id}"]`);
      expect(label, id).not.toBeNull();
      expect(
        label &&
          control &&
          label.compareDocumentPosition(control) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        id,
      ).toBeTruthy();
    }
  });

  it("puts the folder and filename pattern in one path row, with the filename help inside its own field", () => {
    const content = openEditor(editingId);
    const row = content.querySelector(".rss-template-path-fields");
    expect(row?.querySelector("#rss-saved-template-folder")).not.toBeNull();
    expect(row?.querySelector("#rss-saved-template-filename")).not.toBeNull();

    const filenameField = content
      .querySelector("#rss-saved-template-filename")
      ?.closest(".rss-template-field");
    const help = filenameField?.querySelector(
      "#rss-saved-template-filename-help",
    );
    expect(help?.classList.contains("rss-template-field-description")).toBe(
      true,
    );
    expect(
      content
        .querySelector("#rss-saved-template-filename")
        ?.getAttribute("aria-describedby"),
    ).toBe("rss-saved-template-filename-help");
  });

  it("offers vault folder suggestions on the custom folder field, as the Save article dialog does", () => {
    const content = openEditor(editingId);
    const folder = content.querySelector("#rss-saved-template-folder");
    expect(folderSuggestInputs).toEqual([folder]);
  });

  it("keeps the global-default checkbox and its explanation outside the path row", () => {
    const content = openEditor(editingId);
    const checkbox = content.querySelector(
      "#rss-saved-template-global-default",
    );
    expect(checkbox).not.toBeNull();
    expect(checkbox?.closest(".rss-template-path-fields")).toBeNull();
    expect(content.textContent).toContain(
      "A feed-assigned template takes precedence over the global default.",
    );
  });
});

describe("saved template editor styles", () => {
  it("stacks the fields in a vertical form with consistent spacing", () => {
    const form = declarationsFor(
      ".rss-dashboard-template-editor-dialog .rss-template-form",
    );
    expect(form.get("display")).toBe("flex");
    expect(form.get("flex-direction")).toBe("column");
    expect(form.get("gap")).toBeTruthy();

    const field = declarationsFor(
      ".rss-dashboard-template-editor-dialog .rss-template-field",
    );
    expect(field.get("display")).toBe("flex");
    expect(field.get("flex-direction")).toBe("column");
    expect(field.get("min-width")).toBe("0");
  });

  it("makes the inputs and the body textarea fill the field without overflowing", () => {
    const controls = declarationsFor(
      '.rss-dashboard-template-editor-dialog .rss-template-field input[type="text"]',
    );
    expect(controls.get("width")).toBe("100%");
    expect(controls.get("box-sizing")).toBe("border-box");

    const body = declarationsFor(
      ".rss-dashboard-template-editor-dialog .rss-template-field textarea",
    );
    expect(body.get("width")).toBe("100%");
    expect(body.get("box-sizing")).toBe("border-box");
    expect(body.get("min-height")).toBe("160px");
    expect(body.get("resize")).toBe("vertical");
  });

  it("lays the path fields out as a grid that collapses to one column", () => {
    const row = declarationsFor(
      ".rss-dashboard-template-editor-dialog .rss-template-path-fields",
    );
    expect(row.get("display")).toBe("grid");
    expect(row.get("grid-template-columns")).toContain("auto-fit");
    expect(row.get("grid-template-columns")).toContain("minmax(");
    expect(row.get("align-items")).toBe("start");
  });

  it("limits the dialog width and never scrolls sideways", () => {
    const modal = declarationsFor(
      "body .modal.rss-dashboard-template-editor-dialog",
    );
    expect(modal.get("width")).toContain("min(");
    expect(modal.get("max-width")).toBeTruthy();
    expect(
      declarationsFor(
        ".rss-dashboard-template-editor-dialog .rss-template-field-description",
      ).get("overflow-wrap"),
    ).toBe("anywhere");
  });
});
