// =============================================================================
// Core Obsidian API Stubs
// =============================================================================
// =============================================================================

const pad = (value: number, length = 2): string =>
  String(value).padStart(length, "0");

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const shortMonthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const weekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const shortWeekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ordinalSuffix = (value: number): string => {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) {
    return "th";
  }
  switch (value % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
};

const createMoment = (input?: string | number | Date) => {
  const date =
    input instanceof Date
      ? input
      : input !== undefined
        ? new Date(input)
        : new Date();

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const month = date.getMonth();
  const day = date.getDate();
  const year = date.getFullYear();
  const weekday = date.getDay();

  return {
    format(formatStr: string): string {
      return formatStr.replace(
        /YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|Do|HH|H|hh|h|mm|m|ss|s|A|a/g,
        (token) => {
          switch (token) {
            case "YYYY":
              return String(year);
            case "YY":
              return String(year).slice(-2);
            case "MMMM":
              return monthNames[month];
            case "MMM":
              return shortMonthNames[month];
            case "MM":
              return pad(month + 1);
            case "M":
              return String(month + 1);
            case "DD":
              return pad(day);
            case "D":
              return String(day);
            case "dddd":
              return weekdayNames[weekday];
            case "ddd":
              return shortWeekdayNames[weekday];
            case "Do":
              return `${day}${ordinalSuffix(day)}`;
            case "HH":
              return pad(hours);
            case "H":
              return String(hours);
            case "hh": {
              const hour12 = hours % 12 || 12;
              return pad(hour12);
            }
            case "h": {
              const hour12 = hours % 12 || 12;
              return String(hour12);
            }
            case "mm":
              return pad(minutes);
            case "m":
              return String(minutes);
            case "ss":
              return pad(seconds);
            case "s":
              return String(seconds);
            case "A":
              return hours < 12 ? "AM" : "PM";
            case "a":
              return hours < 12 ? "am" : "pm";
            default:
              return token;
          }
        },
      );
    },
  };
};

export const moment = createMoment;

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
  json: unknown;
  text: string;
}

export interface RequestUrlResponsePromise extends Promise<RequestUrlResponse> {
  arrayBuffer: Promise<ArrayBuffer>;
  json: Promise<unknown>;
  text: Promise<string>;
}

export async function requestUrl(
  _param?: unknown,
): Promise<RequestUrlResponse> {
  throw new Error("requestUrl stub - configure mock in test if needed");
}

export const RequestUrlParam: any = {};

export const Platform = {
  isAndroidApp: false,
  // Common flags used by plugins
  isMobile: false,
  isMobileApp: false,
  isDesktop: true,
};

export function setIcon(el: HTMLElement, iconName: string): void {
  el.dataset.icon = iconName;
}

export function normalizePath(path: string): string {
  return path;
}

export function requireApiVersion(): boolean {
  return false;
}

// =============================================================================
// Mock Event System
// =============================================================================

/**
 * Mock event emitter for simulating Obsidian's event system.
 * Used for workspace events, vault events, etc.
 */
export class MockEvent {
  private handlers: Map<string, Set<(...args: unknown[]) => void>> = new Map();

  on(event: string, handler: (...args: unknown[]) => void): MockEvent {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    this.handlers.get(event)?.delete(handler);
  }

  trigger(...args: unknown[]): void {
    this.handlers.forEach((handlers) => {
      handlers.forEach((handler) => handler(...args));
    });
  }

  clear(): void {
    this.handlers.clear();
  }
}

// =============================================================================
// Mock TFile
// =============================================================================

export class TFile {
  path: string;
  basename: string;
  extension: string;
  name: string;
  stat: {
    mtime: number;
    ctime: number;
    size: number;
  };

  constructor(path: string = "/test/file.md") {
    this.path = path;
    this.basename = path.split("/").pop() || "file.md";
    this.name = this.basename;
    this.extension = "md";
    this.stat = {
      mtime: Date.now(),
      ctime: Date.now(),
      size: 1024,
    };
  }
}

// =============================================================================
// Mock TFolder
// =============================================================================

export class TFolder {
  children: (TFile | TFolder)[] = [];
  path: string;
  name: string;

  constructor(path: string = "/test") {
    this.path = path;
    this.name = path.split("/").pop() || "folder";
  }

  createFile(name: string): TFile {
    const file = new TFile(`${this.path}/${name}`);
    this.children.push(file);
    return file;
  }

  createFolder(name: string): TFolder {
    const folder = new TFolder(`${this.path}/${name}`);
    this.children.push(folder);
    return folder;
  }

  getChild(name: string): TFile | TFolder | undefined {
    return this.children.find((c) => c.name === name);
  }
}

// =============================================================================
// Mock DataVault (Enhanced)
// =============================================================================

export class MockDataVault {
  private files: Map<string, TFile> = new Map();
  private folders: Map<string, TFolder> = new Map();
  private root: TFolder;
  private adapterFiles: Map<string, string> = new Map();
  on: (name: string, callback: (...args: unknown[]) => unknown) => unknown =
    () => ({});

  // Mirror Obsidian's `vault.adapter` surface area used by this repo
  adapter: any;

  constructor() {
    this.root = new TFolder("/");
    this.folders.set("/", this.root);

    this.adapter = {
      getBasePath: () => "/test/vault",
      getFullPath: (p: string) => p,
      exists: async (path: string) =>
        this.adapterFiles.has(path) ||
        this.folders.has(path.replace(/^\/+|\/+$/g, "")),
      read: async (path: string) => this.adapterFiles.get(path) ?? "",
      write: async (path: string, content: string) => {
        this.adapterFiles.set(path, content);
      },
      on: (
        _name: string,
        _callback: (...args: unknown[]) => unknown,
      ): unknown => {
        return {};
      },
      list: async (path: string) => {
        const cleanPath = path.replace(/^\/+|\/+$/g, "");
        const prefix = cleanPath ? `${cleanPath}/` : "";

        const files = [...this.adapterFiles.keys()].filter((filePath) => {
          if (!prefix) {
            return !filePath.includes("/");
          }
          return (
            filePath.startsWith(prefix) &&
            !filePath.slice(prefix.length).includes("/")
          );
        });

        const folders = [...this.folders.keys()].filter((folderPath) => {
          if (folderPath === "/" || folderPath === cleanPath) {
            return false;
          }

          if (!prefix) {
            return !folderPath.includes("/");
          }

          return (
            folderPath.startsWith(prefix) &&
            !folderPath.slice(prefix.length).includes("/")
          );
        });

        return { files, folders };
      },
      rmdir: async (path: string, recursive: boolean) => {
        const cleanPath = path.replace(/^\/+|\/+$/g, "");
        if (
          !recursive &&
          Array.from(this.adapterFiles.keys()).some((filePath) =>
            filePath.startsWith(`${cleanPath}/`),
          )
        ) {
          throw new Error("Directory not empty");
        }

        for (const filePath of [...this.adapterFiles.keys()]) {
          if (filePath === cleanPath || filePath.startsWith(`${cleanPath}/`)) {
            this.adapterFiles.delete(filePath);
            this.files.delete(filePath);
          }
        }

        for (const folderPath of [...this.folders.keys()]) {
          if (
            folderPath === cleanPath ||
            folderPath.startsWith(`${cleanPath}/`)
          ) {
            this.folders.delete(folderPath);
          }
        }
      },
    };
  }

  async create(path: string, content: string): Promise<TFile> {
    const file = new TFile(path);
    this.files.set(path, file);
    this.adapterFiles.set(path, content);
    return file;
  }

  async read(file: TFile | string): Promise<string> {
    const path = typeof file === "string" ? file : file.path;
    return this.adapterFiles.get(path) ?? "# Test Article\n\nContent here";
  }

  async delete(file: TFile | string): Promise<void> {
    const path = typeof file === "string" ? file : file.path;
    this.files.delete(path);
    this.adapterFiles.delete(path);
  }

  async modify(_file: TFile, _content: string): Promise<void> {}

  async createFolder(folderPath: string): Promise<TFolder> {
    const cleanPath = folderPath.replace(/^\/+|\/+$/g, "");
    if (!cleanPath) return this.root;

    const existing = this.folders.get(cleanPath);
    if (existing) return existing;

    let currentPath = "";
    let parent = this.root;
    for (const part of cleanPath.split("/").filter(Boolean)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let folder = this.folders.get(currentPath);
      if (!folder) {
        folder = new TFolder(currentPath);
        parent.children.push(folder);
        this.folders.set(currentPath, folder);
      }
      parent = folder;
    }

    return parent;
  }

  async trashAbstractFile(file: TFile | TFolder): Promise<void> {
    if (file instanceof TFile) {
      await this.delete(file);
      return;
    }
    this.folders.delete(file.path);
  }

  async renameAbstractFile(file: TFile, newPath: string): Promise<void> {
    const oldPath = file.path;
    this.files.delete(oldPath);
    this.adapterFiles.delete(oldPath);

    file.path = newPath;
    file.basename = newPath.split("/").pop() || file.basename;
    file.name = file.basename;

    this.files.set(newPath, file);
  }

  getAbstractFileByPath(path: string): TFile | TFolder | null {
    return this.files.get(path) || this.folders.get(path) || null;
  }

  getRoot(): TFolder {
    return this.root;
  }

  getFiles(): TFile[] {
    return Array.from(this.files.values());
  }

  // Event system
  onResolve = new MockEvent();
  onModify = new MockEvent();
  onCreate = new MockEvent();
  onDelete = new MockEvent();
  onRename = new MockEvent();
}

// =============================================================================
// Mock Workspace
// =============================================================================

export class MockWorkspace {
  private leaves: Map<string, unknown> = new Map();
  public activeLeaf: unknown = null;
  private layoutReadyCallbacks: Array<() => void> = [];

  onLayoutChange = new MockEvent();
  onActiveLeafChange = new MockEvent();
  onWindowResize = new MockEvent();

  getLeavesOfType(_type: string): unknown[] {
    return Array.from(this.leaves.values());
  }

  getMostRecentLeaf(): unknown {
    return this.activeLeaf;
  }

  setActiveLeaf(leaf: unknown, _options?: { focus?: boolean }): void {
    this.activeLeaf = leaf;
  }

  getLeaf(_type?: "split" | "tab"): unknown {
    return {};
  }

  getLeftLeaf(_force?: boolean): unknown {
    return {};
  }

  getRightLeaf(_force?: boolean): unknown {
    return {};
  }

  onLayoutReady(callback: () => void): void {
    this.layoutReadyCallbacks.push(callback);
  }

  triggerLayoutReady(): void {
    const callbacks = [...this.layoutReadyCallbacks];
    this.layoutReadyCallbacks = [];
    callbacks.forEach((callback) => callback());
  }

  on(_name: string, _callback: (...args: any[]) => unknown): unknown {
    return {};
  }

  offref(_ref: unknown): void {}
}

// =============================================================================
// App Class (Enhanced with full mocks)
// =============================================================================

export class App {
  private localStorage = new Map<string, unknown>();

  /** Full vault mock for file operations */
  vault: MockDataVault;

  /** Minimal fileManager mock for trash/rename */
  fileManager: {
    trashFile: (file: TFile | TFolder) => Promise<void>;
    renameFile: (file: TFile, newPath: string) => Promise<void>;
  };

  /** Full workspace mock for view management */
  workspace: MockWorkspace;

  constructor() {
    this.vault = new MockDataVault();
    this.fileManager = {
      trashFile: async (file: TFile | TFolder) => {
        await this.vault.trashAbstractFile(file);
      },
      renameFile: async (file: TFile, newPath: string) => {
        await this.vault.renameAbstractFile(file, newPath);
      },
    };
    this.workspace = new MockWorkspace();
  }

  saveLocalStorage(key: string, value: unknown): void {
    this.localStorage.set(key, value);
  }

  loadLocalStorage(key: string): unknown {
    return this.localStorage.get(key);
  }

  /** Create a fresh mock App instance for tests */
  static createMock(): App {
    return new App();
  }
}

// =============================================================================
// Plugin Base Classes
// =============================================================================

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  dir?: string;
}

export class Plugin {
  app: App;
  manifest: PluginManifest;

  constructor(app: App, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
  }

  async onload(): Promise<void> {}
  onunload(): void {}

  registerView(_type: string, _creator: (leaf: any) => any): void {}

  addCommand(_command: any): void {}

  addRibbonIcon(
    _icon: string,
    _title: string,
    _callback: (...args: unknown[]) => unknown,
  ): unknown {
    return {};
  }

  addSettingTab(_tab: any): void {}

  registerInterval(id: number): number {
    return id;
  }

  // Minimal stub for Obsidian's Plugin.registerEvent to allow tests to
  // register EventRef objects without throwing. This mirrors the runtime
  // API surface used by plugins; tests do not rely on the behavior here.
  registerEvent(_evt: any): void {}

  registerObsidianProtocolHandler(
    _action: string,
    _handler: (params: Record<string, string>) => unknown,
  ): void {}

  // Data API (overridden in tests when needed)
  async loadData(): Promise<any> {
    return null;
  }
  async saveData(_data: any): Promise<void> {}
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }

  display(): void {}
  hide(): void {}
}

// =============================================================================
// UI Components
// =============================================================================

export class Notice {
  constructor(message: string, _timeout?: number) {
    console.debug("[Stub Notice]", message);
  }

  hide(): void {}
}

export class WorkspaceLeaf {
  app: App;
  constructor(app: App) {
    this.app = app;
  }

  updateHeader(): void {}
}

export class ItemView {
  app: App;
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;

  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.app = leaf.app;

    this.containerEl = document.createElement("div");
    this.containerEl.appendChild(document.createElement("div"));
    this.containerEl.appendChild(document.createElement("div"));
  }

  onOpen(): Promise<void> {
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  registerEvent(_evt: any): void {}

  registerDomEvent(
    el: HTMLElement,
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    el.addEventListener(type, callback, options);
  }
}

export class Menu {
  addSeparator(): this {
    return this;
  }
  addItem(_cb: (item: MenuItem) => void): this {
    return this;
  }
  showAtPosition(): void {}
  showAtMouseEvent(_event: MouseEvent): void {}
}

export class MenuItem {
  setTitle(): this {
    return this;
  }
  setIcon(): this {
    return this;
  }
  onClick(_cb: (evt: any) => any): this {
    return this;
  }
}

export class Setting {
  settingEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  descEl: HTMLDivElement;
  controlEl: HTMLDivElement;
  // Obsidian stores created components here; many settings tabs access it.
  components: any[] = [];

  constructor(containerEl: HTMLElement) {
    this.settingEl = document.createElement("div");
    this.settingEl.className = "setting-item";
    containerEl.appendChild(this.settingEl);

    const infoEl = document.createElement("div");
    infoEl.className = "setting-item-info";
    this.settingEl.appendChild(infoEl);

    this.nameEl = document.createElement("div");
    this.nameEl.className = "setting-item-name";
    infoEl.appendChild(this.nameEl);

    this.descEl = document.createElement("div");
    this.descEl.className = "setting-item-description";
    infoEl.appendChild(this.descEl);

    this.controlEl = document.createElement("div");
    this.controlEl.className = "setting-item-control";
    this.settingEl.appendChild(this.controlEl);
  }

  setName(_name?: string): this {
    if (_name !== undefined) {
      this.nameEl.textContent = _name;
    }
    return this;
  }
  setDesc(_desc?: string): this {
    if (_desc !== undefined) {
      this.descEl.textContent = _desc;
    }
    return this;
  }
  setHeading(): this {
    return this;
  }
  setClass(_cls?: string): this {
    return this;
  }
  setTooltip(_tooltip?: string): this {
    return this;
  }
  setDisabled(_disabled?: boolean): this {
    return this;
  }
  addButton(cb: (component: any) => any): this {
    class ButtonComponent {
      buttonEl: HTMLButtonElement;
      private clickHandler: ((evt: MouseEvent) => void) | null = null;

      constructor(container: HTMLElement) {
        this.buttonEl = document.createElement("button");
        container.appendChild(this.buttonEl);
      }

      setButtonText(text: string): this {
        this.buttonEl.textContent = text;
        return this;
      }

      setIcon(icon: string): this {
        this.buttonEl.dataset.icon = icon;
        return this;
      }

      setTooltip(tooltip: string): this {
        this.buttonEl.title = tooltip;
        return this;
      }

      onClick(handler: (evt: MouseEvent) => void): this {
        this.clickHandler = handler;
        this.buttonEl.addEventListener("click", handler);
        return this;
      }

      setCta(): this {
        this.buttonEl.classList.add("mod-cta");
        return this;
      }

      setWarning(): this {
        this.buttonEl.classList.add("mod-warning");
        return this;
      }

      _triggerClick(evt?: MouseEvent): void {
        if (this.clickHandler) {
          this.clickHandler(evt ?? new MouseEvent("click"));
        } else {
          this.buttonEl.click();
        }
      }
    }

    const component = new ButtonComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }

  addSlider(cb: (component: any) => any): this {
    class SliderComponent {
      sliderEl: HTMLInputElement;
      private changeHandler: ((value: number) => void) | null = null;

      constructor(container: HTMLElement) {
        this.sliderEl = document.createElement("input");
        this.sliderEl.type = "range";
        container.appendChild(this.sliderEl);
        this.sliderEl.addEventListener("input", () => {
          const value = Number(this.sliderEl.value);
          this.changeHandler?.(value);
        });
      }

      setLimits(min: number, max: number, step: number): this {
        this.sliderEl.min = String(min);
        this.sliderEl.max = String(max);
        this.sliderEl.step = String(step);
        return this;
      }

      setValue(value: number): this {
        this.sliderEl.value = String(value);
        return this;
      }

      setDynamicTooltip(): this {
        return this;
      }

      onChange(handler: (value: number) => void): this {
        this.changeHandler = handler;
        return this;
      }
    }

    const component = new SliderComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }

  addColorPicker(cb: (component: any) => any): this {
    class ColorComponent {
      inputEl: HTMLInputElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.inputEl = document.createElement("input");
        this.inputEl.type = "color";
        container.appendChild(this.inputEl);
        this.inputEl.addEventListener("input", () => {
          this.changeHandler?.(this.inputEl.value);
        });
      }

      setValue(value: string): this {
        this.inputEl.value = value;
        return this;
      }

      getValue(): string {
        return this.inputEl.value;
      }

      setPlaceholder(value: string): this {
        this.inputEl.placeholder = value;
        return this;
      }

      onChange(handler: (value: string) => void): this {
        this.changeHandler = handler;
        return this;
      }
    }

    const component = new ColorComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }
  addToggle(cb: (component: any) => any): this {
    class ToggleComponent {
      toggleEl: HTMLInputElement;
      private changeHandler: ((value: boolean) => void) | null = null;

      constructor(container: HTMLElement) {
        this.toggleEl = document.createElement("input");
        this.toggleEl.type = "checkbox";
        container.appendChild(this.toggleEl);
        this.toggleEl.addEventListener("change", () => {
          this.changeHandler?.(this.toggleEl.checked);
        });
      }

      setValue(value: boolean): this {
        this.toggleEl.checked = value;
        return this;
      }

      onChange(handler: (value: boolean) => void): this {
        this.changeHandler = handler;
        return this;
      }

      _triggerChange(value: boolean): void {
        this.toggleEl.checked = value;
        this.toggleEl.dispatchEvent(new Event("change"));
      }
    }

    const component = new ToggleComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }
  addText(cb: (component: any) => any): this {
    class TextComponent {
      inputEl: HTMLInputElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.inputEl = document.createElement("input");
        this.inputEl.type = "text";
        container.appendChild(this.inputEl);
        this.inputEl.addEventListener("input", () => {
          this.changeHandler?.(this.inputEl.value);
        });
      }

      setValue(value: string): this {
        this.inputEl.value = value;
        return this;
      }

      setPlaceholder(value: string): this {
        this.inputEl.placeholder = value;
        return this;
      }

      getValue(): string {
        return this.inputEl.value;
      }

      onChange(handler: (value: string) => void): this {
        this.changeHandler = handler;
        return this;
      }

      _triggerChange(value: string): void {
        this.inputEl.value = value;
        this.inputEl.dispatchEvent(new Event("input"));
      }
    }

    const component = new TextComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }
  addDropdown(cb: (component: any) => any): this {
    class DropdownComponent {
      selectEl: HTMLSelectElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.selectEl = document.createElement("select");
        container.appendChild(this.selectEl);
        this.selectEl.addEventListener("change", () => {
          this.changeHandler?.(this.selectEl.value);
        });
      }

      addOption(value: string, label: string): this {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        this.selectEl.appendChild(opt);
        return this;
      }

      setValue(value: string): this {
        this.selectEl.value = value;
        return this;
      }

      onChange(handler: (value: string) => void): this {
        this.changeHandler = handler;
        return this;
      }

      _triggerChange(value: string): void {
        this.selectEl.value = value;
        this.selectEl.dispatchEvent(new Event("change"));
      }
    }

    const component = new DropdownComponent(this.controlEl);
    this.components.push(component);
    cb(component);
    return this;
  }
}

export class TextComponent {
  inputEl: HTMLInputElement;
  private changeHandler: ((value: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.inputEl = document.createElement("input");
    this.inputEl.type = "text";
    container.appendChild(this.inputEl);
    this.inputEl.addEventListener("input", () => {
      this.changeHandler?.(this.inputEl.value);
    });
  }

  setValue(value: string): this {
    this.inputEl.value = value;
    return this;
  }

  setPlaceholder(value: string): this {
    this.inputEl.placeholder = value;
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  onChange(handler: (value: string) => void): this {
    this.changeHandler = handler;
    return this;
  }
}

export class Modal {
  app: App;
  containerEl: HTMLDivElement;
  modalEl: HTMLDivElement;
  contentEl: HTMLDivElement;
  constructor(app: App) {
    this.app = app;
    this.containerEl = document.createElement("div");
    this.containerEl.className = "modal-container";

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal";
    this.containerEl.appendChild(this.modalEl);

    this.contentEl = document.createElement("div");
    this.contentEl.className = "modal-content";
    this.modalEl.appendChild(this.contentEl);
  }

  onOpen(): void {}
  onClose(): void {}

  open(): void {
    if (!this.containerEl.isConnected) {
      document.body.appendChild(this.containerEl);
    }
    this.onOpen();
  }

  close(): void {
    this.onClose();
    this.containerEl.remove();
  }
}

export class AbstractInputSuggest<T> {
  protected app: App;
  protected inputEl: HTMLInputElement;
  constructor(app: App, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
  }

  protected getSuggestions(_query: string): T[] {
    return [];
  }
  renderSuggestion(_value: T, _el: HTMLElement): void {}
  selectSuggestion(_value: T, _evt: any): void {}
  close(): void {}
}
export class Scope {
  public handlers: Array<{
    modifiers: string[] | null;
    key: string | null;
    func: (...args: unknown[]) => void;
  }> = [];
  constructor(public parent?: Scope) {}
  register(
    modifiers: string[] | null,
    key: string | null,
    func: (...args: unknown[]) => void,
  ) {
    const handler = { modifiers, key, func };
    this.handlers.push(handler);
    return handler;
  }
  unregister(handler: {
    modifiers: string[] | null;
    key: string | null;
    func: (...args: unknown[]) => void;
  }) {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }
}
