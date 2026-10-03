import type { App } from "obsidian";

type VaultLocalStorageApi = {
  loadLocalStorage?: (key: string) => unknown;
  saveLocalStorage?: (key: string, value: unknown) => void;
  vault?: { getName?: () => string };
};

function getFallbackKey(app: App, key: string): string {
  const appWithOptionalStorage = app as unknown as VaultLocalStorageApi;
  const vaultName = appWithOptionalStorage.vault?.getName?.() ?? "default";
  return `rss-dashboard:${vaultName}:${key}`;
}

/**
 * Reads vault-scoped UI state on every supported Obsidian version.
 *
 * Obsidian's native vault local-storage API was added in 1.8.7. Older hosts
 * use the browser store, namespaced by vault, while retaining synchronous
 * behavior for the existing callers.
 */
export function loadVaultLocalStorage(app: App, key: string): unknown {
  const appWithOptionalStorage = app as unknown as VaultLocalStorageApi;
  if (typeof appWithOptionalStorage.loadLocalStorage === "function") {
    return appWithOptionalStorage.loadLocalStorage(key);
  }

  try {
    const stored = window.localStorage.getItem(getFallbackKey(app, key));
    return stored === null ? null : JSON.parse(stored);
  } catch {
    return null;
  }
}

/** Writes vault-scoped UI state without requiring Obsidian 1.8.7+. */
export function saveVaultLocalStorage(
  app: App,
  key: string,
  value: unknown,
): void {
  const appWithOptionalStorage = app as unknown as VaultLocalStorageApi;
  if (typeof appWithOptionalStorage.saveLocalStorage === "function") {
    appWithOptionalStorage.saveLocalStorage(key, value);
    return;
  }

  try {
    const fallbackKey = getFallbackKey(app, key);
    if (value === null) {
      window.localStorage.removeItem(fallbackKey);
    } else {
      window.localStorage.setItem(fallbackKey, JSON.stringify(value));
    }
  } catch {
    // The calling UI can continue if browser storage is unavailable.
  }
}
