/**
 * Obsidian stub contract (ADR 0014).
 *
 * Each expectation records a behavior observed in real Obsidian, and the
 * version it was observed on. The stub (`obsidian.ts`) and the DOM polyfills
 * (`../unit/test-dom-polyfills.ts`) must pass every expectation here.
 *
 * Add the expectation before changing the stub. Use the console probes in
 * `obsidian-console-probes.md` to observe the behavior, and name the version.
 */
import { describe, expect, it } from "vitest";

describe("Obsidian stub contract", () => {
  describe("globals", () => {
    // Observed on Obsidian 1.13.7 desktop: in the main window,
    // `activeDocument === document` is true.
    it("activeDocument is the main window's document", () => {
      expect(activeDocument).toBe(document);
    });
  });
});
