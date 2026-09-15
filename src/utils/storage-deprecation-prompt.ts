import type { RssDashboardSettings } from "../types/types";

/** Release that turns the deprecated storage modes read-only. */
export const DEPRECATION_TRIGGER_RELEASE = "3.0";

/**
 * Deferrals allowed before the prompt stops offering to skip a version. The
 * prompt can still be postponed to the next load after this, just not silenced
 * for a whole release.
 */
export const MAX_VERSION_DEFERRALS = 3;

type DeprecationPromptSettings = Pick<
  RssDashboardSettings,
  "storageMode" | "storageMigrationDismissedUntil"
>;

function toNumericParts(version: string): number[] {
  const core = version.split("-")[0] ?? "";
  return core.split(".").map((part) => {
    const value = Number(part);
    return Number.isFinite(value) ? value : 0;
  });
}

/**
 * Orders two plugin versions, ignoring any prerelease suffix so that a beta of
 * a release counts as having reached it.
 */
export function compareVersions(left: string, right: string): number {
  const leftParts = toNumericParts(left);
  const rightParts = toNumericParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

export function nextMinorVersion(version: string): string {
  const parts = toNumericParts(version);
  return `${parts[0] ?? 0}.${(parts[1] ?? 0) + 1}.0`;
}

export function isDeprecatedStorageMode(
  mode: RssDashboardSettings["storageMode"],
): boolean {
  return mode === "legacy-json" || mode === "vault-shards";
}

export function shouldShowStorageDeprecationPrompt(
  settings: DeprecationPromptSettings,
  currentVersion: string,
): boolean {
  if (!isDeprecatedStorageMode(settings.storageMode)) {
    return false;
  }

  const dismissedUntil = settings.storageMigrationDismissedUntil;
  if (!dismissedUntil) {
    return true;
  }

  return compareVersions(currentVersion, dismissedUntil) >= 0;
}

export function canDeferByVersion(deferralCount: number | undefined): boolean {
  return (deferralCount ?? 0) < MAX_VERSION_DEFERRALS;
}

export function describeStorageMode(
  mode: RssDashboardSettings["storageMode"],
): string {
  if (mode === "legacy-json") {
    return "legacy JSON";
  }
  if (mode === "vault-shards") {
    return "shard storage v1";
  }
  return "shard storage v2";
}
