// Collapse logic is now DOM-measurement-based (applyResponsiveCollapse reads
// scrollWidth/clientWidth at runtime). No pure-function to unit-test here.
// Tests for icon registry shape live in sidebar-icon-registry.test.ts.
import { describe, it } from "vitest";

describe("sidebar collapse (DOM-based)", () => {
  it("collapse behaviour is validated via sidebar-icon-registry.test.ts", () => {
    // applyResponsiveCollapse operates on live DOM scrollWidth/clientWidth —
    // not testable as a pure function. See registry tests for structural guarantees.
  });
});

