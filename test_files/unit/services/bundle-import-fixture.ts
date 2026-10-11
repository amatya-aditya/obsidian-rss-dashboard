import { vi } from "vitest";
import type { App } from "obsidian";
import type { FeedStorageRepository } from "../../../src/services/feed-storage-repository";
import type { RssDashboardSettings } from "../../../src/types/types";

export const BUNDLE_KINDS = ["feed", "portable"] as const;
export type BundleKind = (typeof BUNDLE_KINDS)[number];

/** Exercise the real export boundary without retaining live object references. */
export function buildBundle(
  repository: FeedStorageRepository,
  kind: BundleKind,
  settings: RssDashboardSettings,
): unknown {
  return JSON.parse(
    JSON.stringify(
      kind === "feed"
        ? repository.buildFeedBundle(settings)
        : repository.buildPortableDataBundle(settings),
    ),
  );
}

export function importBundle(
  repository: FeedStorageRepository,
  kind: BundleKind,
  bundle: unknown,
  settings: RssDashboardSettings,
  saveData: (data: unknown) => Promise<void>,
): Promise<void> {
  return kind === "feed"
    ? repository.importFeedBundle(bundle, settings, saveData)
    : repository.importPortableDataBundle(bundle, settings, saveData);
}

/** Fail the forward state write once, allowing the rollback write to succeed. */
export function failNextStateWrite(app: App, statePath: string): void {
  const write = app.vault.adapter.write.bind(app.vault.adapter);
  let failed = false;
  vi.spyOn(app.vault.adapter, "write").mockImplementation(
    async (path, data) => {
      if (path === statePath && !failed) {
        failed = true;
        throw new Error("state write failed");
      }
      await write(path, data);
    },
  );
}
