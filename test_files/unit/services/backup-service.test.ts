/**
 * Phase 2 (Red) — BackupService unit tests
 *
 * FAILING OUTPUT (before BackupService is implemented):
 * Cannot find module '../../../src/services/backup-service'
 *
 * These tests are RED until BackupService is implemented.
 * Each test covers a critical backup scenario without any service code existing yet.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AutoBackupSettings } from "../../../src/types/types";
import type { VaultInterface } from "../../../src/types/vault-interface";

type TestVault = VaultInterface;

type TestManifest = {
  dir: string;
};

vi.mock("../../../src/services/backup-service", { spy: true });

describe("BackupService", () => {
  let mockVault: TestVault;
  let mockManifest: TestManifest;
  let vaultAbsolutePath: string;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVault = {
      adapter: {
        exists: vi.fn().mockResolvedValue(true),
        read: vi.fn().mockResolvedValue("test data"),
        write: vi.fn().mockResolvedValue(undefined),
      },
    };

    mockManifest = {
      dir: "configDir/plugins/obsidian-rss-dashboard",
    };

    vaultAbsolutePath = "/path/to/vault";
  });

  describe("performAutoBackups", () => {
    it("skips backup when autoBackup is falsy", async () => {
      const { BackupService } =
        await import("../../../src/services/backup-service");
      const settings = {
        autoBackup: null,
      } as unknown as { autoBackup: null | AutoBackupSettings };
      const service = new BackupService({
        settings: settings as unknown as { autoBackup: AutoBackupSettings },
        manifest: mockManifest,
        vaultAbsolutePath,
        vault: mockVault,
        getPortableDataBundleJson: () => JSON.stringify({ bundle: true }),
      });

      await service.performAutoBackups();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockVault.adapter.write).not.toHaveBeenCalled();
    });

    it("writes data.json.backup when backupDataJson is true", async () => {
      const { BackupService } =
        await import("../../../src/services/backup-service");
      const settings = {
        autoBackup: {
          backupDataJson: true,
          backupOpml: false,
          backupUserdata: false,
        },
      } as unknown as { autoBackup: AutoBackupSettings };
      const service = new BackupService({
        settings: settings as unknown as { autoBackup: AutoBackupSettings },
        manifest: mockManifest,
        vaultAbsolutePath,
        vault: mockVault,
      });

      await service.performAutoBackups();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockVault.adapter.read).toHaveBeenCalledWith(
        "configDir/plugins/obsidian-rss-dashboard/data.json",
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockVault.adapter.write).toHaveBeenCalledWith(
        "configDir/plugins/obsidian-rss-dashboard/data.json.backup",
        expect.any(String),
      );
    });

    it("writes a portable bundle backup when shard storage is enabled", async () => {
      const { BackupService } =
        await import("../../../src/services/backup-service");
      const settings = {
        storageMode: "vault-shards",
        autoBackup: {
          backupDataJson: true,
          backupOpml: false,
          backupUserdata: false,
        },
      } as unknown as { storageMode: string; autoBackup: AutoBackupSettings };
      const service = new BackupService({
        settings: settings as unknown as { autoBackup: AutoBackupSettings },
        manifest: mockManifest,
        vaultAbsolutePath,
        vault: mockVault,
        getPortableDataBundleJson: () => JSON.stringify({ bundle: true }),
      });

      await service.performAutoBackups();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockVault.adapter.write).toHaveBeenCalledWith(
        "configDir/plugins/obsidian-rss-dashboard/portable-data-bundle.json.backup",
        JSON.stringify({ bundle: true }),
      );
    });

    it("writes feeds.opml.backup when backupOpml is true", async () => {
      const { BackupService } =
        await import("../../../src/services/backup-service");
      const settings = {
        feeds: [],
        folders: [],
        autoBackup: {
          backupDataJson: false,
          backupOpml: true,
          backupUserdata: false,
        },
      } as unknown as { autoBackup: AutoBackupSettings };
      const service = new BackupService({
        settings: settings as unknown as { autoBackup: AutoBackupSettings },
        manifest: mockManifest,
        vaultAbsolutePath,
        vault: mockVault,
      });

      await service.performAutoBackups();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockVault.adapter.write).toHaveBeenCalledWith(
        "configDir/plugins/obsidian-rss-dashboard/feeds.opml.backup",
        expect.stringContaining("<?xml"),
      );
    });

    it("writes userdata.json.backup when backupUserdata is true (fallback chain)", async () => {
      const { BackupService } =
        await import("../../../src/services/backup-service");
      const settings = {
        autoBackup: {
          backupDataJson: false,
          backupOpml: false,
          backupUserdata: true,
        },
      } as unknown as { autoBackup: AutoBackupSettings };
      const service = new BackupService({
        settings: settings as unknown as { autoBackup: AutoBackupSettings },
        manifest: mockManifest,
        vaultAbsolutePath,
        vault: mockVault,
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      mockVault.adapter.exists.mockImplementation((path: string) =>
        Promise.resolve(path.includes("usersettings.json")),
      );

      await service.performAutoBackups();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockVault.adapter.read).toHaveBeenCalledWith(
        expect.stringContaining("usersettings.json"),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockVault.adapter.write).toHaveBeenCalledWith(
        expect.stringContaining("backup"),
        expect.any(String),
      );
    });
  });

  describe("performAutoBackupsSyncDesktop", () => {
    it("returns false when autoBackup is falsy", async () => {
      const { BackupService } =
        await import("../../../src/services/backup-service");
      const settings = {
        autoBackup: null,
      } as unknown as { autoBackup: null | AutoBackupSettings };
      const service = new BackupService({
        settings: settings as unknown as { autoBackup: AutoBackupSettings },
        manifest: mockManifest,
        vaultAbsolutePath,
        vault: mockVault,
      });

      const result = service.performAutoBackupsSyncDesktop();

      expect(result).toBe(false);
    });

    it("returns false when window.require is absent", async () => {
      const { BackupService } =
        await import("../../../src/services/backup-service");
      // Simulate window.require being unavailable
      const originalRequire = (window as unknown as { require?: unknown }).require;
      (window as unknown as { require?: unknown }).require = undefined;

      const settings = {
        autoBackup: {
          backupDataJson: true,
          backupOpml: true,
          backupUserdata: true,
        },
      } as unknown as { autoBackup: AutoBackupSettings };
      const service = new BackupService({
        settings: settings as unknown as { autoBackup: AutoBackupSettings },
        manifest: mockManifest,
        vaultAbsolutePath,
        vault: mockVault,
      });

      const result = service.performAutoBackupsSyncDesktop();

      expect(result).toBe(false);

      // Restore
      (window as unknown as { require?: unknown }).require = originalRequire;
    });

    it("returns true and copies files via fs.copyFileSync on success", async () => {
      const { BackupService } =
        await import("../../../src/services/backup-service");

      // Mock fs and path via window.require
      const mockFs = {
        existsSync: vi.fn().mockReturnValue(true),
        copyFileSync: vi.fn(),
        writeFileSync: vi.fn(),
      };
      const mockPath = {
        resolve: vi.fn((...args: string[]) => args.join("/")),
        join: vi.fn((...args: string[]) => args.join("/")),
      };

      const originalRequire = (window as unknown as { require?: unknown }).require;
      (window as unknown as { require?: unknown }).require = vi.fn((moduleName: string) => {
        if (moduleName === "fs") return mockFs;
        if (moduleName === "path") return mockPath;
        return null;
      });

      const settings = {
        feeds: [],
        folders: [],
        autoBackup: {
          backupDataJson: true,
          backupOpml: true,
          backupUserdata: true,
        },
      } as unknown as { autoBackup: AutoBackupSettings };
      const service = new BackupService({
        settings: settings as unknown as { autoBackup: AutoBackupSettings },
        manifest: mockManifest,
        vaultAbsolutePath,
        vault: mockVault,
      });

      const result = service.performAutoBackupsSyncDesktop();

      expect(result).toBe(true);
      expect(mockFs.copyFileSync).toHaveBeenCalled();

      // Restore
      (window as unknown as { require?: unknown }).require = originalRequire;
    });
  });
});
