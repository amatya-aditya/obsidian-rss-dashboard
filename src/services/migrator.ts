import type { DataAdapter } from "obsidian";
import type { RssDashboardSettings } from "../types/types";
import type { DatabaseService } from "./database";

const BACKUP_FILENAME = "data.json.backup";

export class MigrationService {
    /**
     * Migrate data from the old JSON-based storage to SQLite.
     *
     * Flow:
     * 1. Write feeds/articles/folders/tags to SQLite
     * 2. Flush SQLite to disk
     * 3. Create a backup of the original data.json
     * 4. Return a settings-only version (without feeds/folders/tags)
     *    to be saved back to data.json
     */
    static async migrateFromJson(
        settings: RssDashboardSettings,
        db: DatabaseService,
        adapter: DataAdapter,
        pluginDir: string
    ): Promise<void> {
        // 1. Write bulk data to SQLite
        db.saveAllTags(settings.availableTags);
        db.saveAllFolders(settings.folders);
        db.saveAllFeeds(settings.feeds);

        // 2. Flush SQLite to disk immediately
        await db.forceSave();

        // 3. Backup original data.json
        const dataJsonPath = `${pluginDir}/data.json`;
        const backupPath = `${pluginDir}/${BACKUP_FILENAME}`;
        try {
            const originalData = await adapter.read(dataJsonPath);
            await adapter.write(backupPath, originalData);
        } catch {
            // data.json might not exist (fresh install) - that's fine
        }
    }

    /**
     * Check if migration from JSON to SQLite is needed.
     * Migration is needed when:
     * - SQLite database has no data
     * - AND the loaded settings contain feeds (from data.json)
     */
    static needsMigration(
        settings: RssDashboardSettings,
        db: DatabaseService
    ): boolean {
        return !db.hasData() && settings.feeds.length > 0;
    }

    /**
     * Check if a backup exists (useful for "restore from backup" command)
     */
    static async hasBackup(
        adapter: DataAdapter,
        pluginDir: string
    ): Promise<boolean> {
        try {
            await adapter.read(`${pluginDir}/${BACKUP_FILENAME}`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Restore data.json from backup (emergency recovery)
     */
    static async restoreFromBackup(
        adapter: DataAdapter,
        pluginDir: string
    ): Promise<string | null> {
        const backupPath = `${pluginDir}/${BACKUP_FILENAME}`;
        try {
            return await adapter.read(backupPath);
        } catch {
            return null;
        }
    }
}
