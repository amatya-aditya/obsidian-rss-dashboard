/**
 * Regression guard for #1319.
 *
 * Vitest resolves test-file ids through their real (canonical) path, while the
 * `main` aliases in `vitest.config.mjs` are built from the path Node was
 * launched with. On Windows those can differ by case (`C:\coding` versus
 * `C:\Coding`), and then `main.ts` loads a second copy of every module it
 * imports: two `DEFAULT_SETTINGS`, and module mocks that bind to the copy this
 * file imports but not the one `main.ts` uses. Subset runs failed while the
 * full suite passed, which made `vitest related` block the pre-commit hook.
 *
 * `DEFAULT_SETTINGS.folders` carries module-load timestamps, so a shared
 * instance (same array) proves `main.ts` and this file resolved
 * `src/types/types` to one module.
 *
 * Where the launch path and the disk path already agree (Linux CI, a
 * correctly-cased Windows shell) this passes with or without the
 * canonicalisation; it is the Windows guard for it.
 */
import { describe, expect, it, vi } from "vitest";
import { App, type PluginManifest } from "obsidian";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import RssDashboardPlugin from "../../../main";

function createManifest(): PluginManifest {
  return {
    id: "rss-dashboard",
    name: "RSS Dashboard",
    version: "1.0.0",
    minAppVersion: "1.8.7",
    author: "Test",
    description: "Test plugin",
    dir: ".",
  };
}

describe("module graph identity", () => {
  it("loads the plugin's defaults from the module this test imports", async () => {
    const plugin = new RssDashboardPlugin(App.createMock(), createManifest());
    plugin.loadData = vi.fn().mockResolvedValue(null);
    plugin.saveData = vi.fn().mockResolvedValue(undefined);

    await plugin.loadSettings();

    // Identity, not deep equality: two module copies produce two folder
    // arrays whose `createdAt` stamps differ by however long `main.ts` took
    // to import, which a timestamp comparison can miss.
    expect(plugin.settings.folders).toBe(DEFAULT_SETTINGS.folders);
  });
});
