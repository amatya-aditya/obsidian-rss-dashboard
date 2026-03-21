// Stub for obsidian module in tests - currently unused but available for mocking if needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function requestUrl(_param?: any): Promise<{ status: number; text: string }> {
  throw new Error("requestUrl stub - configure mock in test if needed");
}

// Some production modules import RequestUrlParam as a runtime symbol (not type-only).
// Provide a value export to satisfy ESM imports in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const RequestUrlParam: any = {};

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

  // Minimal vault stub used by some UI helpers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vault: any = {
    on: () => ({}) as unknown,
    getRoot: () => ({ children: [] }),
  };

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

export class WorkspaceLeaf {
  app: App;
  constructor(app: App) {
    this.app = app;
  }
}

export class ItemView {
  app: App;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = leaf.app;

    // Many views assume `containerEl.children[1]` exists.
    this.containerEl = document.createElement("div");
    this.containerEl.appendChild(document.createElement("div"));
    this.containerEl.appendChild(document.createElement("div"));
  }

  // Lifecycle stubs
  onOpen(): Promise<void> {
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  // Event registration stubs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerEvent(_evt: any): void {}
}

export class TFile {}
export class TFolder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[] = [];
  path = "";
}

export class Menu {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addItem(_cb: (item: MenuItem) => any): this {
    return this;
  }
  showAtPosition(): void {}
}

export class MenuItem {
  setTitle(): this {
    return this;
  }
  setIcon(): this {
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick(_cb: (evt: any) => any): this {
    return this;
  }
}

export class Setting {
  constructor(_containerEl: HTMLElement) {}
  setName(): this {
    return this;
  }
  setDesc(): this {
    return this;
  }
  setHeading(): this {
    return this;
  }
  setClass(): this {
    return this;
  }
  setTooltip(): this {
    return this;
  }
  setDisabled(): this {
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addButton(_cb: (component: any) => any): this {
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addToggle(_cb: (component: any) => any): this {
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addText(_cb: (component: any) => any): this {
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addDropdown(_cb: (component: any) => any): this {
    return this;
  }
}

export class Modal {
  app: App;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  containerEl: any;
  constructor(app: App) {
    this.app = app;
    this.containerEl = document.createElement("div");
  }
  open(): void {}
  close(): void {}
}

export class AbstractInputSuggest<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected app: any;
  protected inputEl: HTMLInputElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(app: any, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getSuggestions(_query: string): T[] {
    return [];
  }
  renderSuggestion(_value: T, _el: HTMLElement): void {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectSuggestion(_value: T, _evt: any): void {}
  close(): void {}
}

