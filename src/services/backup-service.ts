import type { RssDashboardSettings } from "../types/types";
import type { VaultInterface } from "../types/vault-interface";
import { OpmlManager } from "./opml-manager";

/**
 * BackupService — handles automatic backup of plugin data and settings
 *
 * Provides both async (vault adapter) and sync (Electron FS) backup strategies.
 * Async backups are used during normal plugin operation; sync backups run on plugin unload.
 */
export class BackupService {
  private settings: RssDashboardSettings;
  private manifest: { dir?: string };
  private vaultAbsolutePath: string;
  private vault: VaultInterface;
  private getUserSettingsJsonFn: () => string;
  private getPortableDataBundleJsonFn: () => string;

  constructor(options: {
    settings: RssDashboardSettings;
    manifest: { dir?: string };
    vaultAbsolutePath: string;
    vault: VaultInterface;
    getUserSettingsJson?: () => string;
    getPortableDataBundleJson?: () => string;
  }) {
    this.settings = options.settings;
    this.manifest = options.manifest;
    this.vaultAbsolutePath = options.vaultAbsolutePath;
    this.vault = options.vault;
    this.getUserSettingsJsonFn =
      options.getUserSettingsJson || (() => JSON.stringify({}));
    this.getPortableDataBundleJsonFn =
      options.getPortableDataBundleJson || (() => JSON.stringify({}));
  }

  /**
   * Perform async backups using the vault adapter
   * Called during normal plugin operation
   */
  public async performAutoBackups(): Promise<void> {
    const { autoBackup } = this.settings;
    if (!autoBackup) return;

    const pluginDir = this.manifest.dir;
    if (!pluginDir) return;

    try {
      // 1. data.json - follow metadata storage location
      if (autoBackup.backupDataJson) {
        // Determine where metadata is stored
        let metadataPath: string | undefined;
        if (this.settings.metadataStorageMode === "vault-location") {
          metadataPath = this.settings.metadataStorageFolder;
        } else {
          // plugin-default mode: use plugin directory
          metadataPath = pluginDir;
        }

        if (metadataPath) {
          const dataPath = `${metadataPath}/data.json`;
          if (await this.vault.adapter.exists(dataPath)) {
            const content = await this.vault.adapter.read(dataPath);
            await this.vault.adapter.write(`${dataPath}.backup`, content);
          }
        }

        if (this.settings.storageMode === "vault-shards") {
          await this.vault.adapter.write(
            `${pluginDir}/portable-data-bundle.json.backup`,
            this.getPortableDataBundleJsonFn(),
          );
        }
      }

      // 2. feeds.opml
      if (autoBackup.backupOpml) {
        const opmlContent = OpmlManager.generateOpml(
          this.settings.feeds,
          this.settings.folders,
        );
        const opmlPath = `${pluginDir}/feeds.opml.backup`;
        await this.vault.adapter.write(opmlPath, opmlContent);
      }

      // 3. userdata.json / usersettings.json
      if (autoBackup.backupUserdata) {
        // We look for both common names, prioritizing 'usersettings.json' since that's what's exported.
        const userSettingsPath = `${pluginDir}/usersettings.json`;
        const userDataPath = `${pluginDir}/userdata.json`;

        const userSettingsExists =
          await this.vault.adapter.exists(userSettingsPath);

        if (userSettingsExists) {
          const content = await this.vault.adapter.read(userSettingsPath);
          await this.vault.adapter.write(`${userSettingsPath}.backup`, content);
        } else {
          const userDataExists = await this.vault.adapter.exists(userDataPath);
          if (userDataExists) {
            const content = await this.vault.adapter.read(userDataPath);
            await this.vault.adapter.write(`${userDataPath}.backup`, content);
          }
        }
      }
    } catch (e) {
      console.error("[RSS Dashboard] Auto-backup failed:", e);
    }
  }

  /**
   * Perform sync backups using Electron's native file system (desktop only)
   * Called during plugin unload via beforeunload handler
   * Returns true if backups succeeded, false otherwise
   *
   * NOTE: The following block uses Electron's native fs/path modules via 'activeWindow.require'.
   * This is a known desktop-only pattern in Obsidian. The surrounding try...catch is
   * CRITICAL to ensure the plugin doesn't crash on mobile where these APIs are absent.
   */
  public performAutoBackupsSyncDesktop(): boolean {
    const { autoBackup } = this.settings;
    if (!autoBackup) return false;

    const pluginDir = this.manifest.dir;
    if (!pluginDir) return false;

    try {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Electron native fs/path modules required for desktop auto-backup; not in standard Obsidian types */
      const req = (activeWindow as any).require;
      if (!req) return false;

      const fs = req("fs");
      const path = req("path");
      if (!fs || !path) return false;

      const vaultRoot = this.vaultAbsolutePath;
      if (!vaultRoot) return false;

      const absPluginDir = path.resolve(vaultRoot, pluginDir);

      if (autoBackup.backupDataJson) {
        // Determine where metadata is stored
        let metadataPath: string | undefined;
        if (this.settings.metadataStorageMode === "vault-location") {
          metadataPath = path.resolve(
            vaultRoot,
            this.settings.metadataStorageFolder,
          );
        } else {
          // plugin-default mode: use plugin directory
          metadataPath = absPluginDir;
        }

        if (metadataPath) {
          const dataPath = path.join(metadataPath, "data.json");
          if (fs.existsSync(dataPath)) {
            fs.copyFileSync(dataPath, `${dataPath}.backup`);
          }
        }

        if (this.settings.storageMode === "vault-shards") {
          const bundlePath = path.join(
            absPluginDir,
            "portable-data-bundle.json.backup",
          );
          fs.writeFileSync(
            bundlePath,
            this.getPortableDataBundleJsonFn(),
            "utf-8",
          );
        }
      }

      if (autoBackup.backupOpml) {
        const opmlContent = OpmlManager.generateOpml(
          this.settings.feeds,
          this.settings.folders,
        );
        const opmlPath = path.join(absPluginDir, "feeds.opml.backup");
        fs.writeFileSync(opmlPath, opmlContent, "utf-8");
      }

      if (autoBackup.backupUserdata) {
        const userSettingsPath = path.join(absPluginDir, "usersettings.json");
        const userDataPath = path.join(absPluginDir, "userdata.json");
        const backupPath = path.join(absPluginDir, "userdata.json.backup");

        if (fs.existsSync(userSettingsPath)) {
          fs.copyFileSync(userSettingsPath, backupPath);
        } else if (fs.existsSync(userDataPath)) {
          fs.copyFileSync(userDataPath, backupPath);
        } else {
          fs.writeFileSync(backupPath, this.getUserSettingsJsonFn(), "utf-8");
        }
      }
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

      return true;
    } catch (e) {
      console.error("[RSS Dashboard] Sync Auto-backup failed:", e);
    }
    return false;
  }
}
