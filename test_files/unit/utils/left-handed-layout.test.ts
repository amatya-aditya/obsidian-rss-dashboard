import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import {
  LEFT_HANDED_LAYOUT_STORAGE_KEY,
  loadLeftHandedLayout,
  saveLeftHandedLayout,
} from "../../../src/utils/left-handed-layout";
import { DEFAULT_SETTINGS } from "../../../src/types/types";
import { ImportExportService } from "../../../src/services/import-export-service";

/** Minimal fake: only the vault-local storage surface the helper reads. */
function createApp(): App {
  const store = new Map<string, unknown>();
  return {
    vault: { getName: () => "left-handed-layout-test-vault" },
    loadLocalStorage: (key: string) => (store.has(key) ? store.get(key) : null),
    saveLocalStorage: (key: string, value: unknown) => {
      store.set(key, value);
    },
  } as unknown as App;
}

describe("left-handed layout per-device value", () => {
  it("defaults to off when nothing is stored", () => {
    expect(loadLeftHandedLayout(createApp())).toBe(false);
  });

  it("round-trips the value through vault-local storage under the namespaced key", () => {
    const app = createApp();

    saveLeftHandedLayout(app, true);
    expect(app.loadLocalStorage(LEFT_HANDED_LAYOUT_STORAGE_KEY)).toBe(true);
    expect(loadLeftHandedLayout(app)).toBe(true);

    saveLeftHandedLayout(app, false);
    expect(loadLeftHandedLayout(app)).toBe(false);
  });

  it("treats a malformed stored value as off", () => {
    const app = createApp();
    app.saveLocalStorage(LEFT_HANDED_LAYOUT_STORAGE_KEY, "true");

    expect(loadLeftHandedLayout(app)).toBe(false);
  });

  it("never writes the value into the synced settings or the preferences export", () => {
    expect(JSON.stringify(DEFAULT_SETTINGS)).not.toContain(
      LEFT_HANDED_LAYOUT_STORAGE_KEY,
    );

    const service = new ImportExportService({
      settings: DEFAULT_SETTINGS,
      isMobile: false,
    });

    expect(service.getUserSettingsJson()).not.toContain(
      LEFT_HANDED_LAYOUT_STORAGE_KEY,
    );
  });
});
