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
import { App, requestUrl, setRequestUrlHandler } from "obsidian";

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

  describe("vault: hidden paths", () => {
    // Observed on Obsidian 1.13.7 desktop: `getAbstractFileByPath` returns
    // `null` for anything under a dot-prefixed folder (including `configDir`),
    // even when `adapter.exists` reports it on disk.
    it("leaves files and folders under a dot folder out of the vault index", async () => {
      const { vault } = new App();
      await vault.createFolder(".rss-meta");
      await vault.create(".rss-meta/data.json", "{}");

      expect(vault.getAbstractFileByPath(".rss-meta")).toBeNull();
      expect(vault.getAbstractFileByPath(".rss-meta/data.json")).toBeNull();
      expect(vault.getFiles().map((file) => file.path)).not.toContain(
        ".rss-meta/data.json",
      );
      expect(await vault.adapter.exists(".rss-meta")).toBe(true);
      expect(await vault.adapter.exists(".rss-meta/data.json")).toBe(true);
    });

    // Observed on Obsidian 1.13.7 desktop: `configDir` is a dot folder, so
    // the plugin's own folder is hidden from the vault index too.
    it("keeps the config folder, a dot folder, out of the vault index", async () => {
      const { vault } = new App();
      const manifestPath = `${vault.configDir}/plugins/rss-dashboard/manifest.json`;
      await vault.adapter.write(manifestPath, "{}");

      expect(vault.configDir.startsWith(".")).toBe(true);
      expect(vault.getAbstractFileByPath(manifestPath)).toBeNull();
      expect(await vault.adapter.exists(manifestPath)).toBe(true);
    });
  });
});
