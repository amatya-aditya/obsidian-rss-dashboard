import type { Folder } from "../types/types";

export function removeFolderByPath(folders: Folder[], folderPath: string): Folder[] {
  const parts = folderPath.split("/").filter(Boolean);
  if (parts.length === 0) return folders;

  const removeAt = (current: Folder[], index: number): Folder[] => {
    const target = parts[index];
    const isLeaf = index === parts.length - 1;

    let changed = false;
    const next: Folder[] = [];

    for (const f of current) {
      if (f.name !== target) {
        next.push(f);
        continue;
      }

      if (isLeaf) {
        changed = true;
        continue; // drop it
      }

      const updatedSubfolders = removeAt(f.subfolders ?? [], index + 1);
      if (updatedSubfolders !== f.subfolders) {
        changed = true;
        next.push({ ...f, subfolders: updatedSubfolders });
      } else {
        next.push(f);
      }
    }

    return changed ? next : current;
  };

  return removeAt(folders, 0);
}

