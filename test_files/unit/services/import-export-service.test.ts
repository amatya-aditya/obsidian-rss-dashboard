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
import type {
  RssDashboardSettings,
  PortableDataBundle,
  FeedBundle,
  SettingsBundle,
} from "../../../src/types/types";

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

  describe("exportFeedBundle", () => {
    it("exports a feed bundle JSON payload when a provider is supplied", async () => {
      const settings = makeSettings();
      const svc = new ImportExportService({
        settings,
        isMobile: false,
        getFeedBundle: () => {
          return {
            version: 1,
            exportedAt: 123,
            feeds: [],
            folders: [],
            availableTags: [],
            shards: [],
          } as unknown as FeedBundle;
        },
      });

      await svc.exportFeedBundle();

      expect(exportBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "rss-dashboard-feed-bundle.json",
        }),
      );
      const call = vi.mocked(exportBlob).mock.calls[0][0] as unknown as { blob: Blob; filename: string };
      const text = await call.blob.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(parsed).toHaveProperty("feeds");
      expect(parsed).not.toHaveProperty("settings");
    });

    it("throws when no Feed bundle provider is available, instead of exporting a corrupt file", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });

      await expect(svc.exportFeedBundle()).rejects.toThrow(
        "Feed bundle export is not available in this context",
      );
      expect(exportBlob).not.toHaveBeenCalled();
    });
  });

  describe("exportSettingsBundle", () => {
    it("exports a settings bundle JSON payload when a provider is supplied", async () => {
      const settings = makeSettings();
      const svc = new ImportExportService({
        settings,
        isMobile: false,
        getSettingsBundle: () => {
          return {
            version: 1,
            exportedAt: 123,
            settings: { refreshInterval: 60 },
          } as unknown as SettingsBundle;
        },
      });

      await svc.exportSettingsBundle();

      expect(exportBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "rss-dashboard-settings-bundle.json",
        }),
      );
      const call = vi.mocked(exportBlob).mock.calls[0][0] as unknown as { blob: Blob; filename: string };
      const text = await call.blob.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      expect(parsed).toHaveProperty("settings");
      expect(parsed).not.toHaveProperty("feeds");
    });

    it("throws when no Settings bundle provider is available, instead of exporting a corrupt file", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });

      await expect(svc.exportSettingsBundle()).rejects.toThrow(
        "Settings bundle export is not available in this context",
      );
      expect(exportBlob).not.toHaveBeenCalled();
    });
  });

  describe("importFeedBundleFromFile", () => {
    it("parses bundle JSON and passes it to the import callback", async () => {
      const importFeedBundle = vi.fn().mockResolvedValue(undefined);
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
        importFeedBundle,
      });

      const file = new File(
        [
          JSON.stringify({
            version: 1,
            exportedAt: 123,
            feeds: [],
            folders: [],
            availableTags: [],
            shards: [],
          }),
        ],
        "feed-bundle.json",
        { type: "application/json" },
      );

      await svc.importFeedBundleFromFile(file);

      expect(importFeedBundle).toHaveBeenCalledTimes(1);
      expect(importFeedBundle).toHaveBeenCalledWith(
        expect.objectContaining({ version: 1 }),
      );
    });

    it("throws a helpful error when bundle JSON is invalid", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
        importFeedBundle: vi.fn().mockResolvedValue(undefined),
      });

      const file = new File(["{bad json"], "feed-bundle.json", {
        type: "application/json",
      });

      await expect(svc.importFeedBundleFromFile(file)).rejects.toThrow(
        "Invalid feed bundle JSON",
      );
    });

    it("throws when no import handler is available", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });

      const file = new File(["{}"], "feed-bundle.json", {
        type: "application/json",
      });

      await expect(svc.importFeedBundleFromFile(file)).rejects.toThrow(
        "Feed bundle import is not available in this context",
      );
    });
  });

  describe("importSettingsBundleFromFile", () => {
    it("parses bundle JSON and passes it to the import callback", async () => {
      const importSettingsBundle = vi.fn().mockResolvedValue(undefined);
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
        importSettingsBundle,
      });

      const file = new File(
        [
          JSON.stringify({
            version: 1,
            exportedAt: 123,
            settings: { refreshInterval: 60 },
          }),
        ],
        "settings-bundle.json",
        { type: "application/json" },
      );

      await svc.importSettingsBundleFromFile(file);

      expect(importSettingsBundle).toHaveBeenCalledTimes(1);
      expect(importSettingsBundle).toHaveBeenCalledWith(
        expect.objectContaining({ version: 1 }),
      );
    });

    it("throws a helpful error when bundle JSON is invalid", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
        importSettingsBundle: vi.fn().mockResolvedValue(undefined),
      });

      const file = new File(["{bad json"], "settings-bundle.json", {
        type: "application/json",
      });

      await expect(svc.importSettingsBundleFromFile(file)).rejects.toThrow(
        "Invalid settings bundle JSON",
      );
    });

    it("throws when no import handler is available", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });

      const file = new File(["{}"], "settings-bundle.json", {
        type: "application/json",
      });

      await expect(svc.importSettingsBundleFromFile(file)).rejects.toThrow(
        "Settings bundle import is not available in this context",
      );
    });
  });
});
