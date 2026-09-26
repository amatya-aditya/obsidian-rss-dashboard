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
import { afterEach, describe, expect, it } from "vitest";
import { requestUrl, setRequestUrlHandler } from "obsidian";

describe("Obsidian stub contract", () => {
  describe("globals", () => {
    // Observed on Obsidian 1.13.7 desktop: in the main window,
    // `activeDocument === document` is true.
    it("activeDocument is the main window's document", () => {
      expect(activeDocument).toBe(document);
    });
  });

  describe("requestUrl", () => {
    afterEach(() => {
      setRequestUrlHandler(null);
    });

    // Observed on Obsidian 1.13.7 desktop: a response with status 400 or above
    // rejects with an Error whose message is "Request failed, status <n>" and
    // whose own keys are exactly ["status", "headers"].
    it.each([403, 404, 500])("throws on status %i", async (status) => {
      setRequestUrlHandler(() => ({ status, headers: { "x-probe": "1" } }));

      const error: unknown = await requestUrl({
        url: `https://httpbin.org/status/${status}`,
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(`Request failed, status ${status}`);
      expect(Object.keys(error as object)).toEqual(["status", "headers"]);
      expect(error).toMatchObject({ status, headers: { "x-probe": "1" } });
    });

    // Observed on Obsidian 1.13.7 desktop: with `throw: false`, a 403 response
    // is returned instead of thrown.
    it("returns the response when throw is false", async () => {
      setRequestUrlHandler(() => ({ status: 403, text: "Forbidden" }));

      const response = await requestUrl({
        url: "https://httpbin.org/status/403",
        throw: false,
      });

      expect(response.status).toBe(403);
      expect(response.text).toBe("Forbidden");
    });

    it("returns responses below 400", async () => {
      setRequestUrlHandler(() => ({ status: 200, text: "ok" }));

      const response = await requestUrl({ url: "https://example.com/" });

      expect(response.status).toBe(200);
      expect(response.text).toBe("ok");
    });
  });
});
