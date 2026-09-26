import { TFolder, normalizePath, type App } from "obsidian";

/**
 * Reports whether a file exists at `path`, including under a dot-prefixed
 * folder such as `.rss-meta` or the config folder. Obsidian leaves those out
 * of its vault index, so `getAbstractFileByPath` returns `null` for them even
 * when they're on disk; only the adapter can see them.
 */
export async function vaultFileExists(app: App, path: string): Promise<boolean> {
  const normalizedPath = normalizePath(path);
  const indexed = app.vault.getAbstractFileByPath(normalizedPath);
  if (indexed) {
    return !(indexed instanceof TFolder);
  }
  return app.vault.adapter.exists(normalizedPath);
}

/**
 * Moves the file at `path` to the trash and reports whether it did.
 *
 * An indexed file goes through the file manager, which honours the user's
 * "Deleted files" preference. A file under a dot-prefixed folder has no
 * `TFile`, so it's trashed by path: the system trash when available, the
 * vault's `.trash` folder otherwise.
 */
export async function trashVaultFile(app: App, path: string): Promise<boolean> {
  const normalizedPath = normalizePath(path);
  const indexed = app.vault.getAbstractFileByPath(normalizedPath);
  if (indexed) {
    if (indexed instanceof TFolder) {
      return false;
    }
    await app.fileManager.trashFile(indexed);
    return true;
  }

  const { adapter } = app.vault;
  if (!(await adapter.exists(normalizedPath))) {
    return false;
  }
  if (!(await adapter.trashSystem(normalizedPath))) {
    await adapter.trashLocal(normalizedPath);
  }
  return true;
}
