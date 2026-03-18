// Stub for obsidian module in tests - currently unused but available for mocking if needed
export async function requestUrl(): Promise<{ status: number; text: string }> {
  throw new Error("requestUrl stub - configure mock in test if needed");
}

export const Platform = {
  isAndroidApp: false,
};

export function setIcon(el: HTMLElement, iconName: string): void {
  el.dataset.icon = iconName;
}

export function requireApiVersion(): boolean {
  return false;
}

export class App {
  private localStorage = new Map<string, unknown>();

  saveLocalStorage(key: string, value: unknown): void {
    this.localStorage.set(key, value);
  }

  loadLocalStorage(key: string): unknown {
    return this.localStorage.get(key);
  }
}

export class Notice {
  constructor(message: string, timeout?: number) {
    console.log("[Stub Notice]", message);
  }
}

