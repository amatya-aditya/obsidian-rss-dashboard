import type { Folder } from "../types/types";

export function collectFolderPaths(
  folders: Folder[],
  options?: { sort?: boolean },
): string[] {
  const paths: string[] = [];

  const collect = (current: Folder[], base: string): void => {
    for (const folder of current) {
      const path = base ? `${base}/${folder.name}` : folder.name;
      paths.push(path);
      if (folder.subfolders && folder.subfolders.length > 0) {
        collect(folder.subfolders, path);
      }
    }
  };

  collect(folders, "");

  if (options?.sort) {
    paths.sort((a, b) => a.localeCompare(b));
  }

  return paths;
}

