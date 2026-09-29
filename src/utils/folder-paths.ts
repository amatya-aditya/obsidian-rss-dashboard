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

/** Removes every leading and trailing "/" from `path`. */
export function trimSurroundingSlashes(path: string): string {
  let start = 0;
  let end = path.length;
  while (start < end && path.charCodeAt(start) === 47) start++;
  while (end > start && path.charCodeAt(end - 1) === 47) end--;
  return path.slice(start, end);
}
