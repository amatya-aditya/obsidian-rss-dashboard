import { type App, TFolder } from "obsidian";
import { DEFAULT_SETTINGS, type RssDashboardSettings } from "../types/types";

function storageLog(_message: string, _details?: unknown): void {}

/**
 * Resolves the full vault path for metadata storage based on current mode.
 * - "plugin-default": returns undefined (uses Plugin.saveData())
 * - "vault-location": returns normalized vault folder path
 */
export function getMetadataPath(
  settings: RssDashboardSettings,
): string | undefined {
  if (settings.metadataStorageMode === "plugin-default") {
    return undefined; // Use Plugin.saveData()
  }

  // Normalize path: remove leading/trailing slashes, default to .rss-dashboard-data if empty
  let folder = settings.metadataStorageFolder.trim();
  if (!folder) {
    folder = ".rss-dashboard-data";
  }
  folder = folder.replace(/^\/+|\/+$/g, ""); // Remove leading/trailing slashes
  return folder;
}

/**
 * Loads metadata from the appropriate location based on mode.
 */
export async function loadMetadata(
  app: App,
  mode: "plugin-default" | "vault-location",
  folder: string,
): Promise<RssDashboardSettings | null> {
  if (mode === "plugin-default") {
    return null; // Will be loaded via Plugin.loadData() in the plugin class
  }

  // Try to load from vault location
  const metadataPath = getMetadataPath({
    ...DEFAULT_SETTINGS,
    metadataStorageMode: mode,
    metadataStorageFolder: folder,
  });
  if (!metadataPath) {
    return null;
  }

  try {
    const dataFilePath = `${metadataPath}/data.json`;
    const content = await app.vault.adapter.read(dataFilePath);
    return JSON.parse(content) as RssDashboardSettings;
  } catch (error) {
    storageLog(
      "Failed to load metadata from vault location, will fall back to plugin default",
      error,
    );
    return null; // Fall back to plugin-default
  }
}

/**
 * Ensures metadata folder exists (idempotent).
 * - If folder exists and is a folder: returns success
 * - If folder doesn't exist: creates it
 * - If path is a file: throws error
 * - If createFolder race condition occurs: checks again and continues if now a folder
 */
export async function ensureMetadataFolderExists(
  app: App,
  settings: RssDashboardSettings,
): Promise<void> {
  const folderPath = getMetadataPath(settings);
  if (!folderPath) {
    return; // Plugin-default mode, no folder needed
  }

  const normalized = folderPath.replace(/^\/+|\/+$/g, "");

  try {
    // Check if path already exists in vault cache
    const existing = app.vault.getAbstractFileByPath(normalized);
    if (existing) {
      if (existing instanceof TFolder) {
        return; // Folder already exists, idempotent success
      } else {
        throw new Error(
          `Metadata storage path points to a file, not a folder: ${normalized}`,
        );
      }
    }

    // Also check via adapter (covers folders not yet indexed in vault cache)
    const existsOnDisk = await app.vault.adapter.exists(normalized);
    if (existsOnDisk) {
      return; // Folder exists on disk (cache lag), treat as success
    }

    // Folder doesn't exist, create it
    await app.vault.createFolder(normalized);
  } catch (error) {
    // Handle race condition: createFolder throws "Folder already exists" or similar
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("already exists")
    ) {
      return; // Folder exists (race condition or cache lag), treat as success
    }
    throw error;
  }
}
