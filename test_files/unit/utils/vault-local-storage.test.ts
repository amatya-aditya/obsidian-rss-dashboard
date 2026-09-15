import { describe, expect, it } from "vitest";
import {
  loadVaultLocalStorage,
  saveVaultLocalStorage,
} from "../../../src/utils/vault-local-storage";

function createApp(overrides: Record<string, unknown> = {}) {
  return {
    vault: {
      getName: () => "compatibility-test-vault",
    },
    ...overrides,
  };
}

describe("vault local-storage compatibility", () => {
  it("uses Obsidian's vault-local storage API when it is available", () => {
    const calls: unknown[][] = [];
    const app = createApp({
      loadLocalStorage: (key: string) => {
        calls.push(["load", key]);
        return { saved: true };
      },
      saveLocalStorage: (key: string, value: unknown) => {
        calls.push(["save", key, value]);
      },
    });

    expect(loadVaultLocalStorage(app, "state")).toEqual({ saved: true });
    saveVaultLocalStorage(app, "state", { changed: true });

    expect(calls).toEqual([
      ["load", "state"],
      ["save", "state", { changed: true }],
    ]);
  });

  it("falls back to browser storage when the old Obsidian API is absent", () => {
    window.localStorage.clear();
    const app = createApp();

    saveVaultLocalStorage(app, "state", { saved: true });

    expect(loadVaultLocalStorage(app, "state")).toEqual({ saved: true });
  });

  it("removes fallback values when saving null", () => {
    window.localStorage.clear();
    const app = createApp();

    saveVaultLocalStorage(app, "state", { saved: true });
    saveVaultLocalStorage(app, "state", null);

    expect(loadVaultLocalStorage(app, "state")).toBeNull();
  });
});
