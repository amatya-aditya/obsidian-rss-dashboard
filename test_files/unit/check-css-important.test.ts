import { describe, expect, it } from "vitest";
import { findImportantDeclarations } from "../../scripts/check-css-important.mjs";

describe("findImportantDeclarations", () => {
  it("accepts styles without important declarations", () => {
    const source = `
      .example {
        display: none;
      }
    `;

    expect(findImportantDeclarations(source)).toEqual([]);
  });

  it("ignores comment lines that mention !important without declaring it", () => {
    const source = `
      /* Scoped without using !important in this rule */
      .example {
        display: none;
      }
    `;

    expect(findImportantDeclarations(source)).toEqual([]);
  });

  it("flags declarations even when an audit-ok comment is present", () => {
    const source = `
      .example {
        display: none !important; /* audit-ok: legacy exception */
      }
    `;

    expect(findImportantDeclarations(source, "example.css")).toEqual([
      expect.objectContaining({ filePath: "example.css", line: 3 }),
    ]);
  });

  it("flags multiline important declarations", () => {
    const source = `
      .example {
        display:
          none
          !important;
      }
    `;

    expect(findImportantDeclarations(source)).toEqual([
      expect.objectContaining({ line: 3 }),
    ]);
  });
});
