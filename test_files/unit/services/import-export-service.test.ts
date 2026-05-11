/**
 * Phase 2 (Red) → Phase 3 (Green) — ImportExportService unit tests
 *
 * Covers:
 *   - getUserSettingsJson: omits feeds/folders/availableTags; produces valid JSON
 *   - showExportNotice: fires correct Notice for each result variant
 *   - showCopyNotice: fires correct Notice for copied/failed
 *   - exportOpml: calls exportBlob with a text/xml blob
 *   - exportDataJson: calls exportBlob with an application/json blob containing full settings
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RssDashboardSettings } from "../../../src/types/types";

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

function getNoticeMessages(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls
    .filter((call: unknown[]): call is [string, string] => call[0] === "[Stub Notice]")
    .map((call: [string, string]) => String(call[1]));
}

describe("ImportExportService", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  describe("getUserSettingsJson", () => {
    it("omits feeds, folders, and availableTags from output", () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      const parsed = JSON.parse(svc.getUserSettingsJson());
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
      expect(() => JSON.parse(svc.getUserSettingsJson())).not.toThrow();
    });
  });

  describe("showExportNotice", () => {
    it('fires "Downloading <filename>" for "downloaded"', () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      svc.showExportNotice("downloaded", "data.json");
      expect(getNoticeMessages(consoleLogSpy)).toContain(
        "Downloading data.json",
      );
    });

    it('fires "Opened save menu for <filename>" for "shared"', () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      svc.showExportNotice("shared", "feeds.opml");
      expect(getNoticeMessages(consoleLogSpy)).toContain(
        "Opened save menu for feeds.opml",
      );
    });

    it('fires "Export canceled" for "canceled"', () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      svc.showExportNotice("canceled", "data.json");
      expect(getNoticeMessages(consoleLogSpy)).toContain("Export canceled");
    });

    it('fires "Unable to export <filename>" for "failed"', () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      svc.showExportNotice("failed", "data.json");
      expect(getNoticeMessages(consoleLogSpy)).toContain(
        "Unable to export data.json",
      );
    });
  });

  describe("showCopyNotice", () => {
    it('fires "Copied <filename> to clipboard" for "copied"', () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      svc.showCopyNotice("copied", "data.json");
      expect(getNoticeMessages(consoleLogSpy)).toContain(
        "Copied data.json to clipboard",
      );
    });

    it('fires "Unable to copy <filename>" for "failed"', () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      svc.showCopyNotice("failed", "data.json");
      expect(getNoticeMessages(consoleLogSpy)).toContain(
        "Unable to copy data.json",
      );
    });
  });

  describe("exportOpml", () => {
    it("calls exportBlob with a text/xml blob", async () => {
      const svc = new ImportExportService({
        settings: makeSettings(),
        isMobile: false,
      });
      await svc.exportOpml();
      expect(exportBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          blob: expect.objectContaining({ type: "text/xml" }),
          filename: "feeds.opml",
        }),
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
          blob: expect.objectContaining({ type: "application/json" }),
          filename: "data.json",
        }),
      );
      const call = vi.mocked(exportBlob).mock.calls[0][0];
      const text = await call.blob.text();
      const parsed = JSON.parse(text);
      expect(parsed).toHaveProperty("feeds");
    });
  });

  describe("exportPortableDataBundle", () => {
    it("exports a portable bundle JSON payload when a provider is supplied", async () => {
      const settings = makeSettings();
      const svc = new ImportExportService({
        settings,
        isMobile: false,
        getPortableDataBundle: () =>
          ({
            version: 1,
            exportedAt: 123,
            storageMode: "vault-shards",
            metadata: { ...settings, feeds: [] },
            shards: [],
            markdownMirrorFallbackPlanned: true,
          }) as any,
      });

      await svc.exportPortableDataBundle();

      expect(exportBlob).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "rss-dashboard-portable-bundle.json",
        }),
      );
      const call = vi.mocked(exportBlob).mock.calls[0][0];
      const text = await call.blob.text();
      const parsed = JSON.parse(text);
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
      expect(getNoticeMessages(consoleLogSpy)).toContain(
        "Portable data bundle imported",
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
