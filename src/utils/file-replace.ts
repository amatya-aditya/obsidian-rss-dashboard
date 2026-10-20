import type { App } from "obsidian";

/**
 * Moves a completed sibling temporary file onto its destination path.
 *
 * On Obsidian 1.14.4 desktop (Windows) `adapter.rename` refuses a destination
 * that already exists with "Destination file already exists!", unlike Node's
 * `fs.rename`. Every snapshot and journal rewrite replaces an existing file, so
 * remove the destination first and then rename the complete temporary file into
 * place. The temporary file stays whole until the rename, so a failure leaves
 * the new content recoverable next to the old path (#1380).
 */
export async function replaceFileWithTemp(
  adapter: App["vault"]["adapter"],
  tempPath: string,
  path: string,
): Promise<void> {
  if (await adapter.exists(path)) {
    await adapter.remove(path);
  }
  await adapter.rename(tempPath, path);
}
