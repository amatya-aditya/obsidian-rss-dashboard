import { describe, expect, it } from "vitest";
import { findImportantWithoutAuditComment } from "../../scripts/check-css-important.mjs";

describe("findImportantWithoutAuditComment", () => {
  it("accepts declarations with audit-ok comments", () => {
    const source = `
      .example {
        display: none !important; /* audit-ok: display toggle utility */
      }
    `;

    expect(findImportantWithoutAuditComment(source)).toEqual([]);
  });

  it("ignores comment lines that mention !important without declaring it", () => {
    const source = `
      /* Scoped without using !important in this rule */
      .example {
        display: none;
      }
    `;

    expect(findImportantWithoutAuditComment(source)).toEqual([]);
  });

  it("flags declarations missing audit-ok comments", () => {
    const source = `
      .example {
        display: none !important;
      }
    `;

    expect(findImportantWithoutAuditComment(source)).toEqual([
      expect.objectContaining({ line: 3 }),
    ]);
  });
});
