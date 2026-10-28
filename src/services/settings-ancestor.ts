import type { App } from "obsidian";
import { SETTINGS_ANCESTOR_STORAGE_KEY } from "../utils/settings-loader";
import {
  loadVaultLocalStorage,
  saveVaultLocalStorage,
} from "../utils/vault-local-storage";
import { digestSettings, type SettingsAncestor } from "./settings-group-merge";

function isHashMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

/**
 * The `data.json` state this device last knew to be shared (ADR 0036), kept in
 * Obsidian's device-local storage for the vault so Sync never carries it.
 * Content hashes only, so no feed title or URL is stored.
 */
export class SettingsAncestorStore {
  constructor(private readonly app: App) {}

  /** The stored ancestor, or null when none was recorded or it is unreadable. */
  load(): SettingsAncestor | null {
    const stored = loadVaultLocalStorage(
      this.app,
      SETTINGS_ANCESTOR_STORAGE_KEY,
    );
    if (typeof stored !== "object" || stored === null) return null;
    const { groups, feeds, folders } = stored as Record<string, unknown>;
    if (!isHashMap(groups)) return null;
    const ancestor: SettingsAncestor = { groups };
    if (isHashMap(feeds)) ancestor.feeds = feeds;
    if (isHashMap(folders)) ancestor.folders = folders;
    return ancestor;
  }

  /** Makes a file this device loaded from outside the new ancestor. */
  record(file: Record<string, unknown>): void {
    saveVaultLocalStorage(
      this.app,
      SETTINGS_ANCESTOR_STORAGE_KEY,
      digestSettings(file),
    );
  }

  /** Records a file only when there is no ancestor yet; never moves one. */
  seedIfMissing(file: Record<string, unknown>): void {
    if (this.load() === null) this.record(file);
  }
}
