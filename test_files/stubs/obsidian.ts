// =============================================================================
// Core Obsidian API Stubs
//
// Reference version: Obsidian 1.13.7 desktop (installer 1.13.7, Electron 43.3.0).
// The stub models observed Obsidian behavior (ADR 0014). Each modeled behavior
// has an expectation in obsidian.contract.test.ts; the console probes used to
// observe it live in obsidian-console-probes.md.
// The real API's types, for checking the stub against them (#362). Type-only:
// importing it also brings in Obsidian's global DOM helper declarations.
import type * as ObsidianApi from "obsidian-api";

// =============================================================================

// `activeWindow` and `activeDocument` are declared by the real API's types.

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
              // month is always 0-11 (Date.getMonth()) and monthNames has
              // exactly 12 entries, so this index is never out of bounds;
              // the fallback only satisfies noUncheckedIndexedAccess.
              return monthNames[month] ?? String(month);
            case "MMM":
              return shortMonthNames[month] ?? String(month);
            case "MM":
              return pad(month + 1);
            case "M":
              return String(month + 1);
            case "DD":
              return pad(day);
            case "D":
              return String(day);
            case "dddd":
              // weekday is always 0-6 (Date.getDay()) and weekdayNames has
              // exactly 7 entries, so this index is never out of bounds;
              // the fallback only satisfies noUncheckedIndexedAccess.
              return weekdayNames[weekday] ?? String(weekday);
            case "ddd":
              return shortWeekdayNames[weekday] ?? String(weekday);
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

const momentStub = createMoment;

export type RequestUrlResponse = ObsidianApi.RequestUrlResponse;

export type RequestUrlResponsePromise = ObsidianApi.RequestUrlResponsePromise;

export type RequestUrlParam = ObsidianApi.RequestUrlParam;

/** What a test's fake server answers; the stub turns it into a response. */
export interface RequestUrlHandlerResult {
  status: number;
  headers?: Record<string, string>;
  text?: string;
}

export type RequestUrlHandler = (
  param: RequestUrlParam,
) => RequestUrlHandlerResult | Promise<RequestUrlHandlerResult>;

let requestUrlHandler: RequestUrlHandler | null = null;

/**
 * Test-only: set the fake server `requestUrl` talks to, or `null` to clear it.
 * Unlike mocking `requestUrl` itself, this keeps Obsidian's status handling.
 */
export function setRequestUrlHandler(handler: RequestUrlHandler | null): void {
  requestUrlHandler = handler;
}

/** Obsidian's `requestUrl` promise also exposes `.json`, `.text` and `.arrayBuffer`. */
function requestUrlImpl(
  param: RequestUrlParam | string,
): ObsidianApi.RequestUrlResponsePromise {
  const promise = requestUrlAsync(param);
  // Getters, so a rejected request doesn't also reject three unobserved promises.
  return Object.defineProperties(promise, {
    arrayBuffer: { get: () => promise.then((r) => r.arrayBuffer) },
    json: { get: () => promise.then((r) => r.json as unknown) },
    text: { get: () => promise.then((r) => r.text) },
  }) as ObsidianApi.RequestUrlResponsePromise;
}

/**
 * Models Obsidian 1.13.7: a status of 400 or above rejects with an Error
 * carrying own `status` and `headers` properties, unless `throw: false`.
 */
async function requestUrlAsync(
  param: RequestUrlParam | string,
): Promise<RequestUrlResponse> {
  if (!requestUrlHandler) {
    throw new Error("requestUrl stub - configure mock in test if needed");
  }
  const request = typeof param === "string" ? { url: param } : param;
  const result = await requestUrlHandler(request);
  const headers = result.headers ?? {};
  const text = result.text ?? "";
  if (result.status >= 400 && request.throw !== false) {
    throw Object.assign(new Error(`Request failed, status ${result.status}`), {
      status: result.status,
      headers,
    });
  }
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: result.status,
    headers,
    arrayBuffer: new TextEncoder().encode(text).buffer,
    json,
    text,
  };
}

const PlatformStub = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
  isIosApp: false,
  isAndroidApp: false,
  isPhone: false,
  isTablet: false,
  // OS flags stay false so no test depends on the machine running it.
  isMacOS: false,
  isWin: false,
  isLinux: false,
  isSafari: false,
  resourcePathPrefix: "app://local/",
};

function setIconImpl(el: HTMLElement, iconName: string): void {
  el.dataset.icon = iconName;
}

/** Mirrors Obsidian: the tooltip text is stored as the element's aria-label. */
function setTooltipImpl(el: HTMLElement, tooltip: string): void {
  el.setAttribute("aria-label", tooltip);
}

/**
 * Models Obsidian 1.13.7's `normalizePath` as read in the #372 source audit
 * (the function isn't reachable from the console; `renameFile(f, "a//r3.md")`
 * yielding "a/r3.md" confirms the slash collapse). Written independently:
 * `/` and `\` are both separators, runs of them become one `/`, leading and
 * trailing separators are trimmed, an empty result is the vault root `/`,
 * non-breaking spaces (U+00A0, U+202F) become spaces, then NFC normalization.
 */
function normalizePathImpl(path: string): string {
  const segments = path.split(/[/\\]+/).filter((segment) => segment !== "");
  const joined = segments.join("/");
  if (joined === "") return "/";
  return joined.replace(/[\u00a0\u202f]/g, " ").normalize("NFC");
}

function requireApiVersionImpl(_version: string): boolean {
  return false;
}

function renderMathImpl(source: string, display: boolean): HTMLElement {
  return createSpan({ cls: "math", text: source });
}

function finishRenderMathImpl(): Promise<void> {
  return Promise.resolve();
}

class MarkdownRendererStub {
  static render(
    _app: AppStub,
    markdown: string,
    el: HTMLElement,
    _sourcePath: string,
    _component: ComponentStub,
  ): Promise<void> {
    const doc = el.ownerDocument;
    const trimmed = markdown.trim();
    if (trimmed.startsWith("$") && trimmed.endsWith("$")) {
      const display = markdown.startsWith("$$");
      const delimiterLength = display ? 2 : 1;
      const latex = markdown.slice(delimiterLength, -delimiterLength).trim();
      const math = display
        ? doc.win.createDiv({ cls: "math math-block" })
        : doc.win.createSpan({ cls: "math math-inline" });
      const mathJax = doc.win.createEl(
        "mjx-container" as keyof HTMLElementTagNameMap,
        { text: latex },
      );
      math.appendChild(mathJax);
      el.appendChild(math);
      return Promise.resolve();
    }

    renderSimpleMarkdown(doc, markdown, el);
    return Promise.resolve();
  }
}

/**
 * Minimal markdown renderer for tests: headings, bullet lists, paragraphs, and
 * images. Enough for components that render a short markdown body; it is not a
 * general-purpose parser.
 */
function renderSimpleMarkdown(
  doc: Document,
  markdown: string,
  el: HTMLElement,
): void {
  const headingTags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
  let list: HTMLElement | null = null;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      list = null;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      list = null;
      const tag = headingTags[heading[1].length - 1];
      el.createEl(tag, { text: heading[2] });
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!list) {
        list = el.createEl("ul");
      }
      list.createEl("li", { text: bullet[1] });
      continue;
    }

    list = null;
    const paragraph = el.createEl("p");
    appendInlineMarkdown(doc, paragraph, line);
  }
}

function appendInlineMarkdown(
  doc: Document,
  parent: HTMLElement,
  text: string,
): void {
  const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = imagePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(
        doc.createTextNode(text.slice(lastIndex, match.index)),
      );
    }
    parent.createEl("img", { attr: { src: match[2], alt: match[1] } });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parent.appendChild(doc.createTextNode(text.slice(lastIndex)));
  }
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

class TFileStub {
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

class TFolderStub {
  children: (TFileStub | TFolderStub)[] = [];
  path: string;
  name: string;

  constructor(path: string = "/test") {
    this.path = path;
    this.name = path.split("/").pop() || "folder";
  }

  createFile(name: string): TFileStub {
    const file = new TFileStub(`${this.path}/${name}`);
    this.children.push(file);
    return file;
  }

  createFolder(name: string): TFolderStub {
    const folder = new TFolderStub(`${this.path}/${name}`);
    this.children.push(folder);
    return folder;
  }

  getChild(name: string): TFileStub | TFolderStub | undefined {
    return this.children.find((c) => c.name === name);
  }
}

// =============================================================================
// Mock DataVault (Enhanced)
// =============================================================================

/** Node's error for a missing path, e.g. `ENOENT: ..., open '<path>'`. */
function enoentError(syscall: string, fullPath: string): Error {
  return Object.assign(
    new Error(`ENOENT: no such file or directory, ${syscall} '${fullPath}'`),
    { code: "ENOENT" },
  );
}

/** True when any segment of `path` starts with a dot (Obsidian doesn't index it). */
function isHiddenVaultPath(path: string): boolean {
  return path.split("/").some((segment) => segment.startsWith("."));
}

interface MockVaultAdapter {
  getBasePath(): string;
  getFullPath(path: string): string;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  on(name: string, callback: (...args: unknown[]) => unknown): unknown;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
  rmdir(path: string, recursive: boolean): Promise<void>;
  remove(path: string): Promise<void>;
  trashSystem(path: string): Promise<boolean>;
  trashLocal(path: string): Promise<void>;
}

export class MockDataVault {
  private files: Map<string, TFileStub> = new Map();
  private folders: Map<string, TFolderStub> = new Map();
  private root: TFolderStub;
  private adapterFiles: Map<string, string> = new Map();
  /**
   * The vault's config folder. Users can rename it, but Obsidian only accepts
   * a dot-prefixed name, so it's always hidden from the vault index. The stub
   * uses a non-default name so tests read it rather than hardcoding it.
   */
  configDir = ".vault-config";
  /**
   * Whether the file system distinguishes paths that differ only in case.
   * Windows and macOS don't (the default, observed on Obsidian 1.13.7
   * Windows); Linux does, so set this to model a Linux desktop.
   */
  caseSensitiveFileSystem = false;
  on: (name: string, callback: (...args: unknown[]) => unknown) => unknown =
    () => ({});

  // Mirror Obsidian's `vault.adapter` surface area used by this repo
  adapter: MockVaultAdapter;

  constructor() {
    this.root = new TFolderStub("/");
    this.folders.set("/", this.root);

    this.adapter = {
      getBasePath: () => "/test/vault",
      getFullPath: (p: string) => p,
      exists: async (path: string) => this.existsOnDisk(path),
      read: async (path: string) => this.adapterFiles.get(path) ?? "",
      write: async (path: string, content: string) => {
        // Observed on Obsidian 1.13.7 desktop (Windows): a missing parent
        // folder throws Node's ENOENT, and a written file outside dot folders
        // joins the vault index.
        const parentPath = path.includes("/")
          ? path.slice(0, path.lastIndexOf("/"))
          : "";
        if (parentPath && !this.folderExistsOnDisk(parentPath)) {
          throw enoentError("open", `${this.adapter.getBasePath()}/${path}`);
        }
        this.adapterFiles.set(path, content);
        if (!this.files.has(path)) {
          this.files.set(path, new TFileStub(path));
        }
      },
      // Observed on Obsidian 1.13.7 desktop (Windows): creates missing parent
      // folders too. Not observed: mkdir on an existing folder is modeled as
      // a no-op, and the new folders join the vault index like written files.
      mkdir: async (path: string) => {
        this.makeFolders(path);
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
      remove: async (path: string) => {
        this.adapterFiles.delete(path);
        this.files.delete(path);
      },
      // Not yet observed against Obsidian: trashSystem is modeled as always
      // succeeding, and trashLocal as moving a file into the vault's `.trash`.
      trashSystem: async (path: string) => {
        this.adapterFiles.delete(path);
        this.files.delete(path);
        return true;
      },
      trashLocal: async (path: string) => {
        const content = this.adapterFiles.get(path);
        this.adapterFiles.delete(path);
        this.files.delete(path);
        if (content !== undefined) {
          const name = path.split("/").pop() ?? path;
          this.adapterFiles.set(`.trash/${name}`, content);
        }
      },
      rmdir: async (path: string, recursive: boolean) => {
        const cleanPath = path.replace(/^\/+|\/+$/g, "");
        // Desktop Obsidian implements rmdir with fs.promises.rm, which refuses
        // to remove any directory, even an empty one, unless `recursive` is
        // true.
        if (!recursive) {
          throw new Error(`EISDIR: Path is a directory: ${cleanPath}`);
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
            this.forgetFolder(folderPath);
          }
        }
      },
    };
  }

  private diskKey(path: string): string {
    const cleanPath = path.replace(/^\/+|\/+$/g, "");
    return this.caseSensitiveFileSystem ? cleanPath : cleanPath.toLowerCase();
  }

  private findFolderOnDisk(path: string): TFolderStub | undefined {
    const key = this.diskKey(path);
    for (const [folderPath, folder] of this.folders) {
      if (this.diskKey(folderPath) === key) return folder;
    }
    return undefined;
  }

  private folderExistsOnDisk(path: string): boolean {
    const key = this.diskKey(path);
    if (!key) return true;
    if (this.findFolderOnDisk(path)) return true;
    // A file written through the adapter implies its parent folders.
    return [...this.adapterFiles.keys()].some((filePath) =>
      this.diskKey(filePath).startsWith(`${key}/`),
    );
  }

  /** Whether `path` exists on disk, as the file system (not the index) sees it. */
  private existsOnDisk(path: string): boolean {
    const key = this.diskKey(path);
    return (
      [...this.adapterFiles.keys()].some(
        (filePath) => this.diskKey(filePath) === key,
      ) || this.folderExistsOnDisk(path)
    );
  }

  private forgetFolder(folderPath: string): void {
    const folder = this.folders.get(folderPath);
    this.folders.delete(folderPath);
    if (!folder) return;
    for (const parent of this.folders.values()) {
      parent.children = parent.children.filter((child) => child !== folder);
    }
  }

  async create(path: string, content: string): Promise<TFileStub> {
    // Observed on Obsidian 1.13.7 desktop: an existing path, or a case variant
    // of one on a case-insensitive file system, throws; a missing parent
    // folder throws Node's ENOENT.
    if (this.existsOnDisk(path)) {
      throw new Error("File already exists.");
    }
    const parentPath = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "";
    if (parentPath && !this.folderExistsOnDisk(parentPath)) {
      throw new Error(
        `ENOENT: no such file or directory, open '${this.adapter.getBasePath()}/${path}'`,
      );
    }
    const file = new TFileStub(path);
    this.files.set(path, file);
    this.adapterFiles.set(path, content);
    return file;
  }

  async read(file: TFileStub | string): Promise<string> {
    const path = typeof file === "string" ? file : file.path;
    return this.adapterFiles.get(path) ?? "# Test Article\n\nContent here";
  }

  async delete(file: TFileStub | string): Promise<void> {
    const path = typeof file === "string" ? file : file.path;
    this.files.delete(path);
    this.adapterFiles.delete(path);
  }

  async modify(_file: TFileStub, _content: string): Promise<void> {}

  async createFolder(folderPath: string): Promise<TFolderStub> {
    const cleanPath = folderPath.replace(/^\/+|\/+$/g, "");
    if (!cleanPath) return this.root;

    // Observed on Obsidian 1.13.7 desktop: an existing folder, or a case
    // variant of one on a case-insensitive file system, throws.
    if (this.existsOnDisk(cleanPath)) {
      throw new Error("Folder already exists.");
    }

    return this.makeFolders(cleanPath);
  }

  /**
   * Test setup, not Obsidian API: puts a folder on disk without going through
   * the adapter, so a test's adapter spy doesn't record it.
   */
  addFolderOnDisk(path: string): void {
    this.makeFolders(path);
  }

  /** Creates `path` and any missing parent folders, reusing existing ones. */
  private makeFolders(path: string): TFolderStub {
    let currentPath = "";
    let parent = this.root;
    for (const part of path.split("/").filter(Boolean)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      // Missing parents are created; an existing one is reused, whatever
      // case the caller used for it.
      let folder = this.findFolderOnDisk(currentPath);
      if (folder) {
        currentPath = folder.path;
      } else {
        folder = new TFolderStub(currentPath);
        parent.children.push(folder);
        this.folders.set(currentPath, folder);
      }
      parent = folder;
    }

    return parent;
  }

  async trashAbstractFile(file: TFileStub | TFolderStub): Promise<void> {
    if (file instanceof TFileStub) {
      await this.delete(file);
      return;
    }
    this.forgetFolder(file.path);
  }

  async renameAbstractFile(file: TFileStub, newPath: string): Promise<void> {
    const oldPath = file.path;
    this.files.delete(oldPath);
    this.adapterFiles.delete(oldPath);

    file.path = newPath;
    file.basename = newPath.split("/").pop() || file.basename;
    file.name = file.basename;

    this.files.set(newPath, file);
  }

  getAbstractFileByPath(path: string): TFileStub | TFolderStub | null {
    // Obsidian leaves anything under a dot-prefixed folder out of its vault
    // index; it exists on disk and is reachable only through the adapter.
    if (isHiddenVaultPath(path)) {
      return null;
    }
    return this.files.get(path) || this.folders.get(path) || null;
  }

  getRoot(): TFolderStub {
    return this.root;
  }

  getFiles(): TFileStub[] {
    return Array.from(this.files.values()).filter(
      (file) => !isHiddenVaultPath(file.path),
    );
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

  on(_name: string, _callback: (...args: unknown[]) => unknown): unknown {
    return {};
  }

  getActiveViewOfType(_type: unknown): unknown {
    return null;
  }

  offref(_ref: unknown): void {}
}

// =============================================================================
// App Class (Enhanced with full mocks)
// =============================================================================

class AppStub {
  private localStorage = new Map<string, unknown>();

  /** Full vault mock for file operations */
  vault: MockDataVault;

  /** Minimal fileManager mock for trash/rename */
  fileManager: {
    trashFile: (file: TFileStub | TFolderStub) => Promise<void>;
    renameFile: (file: TFileStub, newPath: string) => Promise<void>;
  };

  /** Full workspace mock for view management */
  workspace: MockWorkspace;

  constructor() {
    this.vault = new MockDataVault();
    this.fileManager = {
      trashFile: async (file: TFileStub | TFolderStub) => {
        await this.vault.trashAbstractFile(file);
      },
      renameFile: async (file: TFileStub, newPath: string) => {
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
  static createMock(): AppStub {
    return new AppStub();
  }
}

// =============================================================================
// Plugin Base Classes
// =============================================================================

export type PluginManifest = ObsidianApi.PluginManifest;

export type EventRef = ObsidianApi.EventRef;

class PluginStub {
  app: AppStub;
  manifest: PluginManifest;

  constructor(app: AppStub, manifest: PluginManifest) {
    this.app = app;
    this.manifest = manifest;
    // Obsidian loads a plugin from its folder, so the folder exists on disk.
    if (manifest.dir) {
      app.vault.addFolderOnDisk(manifest.dir);
    }
  }

  async onload(): Promise<void> {}
  onunload(): void {}

  registerView(_type: string, _creator: ObsidianApi.ViewCreator): void {}

  addCommand(command: ObsidianApi.Command): ObsidianApi.Command {
    return command;
  }

  addRibbonIcon(
    _icon: string,
    _title: string,
    _callback: (evt: MouseEvent) => unknown,
  ): HTMLElement {
    return createDiv();
  }

  addSettingTab(_tab: ObsidianApi.PluginSettingTab): void {}

  registerInterval(id: number): number {
    return id;
  }

  // Minimal stub for Obsidian's Plugin.registerEvent to allow tests to
  // register EventRef objects without throwing. This mirrors the runtime
  // API surface used by plugins; tests do not rely on the behavior here.
  registerEvent(_evt: EventRef): void {}

  registerObsidianProtocolHandler(
    _action: string,
    _handler: ObsidianApi.ObsidianProtocolHandler,
  ): void {}

  // Data API (overridden in tests when needed)
  async loadData(): Promise<unknown> {
    return null;
  }
  async saveData(_data: unknown): Promise<void> {}
}

class PluginSettingTabStub {
  app: AppStub;
  plugin: PluginStub;
  containerEl: HTMLElement;

  constructor(app: AppStub, plugin: PluginStub) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = createDiv();
  }

  display(): void {}
  hide(): void {}
}

// =============================================================================
// UI Components
// =============================================================================

class NoticeStub {
  constructor(message: string, _timeout?: number) {
    console.debug("[Stub Notice]", message);
  }

  hide(): void {}
}

class WorkspaceLeafStub {
  /** Type-only: tests assign views; nothing is set at runtime. */
  declare view: unknown;
  app: AppStub;
  constructor(app: AppStub) {
    this.app = app;
  }

  updateHeader(): void {}
}

class ComponentStub {
  private children = new Set<ObsidianApi.Component>();

  load(): void {
    this.onload();
    this.children.forEach((child) => child.load());
  }

  onload(): void {}

  unload(): void {
    this.children.forEach((child) => child.unload());
    this.children.clear();
    this.onunload();
  }

  onunload(): void {}

  addChild<T extends ObsidianApi.Component>(component: T): T {
    this.children.add(component);
    return component;
  }

  removeChild<T extends ObsidianApi.Component>(component: T): T {
    if (this.children.delete(component)) {
      component.unload();
    }
    return component;
  }

  register(_cb: () => unknown): void {}
}

class ItemViewStub extends ComponentStub {
  app: AppStub;
  leaf: WorkspaceLeafStub;
  containerEl: HTMLElement;

  constructor(leaf: WorkspaceLeafStub) {
    super();
    this.leaf = leaf;
    this.app = leaf.app;

    this.containerEl = createDiv();
    this.containerEl.createDiv();
    this.containerEl.createDiv();
  }

  onOpen(): Promise<void> {
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  registerEvent(_evt: EventRef): void {}

  registerDomEvent(
    el: HTMLElement,
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    el.addEventListener(type, callback, options);
  }
}

class MenuStub {
  static lastItems: MenuItemStub[] = [];

  constructor() {
    MenuStub.lastItems = [];
  }

  addSeparator(): this {
    return this;
  }
  addItem(cb: (item: ObsidianApi.MenuItem) => unknown): this {
    const item = new MenuItemStub();
    cb(item as unknown as ObsidianApi.MenuItem);
    MenuStub.lastItems.push(item);
    return this;
  }
  showAtPosition(): void {}
  showAtMouseEvent(_event: MouseEvent): void {}
}

class MenuItemStub {
  title = "";
  callback: ((evt: MouseEvent) => unknown) | undefined;

  setTitle(title: string | DocumentFragment): this {
    this.title = typeof title === "string" ? title : (title.textContent ?? "");
    return this;
  }
  setIcon(): this {
    return this;
  }
  onClick(cb: (evt: MouseEvent) => unknown): this {
    this.callback = cb;
    return this;
  }

  trigger(): unknown {
    return this.callback?.(new MouseEvent("click"));
  }
}

type SettingComponent = object;

class SettingStub {
  settingEl: HTMLDivElement;
  nameEl: HTMLDivElement;
  descEl: HTMLDivElement;
  controlEl: HTMLDivElement;
  // Obsidian stores created components here; many settings tabs access it.
  components: SettingComponent[] = [];

  /**
   * Records a stub component and hands it to the caller's callback, which is
   * typed for the real Obsidian component.
   */
  private attach<C>(
    component: SettingComponent,
    cb: (component: C) => unknown,
  ): this {
    this.components.push(component);
    cb(component as C);
    return this;
  }

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
    const infoEl = this.settingEl.createDiv({ cls: "setting-item-info" });
    this.nameEl = infoEl.createDiv({ cls: "setting-item-name" });
    this.descEl = infoEl.createDiv({ cls: "setting-item-description" });
    this.controlEl = this.settingEl.createDiv({ cls: "setting-item-control" });
  }

  setName(_name?: string | DocumentFragment): this {
    if (typeof _name === "string") {
      this.nameEl.textContent = _name;
    } else if (_name !== undefined) {
      this.nameEl.empty();
      this.nameEl.appendChild(_name);
    }
    return this;
  }
  setDesc(_desc?: string | DocumentFragment): this {
    if (_desc !== undefined) {
      this.descEl.empty();
      if (_desc instanceof DocumentFragment) {
        this.descEl.appendChild(_desc);
      } else {
        this.descEl.textContent = _desc;
      }
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
  addButton(cb: (component: ObsidianApi.ButtonComponent) => unknown): this {
    class ButtonComponent {
      buttonEl: HTMLButtonElement;
      private clickHandler: ((evt: MouseEvent) => void) | null = null;

      constructor(container: HTMLElement) {
        this.buttonEl = container.createEl("button");
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
        this.buttonEl.setAttribute("aria-label", tooltip);
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

      setDestructive(): this {
        this.buttonEl.classList.add("mod-destructive");
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
    return this.attach(component, cb);
  }

  addExtraButton(
    cb: (component: ObsidianApi.ExtraButtonComponent) => unknown,
  ): this {
    return this.addButton((component) =>
      cb(component as unknown as ObsidianApi.ExtraButtonComponent),
    );
  }

  addSlider(cb: (component: ObsidianApi.SliderComponent) => unknown): this {
    class SliderComponent {
      sliderEl: HTMLInputElement;
      private changeHandler: ((value: number) => void) | null = null;

      constructor(container: HTMLElement) {
        this.sliderEl = container.createEl("input", { type: "range" });
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

      getValue(): number {
        return Number(this.sliderEl.value);
      }

      setDisplayFormat(_format: (value: number) => string): this {
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
    return this.attach(component, cb);
  }

  addColorPicker(cb: (component: ObsidianApi.ColorComponent) => unknown): this {
    class ColorComponent {
      inputEl: HTMLInputElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.inputEl = container.createEl("input", { type: "color" });
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
    return this.attach(component, cb);
  }
  addToggle(cb: (component: ObsidianApi.ToggleComponent) => unknown): this {
    class ToggleComponent {
      toggleEl: HTMLInputElement;
      private changeHandler: ((value: boolean) => void) | null = null;

      constructor(container: HTMLElement) {
        this.toggleEl = container.createEl("input", { type: "checkbox" });
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
    return this.attach(component, cb);
  }
  addText(cb: (component: ObsidianApi.TextComponent) => unknown): this {
    class TextComponent {
      inputEl: HTMLInputElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.inputEl = container.createEl("input", { type: "text" });
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
    return this.attach(component, cb);
  }
  addDropdown(cb: (component: ObsidianApi.DropdownComponent) => unknown): this {
    class DropdownComponent {
      selectEl: HTMLSelectElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.selectEl = container.createEl("select");
        this.selectEl.addEventListener("change", () => {
          this.changeHandler?.(this.selectEl.value);
        });
      }

      addOption(value: string, label: string): this {
        this.selectEl.createEl("option", { value, text: label });
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
    return this.attach(component, cb);
  }
}

class TextComponentStub {
  inputEl: HTMLInputElement;
  private changeHandler: ((value: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.inputEl = container.createEl("input", { type: "text" });
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

class ModalStub {
  app: AppStub;
  scope: ScopeStub;
  containerEl: HTMLDivElement;
  modalEl: HTMLDivElement;
  /** Not in obsidian.d.ts (1.13.1), but present in 1.13.7. */
  headerEl: HTMLDivElement;
  titleEl: HTMLDivElement;
  contentEl: HTMLDivElement;
  constructor(app: AppStub) {
    this.app = app;
    this.scope = new ScopeStub();
    // Observed on Obsidian 1.13.7 desktop (Windows): containerEl is
    // `modal-container mod-dim`, and modalEl holds the close button, the
    // header (with the title), and the content, in that order.
    this.containerEl = createDiv({ cls: "modal-container mod-dim" });
    this.modalEl = this.containerEl.createDiv({ cls: "modal" });
    const closeButton = this.modalEl.createDiv({
      cls: "modal-header-button mod-raised clickable-icon",
    });
    closeButton.addEventListener("click", () => this.close());
    this.headerEl = this.modalEl.createDiv({ cls: "modal-header" });
    this.titleEl = this.headerEl.createDiv({ cls: "modal-title" });
    this.contentEl = this.modalEl.createDiv({ cls: "modal-content" });
  }

  setTitle(title: string): this {
    this.titleEl.setText(title);
    return this;
  }

  onOpen(): void {}
  onClose(): void {}

  open(): void {
    if (!this.containerEl.isConnected) {
      activeDocument.body.appendChild(this.containerEl);
    }
    this.onOpen();
  }

  close(): void {
    // Observed on Obsidian 1.13.7 desktop (Windows): the container is
    // detached before onClose runs, synchronously.
    this.containerEl.remove();
    this.onClose();
  }
}

class AbstractInputSuggestStub<T> {
  app: AppStub;
  protected inputEl: HTMLInputElement;
  constructor(app: AppStub, inputEl: HTMLInputElement) {
    this.app = app;
    this.inputEl = inputEl;
  }

  protected getSuggestions(_query: string): T[] {
    return [];
  }
  renderSuggestion(_value: T, _el: HTMLElement): void {}
  selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {}
  close(): void {}
}
class ScopeStub {
  public handlers: ObsidianApi.KeymapEventHandler[] = [];
  constructor(public parent?: ScopeStub) {}
  register(
    modifiers: ObsidianApi.Modifier[] | null,
    key: string | null,
    func: ObsidianApi.KeymapEventListener,
  ): ObsidianApi.KeymapEventHandler {
    // Not yet observed: real Obsidian stores `modifiers` as a string; the stub
    // keeps the array that tests inspect (Track B, #372).
    const handler = {
      scope: this,
      modifiers,
      key,
      func,
    } as unknown as ObsidianApi.KeymapEventHandler;
    this.handlers.push(handler);
    return handler;
  }
  unregister(handler: ObsidianApi.KeymapEventHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }
}

// =============================================================================
// Exports typed as the real API (#362)
//
// Production code sees Obsidian's own types; at runtime it gets the stub
// classes above. `StubMatches` checks at compile time that every method a
// stub defines accepts the real method's parameters, so a mistyped stub
// member fails to compile. A member the stub lacks fails the test that
// needs it, at runtime.
// =============================================================================

/** Each member the stub defines accepts the real member's parameters. */
type StubShape<Real> = {
  [K in keyof Real]?: Real[K] extends (...args: infer A) => unknown
    ? (...args: A) => unknown
    : unknown;
};
type StubMatches<Real, Stub extends StubShape<Real>> = Stub;

export const moment = momentStub as unknown as typeof ObsidianApi.moment;
export const Platform: typeof ObsidianApi.Platform = PlatformStub;
export const requestUrl: typeof ObsidianApi.requestUrl = requestUrlImpl;
export const setIcon: typeof ObsidianApi.setIcon = setIconImpl;
export const setTooltip: typeof ObsidianApi.setTooltip = setTooltipImpl;
export const normalizePath: typeof ObsidianApi.normalizePath =
  normalizePathImpl;
export const requireApiVersion: typeof ObsidianApi.requireApiVersion =
  requireApiVersionImpl;
export const renderMath: typeof ObsidianApi.renderMath = renderMathImpl;
export const finishRenderMath: typeof ObsidianApi.finishRenderMath =
  finishRenderMathImpl;
export type ObsidianProtocolData = ObsidianApi.ObsidianProtocolData;
export type ButtonComponent = ObsidianApi.ButtonComponent;
export type { MenuItemStub };

export type MarkdownRenderer = ObsidianApi.MarkdownRenderer;
export const MarkdownRenderer =
  MarkdownRendererStub as unknown as typeof ObsidianApi.MarkdownRenderer;
export type TFile = ObsidianApi.TFile;
export const TFile = TFileStub as unknown as typeof ObsidianApi.TFile;
export type TFolder = ObsidianApi.TFolder;
export const TFolder = TFolderStub as unknown as typeof ObsidianApi.TFolder;
export type App = ObsidianApi.App;
/** Tests get the real `App` type plus the stub's mock helpers (`app.vault` etc.). */
export type MockApp = ObsidianApi.App & AppStub;
export const App = AppStub as unknown as {
  new (): MockApp;
  createMock(): MockApp;
} & typeof ObsidianApi.App;
export type Plugin = ObsidianApi.Plugin;
export const Plugin = PluginStub as unknown as typeof ObsidianApi.Plugin;
export type PluginSettingTab = ObsidianApi.PluginSettingTab;
export const PluginSettingTab =
  PluginSettingTabStub as unknown as typeof ObsidianApi.PluginSettingTab;
export type Notice = ObsidianApi.Notice;
export const Notice = NoticeStub as unknown as typeof ObsidianApi.Notice;
export type WorkspaceLeaf = ObsidianApi.WorkspaceLeaf;
export const WorkspaceLeaf =
  WorkspaceLeafStub as unknown as typeof ObsidianApi.WorkspaceLeaf;
export type Component = ObsidianApi.Component;
export const Component =
  ComponentStub as unknown as typeof ObsidianApi.Component;
export type ItemView = ObsidianApi.ItemView;
export const ItemView = ItemViewStub as unknown as typeof ObsidianApi.ItemView;
export type Menu = ObsidianApi.Menu;
export const Menu = MenuStub as unknown as typeof ObsidianApi.Menu & {
  /** Test-only: the items added to the most recently created menu. */
  lastItems: MenuItemStub[];
};
export type MenuItem = ObsidianApi.MenuItem;
export const MenuItem = MenuItemStub as unknown as typeof ObsidianApi.MenuItem;
export type Setting = ObsidianApi.Setting;
export const Setting = SettingStub as unknown as typeof ObsidianApi.Setting;
export type TextComponent = ObsidianApi.TextComponent;
export const TextComponent =
  TextComponentStub as unknown as typeof ObsidianApi.TextComponent;
export type Modal = ObsidianApi.Modal;
export const Modal = ModalStub as unknown as typeof ObsidianApi.Modal;
export type AbstractInputSuggest<T> = ObsidianApi.AbstractInputSuggest<T>;
export const AbstractInputSuggest =
  AbstractInputSuggestStub as unknown as typeof ObsidianApi.AbstractInputSuggest;
export type Scope = ObsidianApi.Scope;
export const Scope = ScopeStub as unknown as typeof ObsidianApi.Scope;

/** Compile-time checks only; see `StubMatches`. */
export type StubSignatureChecks = [
  StubMatches<ObsidianApi.MarkdownRenderer, MarkdownRendererStub>,
  StubMatches<ObsidianApi.TFile, TFileStub>,
  StubMatches<ObsidianApi.TFolder, TFolderStub>,
  StubMatches<ObsidianApi.App, AppStub>,
  StubMatches<ObsidianApi.Plugin, PluginStub>,
  StubMatches<ObsidianApi.PluginSettingTab, PluginSettingTabStub>,
  StubMatches<ObsidianApi.Notice, NoticeStub>,
  StubMatches<ObsidianApi.WorkspaceLeaf, WorkspaceLeafStub>,
  StubMatches<ObsidianApi.Component, ComponentStub>,
  StubMatches<ObsidianApi.ItemView, ItemViewStub>,
  StubMatches<ObsidianApi.Menu, MenuStub>,
  StubMatches<ObsidianApi.MenuItem, MenuItemStub>,
  StubMatches<ObsidianApi.Setting, SettingStub>,
  StubMatches<ObsidianApi.TextComponent, TextComponentStub>,
  StubMatches<ObsidianApi.Modal, ModalStub>,
  StubMatches<
    ObsidianApi.AbstractInputSuggest<unknown>,
    AbstractInputSuggestStub<unknown>
  >,
  StubMatches<ObsidianApi.Scope, ScopeStub>,
];
