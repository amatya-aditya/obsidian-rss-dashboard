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

/**
 * Finds the indexed child folder of `parent` named `name`, preferring an exact
 * match and otherwise one that differs only in case.
 */
function findChildFolder(parent: TFolder, name: string): TFolder | null {
  let caseVariant: TFolder | null = null;
  const lowerName = name.toLowerCase();
  for (const child of parent.children) {
    if (!(child instanceof TFolder)) continue;
    if (child.name === name) return child;
    if (!caseVariant && child.name.toLowerCase() === lowerName) {
      caseVariant = child;
    }
  }
  return caseVariant;
}

/**
 * Makes sure the folder at `path` exists, creating each missing segment, and
 * returns the folder's path as it is on disk.
 *
 * `createFolder` throws for a folder that already exists, including one whose
 * name differs only in case on Windows and macOS, where the file system
 * ignores case but the vault index doesn't. So each segment is checked on
 * disk first. When the disk already has it, the existing folder's own
 * spelling is reused, so callers build file paths the vault index knows. On
 * a case-sensitive file system (Linux) a case variant doesn't exist on disk,
 * so a separate folder is created, as the user typed it.
 */
export async function ensureVaultFolder(app: App, path: string): Promise<string> {
  const segments = normalizePath(path)
    .split("/")
    .filter((segment) => segment !== "");
  const { vault } = app;
  let resolved = "";
  let parent: TFolder | null = vault.getRoot();

  for (const segment of segments) {
    const candidate = resolved ? `${resolved}/${segment}` : segment;
    const exact = vault.getAbstractFileByPath(candidate);
    if (exact instanceof TFolder) {
      resolved = exact.path;
      parent = exact;
      continue;
    }

    if (await vault.adapter.exists(candidate)) {
      // On disk but not indexed under this spelling: a case variant, or a
      // dot-prefixed folder the vault index leaves out.
      const variant: TFolder | null = parent
        ? findChildFolder(parent, segment)
        : null;
      resolved = variant ? variant.path : candidate;
      parent = variant;
      continue;
    }

    try {
      await vault.createFolder(candidate);
    } catch (error) {
      // Another writer (or sync) may have created it in the meantime.
      if (!(await vault.adapter.exists(candidate))) {
        throw error;
      }
    }
    resolved = candidate;
    const created = vault.getAbstractFileByPath(candidate);
    parent = created instanceof TFolder ? created : null;
  }

  return resolved;
}
