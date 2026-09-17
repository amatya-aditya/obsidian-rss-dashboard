import type { SyncV3Status } from "../types/types";

/**
 * Renders a Sync v3 set's status as a label/value table, shared by the
 * Storage settings tab (viewing the active or a not-yet-adopted set) and
 * the storage onboarding modal (viewing a set that already exists before
 * deciding whether to join or delete it).
 */
export function renderSyncV3HealthTable(
  container: HTMLElement,
  status: SyncV3Status,
): void {
  container.empty();

  const lastLocalWrite = status.lastLocalWrite
    ? new Date(status.lastLocalWrite).toLocaleString()
    : "not yet";
  const lastIncomingMerge = status.lastIncomingMerge
    ? new Date(status.lastIncomingMerge).toLocaleString()
    : "not yet";

  const rows: [string, string][] = [
    ["Status", status.health],
    ["Shared folder", status.root],
    ["Device", status.deviceId.slice(0, 16)],
    ["Epoch", status.epochId ?? "none"],
    [
      "Replicas",
      `${status.replicaCount} (${status.invalidReplicaCount} invalid/incomplete)`,
    ],
    ["Local cache", status.localCachePath],
    ["Last local write", lastLocalWrite],
    ["Last incoming merge", lastIncomingMerge],
  ];

  const table = container.createEl("table", {
    cls: "rss-dashboard-sync-v3-health-table",
  });
  const tbody = table.createEl("tbody");
  for (const [label, value] of rows) {
    const row = tbody.createEl("tr");
    row.createEl("td", {
      text: label,
      cls: "rss-dashboard-sync-v3-health-label",
    });
    row.createEl("td", {
      text: value,
      cls: "rss-dashboard-sync-v3-health-value",
    });
  }

  const setupGuidance =
    status.health === "not-adopted"
      ? "This device is local-only until you create or join a Sync v3 set."
      : status.health === "waiting-for-primary"
        ? "This device is waiting for the primary device's replica to sync in."
        : "";
  const conflictGuidance =
    status.conflictCopyPaths.length > 0
      ? `${status.conflictCopyPaths.length} sync conflict ${status.conflictCopyPaths.length === 1 ? "copy" : "copies"} found — ` +
        "check every device's Settings → Sync → Conflict resolution is set to \"Create conflict file\", not \"Automatically merge\"."
      : "";
  const note = [setupGuidance, conflictGuidance].filter(Boolean).join(" ");
  if (note) {
    container.createEl("p", { text: note, cls: "rss-dashboard-settings-note" });
  }
}
