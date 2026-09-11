/**
 * Phase 2 (Red) → Phase 3 (Green) — ImportExportService unit tests
 *
 * Covers:
 *   - getUserSettingsJson: omits feeds/folders/availableTags; produces valid JSON
 *   - export/copy methods: return their result instead of showing a Notice
 *     (services are infrastructure; main.ts turns the result into a Notice)
 *   - exportOpml: calls exportBlob with a text/xml blob
 *   - exportDataJson: calls exportBlob with an application/json blob containing full settings
 */
import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import type { RssDashboardSettings, PortableDataBundle } from "../../../src/types/types";

vi.mock("../../../src/utils/export-utils", () => ({
  exportBlob: vi.fn().mockResolvedValue("downloaded"),
  copyTextToClipboard: vi.fn().mockResolvedValue("copied"),
}));

vi.mock("../../../src/services/opml-manager", () => ({
  OpmlManager: {
    generateOpml: vi.fn().mockReturnValue("<opml>mock</opml>"),
  },
}));

import { ImportExportService } from "../../../src/services/import-export-service";
import { exportBlob } from "../../../src/utils/export-utils";

function makeSettings(overrides?: object): RssDashboardSettings {
  return {
    feeds: [{ url: "https://example.com/feed", name: "Test" }],
    folders: [{ name: "News", subfolders: [], createdAt: 0, modifiedAt: 0 }],
    availableTags: [{ name: "tech", color: "#fff" }],
    refreshInterval: 60,
    ...overrides,
  } as unknown as RssDashboardSettings;
}

describe("ImportExportService", () => {
  let noticeSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    noticeSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("never shows a Notice directly — services are infrastructure, callers notify", async () => {
    const svc = new ImportExportService({
      settings: makeSettings(),
      isMobile: false,
    });
    await svc.exportDataJson();
    await svc.exportOpml();
    await svc.copyDataJsonToClipboard();
    expect(noticeSpy).not.toHaveBeenCalledWith("[Stub Notice]", expect.anything());
  });

  describe("getUserSettingsJson", () => {
    it("omits feeds, folders, and availableTags from output", () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      const parsed = JSON.parse(svc.getUserSettingsJson()) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty("feeds");
      expect(parsed).not.toHaveProperty("folders");
      expect(parsed).not.toHaveProperty("availableTags");
      expect(parsed).toHaveProperty("refreshInterval", 60);
    });

    it("produces valid JSON", () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      expect(() => { JSON.parse(svc.getUserSettingsJson()); }).not.toThrow();
    });
  });

  describe("exportOpml", () => {
    it("calls exportBlob with a text/xml blob and returns its result", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      const result = await svc.exportOpml();
      expect(exportBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          blob: expect.objectContaining({ type: "text/xml" }) as unknown as Blob,
          filename: "feeds.opml",
        }),
      );
      expect(result).toBe("downloaded");
    });
  });

  describe("copyDataJsonToClipboard", () => {
    it("returns the clipboard copy result without showing a Notice", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      const result = await svc.copyDataJsonToClipboard();
      expect(result).toBe("copied");
      expect(noticeSpy).not.toHaveBeenCalledWith(
        "[Stub Notice]",
        expect.anything(),
      );
    });
  });

  describe("exportDataJson", () => {
    it("calls exportBlob with an application/json blob containing full settings", async () => {
      const settings = makeSettings();
      const svc = new ImportExportService({ settings, isMobile: false });
      await svc.exportDataJson();
      expect(exportBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          blob: expect.objectContaining({ type: "application/json" }) as unknown as Blob,
          filename: "data.json",
        }),
      );
      const call = vi.mocked(exportBlob).mock.calls[0][0] as unknown as { blob: Blob; filename: string };
      const text = await call.blob.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(parsed).toHaveProperty("feeds");
    });
  });

  describe("exportPortableDataBundle", () => {
    it("exports a portable bundle JSON payload when a provider is supplied", async () => {
      const settings = makeSettings();
      const svc = new ImportExportService({
        settings,
        isMobile: false,
        getPortableDataBundle: () => {
          return {
            version: 1,
            exportedAt: 123,
            storageMode: "vault-shards",
            metadata: { ...settings, feeds: [] },
            shards: [],
            markdownMirrorFallbackPlanned: true,
          } as unknown as PortableDataBundle;
        },
      });

      await svc.exportPortableDataBundle();

      expect(exportBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "rss-dashboard-portable-bundle.json",
        }),
      );
      const call = vi.mocked(exportBlob).mock.calls[0][0] as unknown as { blob: Blob; filename: string };
      const text = await call.blob.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(parsed.storageMode).toBe("vault-shards");
      expect(parsed.markdownMirrorFallbackPlanned).toBe(true);
    });
  });

  describe("importPortableDataBundleFromFile", () => {
    it("parses bundle JSON and passes it to the import callback", async () => {
      const importPortableDataBundle = vi.fn().mockResolvedValue(undefined);
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
        importPortableDataBundle,
      });

      const file = new File(
        [
          JSON.stringify({
            version: 1,
            exportedAt: 123,
            storageMode: "vault-shards",
            metadata: { feeds: [] },
            shards: [],
            markdownMirrorFallbackPlanned: true,
          }),
        ],
        "portable-bundle.json",
        { type: "application/json" },
      );

      await svc.importPortableDataBundleFromFile(file);

      expect(importPortableDataBundle).toHaveBeenCalledTimes(1);
      expect(importPortableDataBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 1,
          storageMode: "vault-shards",
        }),
      );
      expect(noticeSpy).not.toHaveBeenCalledWith(
        "[Stub Notice]",
        expect.anything(),
      );
    });

    it("throws a helpful error when bundle JSON is invalid", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
        importPortableDataBundle: vi.fn().mockResolvedValue(undefined),
      });

      const file = new File(["{bad json"], "portable-bundle.json", {
        type: "application/json",
      });

      await expect(svc.importPortableDataBundleFromFile(file)).rejects.toThrow(
        "Invalid portable bundle JSON",
      );
    });
  });
});
