import { comparableSnapshotJson } from "./storage-json";

export interface SettingsGroupMerge {
  /** Memory's snapshot with every group taken from disk swapped in. */
  merged: Record<string, unknown>;
  /** Groups this device left unchanged and disk changed: disk's value. */
  adopted: string[];
  /** Groups both sides changed to different values: memory's value. */
  conflicts: string[];
}

/** One top-level group's value, compared by content with sorted keys. */
function groupJson(value: unknown): string {
  return comparableSnapshotJson({ group: value });
}

/**
 * Three-way merge of the settings file per top-level group (#1431).
 * `baseline` is what this device last wrote or loaded, `disk` is the file now,
 * and `memory` is the snapshot about to be written. Where this device left a
 * group as it was, disk's value wins; where both sides changed it, memory's
 * wins and the group is reported as a conflict. Sync bookkeeping keys are not
 * groups.
 */
export function mergeSettingsGroups(
  baseline: Record<string, unknown>,
  disk: Record<string, unknown>,
  memory: Record<string, unknown>,
): SettingsGroupMerge {
  const merged = { ...memory };
  const adopted: string[] = [];
  const conflicts: string[] = [];
  const keys = new Set([
    ...Object.keys(baseline),
    ...Object.keys(disk),
    ...Object.keys(memory),
  ]);
  keys.delete("_syncNonce");
  keys.delete("_syncPad");
  for (const key of keys) {
    const base = groupJson(baseline[key]);
    const onDisk = groupJson(disk[key]);
    if (onDisk === base) continue;
    const inMemory = groupJson(memory[key]);
    if (inMemory === onDisk) continue;
    if (inMemory === base) {
      if (disk[key] === undefined) delete merged[key];
      else merged[key] = disk[key];
      adopted.push(key);
    } else {
      conflicts.push(key);
    }
  }
  return { merged, adopted, conflicts };
}
