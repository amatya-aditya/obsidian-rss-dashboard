// =============================================================================
// Core Obsidian API Stubs
//
// Reference version: Obsidian 1.14.4 desktop (installer 1.14.4, Electron
// 43.7.7). The renderer can update in place ahead of the installer, so pin both
// by running the `Obsidian-1.14.4.exe` installer from `obsidian-releases` (see
// obsidian-console-probes.md); re-observed on the matched 1.14.4 install.
// The stub models observed Obsidian behavior (ADR 0014). Each modeled behavior
// has an expectation in obsidian.contract.test.ts; the console probes used to
// observe it live in obsidian-console-probes.md.
// The real API's types, for checking the stub against them (#362). Type-only:
// importing it also brings in Obsidian's global DOM helper declarations.
import type * as ObsidianApi from "obsidian-api";
import { renderIconMarkup } from "./lucide-icons";

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

// The two-letter weekday names moment's `dd` token produces, in `getDay()`
// order (Sunday first).
const minWeekdayNames = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// moment's localized formats in its `en` locale, as the tokens each expands
// to. Only `en` is modeled (#431); another locale is documented as unmodeled
// in `obsidian-console-probes.md`.
const localizedMomentFormats: Record<string, string> = {
  L: "MM/DD/YYYY",
  LL: "MMMM D, YYYY",
  LLL: "MMMM D, YYYY h:mm A",
  LLLL: "dddd, MMMM D, YYYY h:mm A",
  LT: "h:mm A",
  LTS: "h:mm:ss A",
};

// Every format token the stub models. Real moment matches the longest token
// at each position, so scanning longest-first reproduces it. The tokens left
// out (`Z`/`ZZ`, `DDD`/`DDDD`, `w`/`W` week tokens, `gggg`/`GGGG`, `e`/`E`,
// `k`/`kk`, `N`, `l`/`ll`, and so on) are documented as unmodeled in
// `obsidian-console-probes.md`.
const momentFormatTokens = [
  "YYYY",
  "YY",
  "MMMM",
  "MMM",
  "MM",
  "M",
  "Mo",
  "DD",
  "D",
  "Do",
  "dddd",
  "ddd",
  "dd",
  "d",
  "HH",
  "H",
  "hh",
  "h",
  "mm",
  "m",
  "ss",
  "s",
  "SSS",
  "SS",
  "S",
  "A",
  "a",
  "Q",
  "X",
  "x",
  "LTS",
  "LT",
  "LLLL",
  "LLL",
  "LL",
  "L",
].sort((a, b) => b.length - a.length);

/** The modeled token at `index`, or null when none starts there. */
function matchMomentToken(input: string, index: number): string | null {
  for (const token of momentFormatTokens) {
    if (input.startsWith(token, index)) {
      return token;
    }
  }
  return null;
}

/** One modeled token's value for `date`. */
function formatMomentToken(token: string, date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const milliseconds = date.getMilliseconds();
  const month = date.getMonth();
  const day = date.getDate();
  const year = date.getFullYear();
  const weekday = date.getDay();

  switch (token) {
    case "YYYY":
      return String(year);
    case "YY":
      return String(year).slice(-2);
    case "MMMM":
      // month is always 0-11 (Date.getMonth()) and monthNames has exactly 12
      // entries, so this index is never out of bounds; the fallback only
      // satisfies noUncheckedIndexedAccess.
      return monthNames[month] ?? String(month);
    case "MMM":
      return shortMonthNames[month] ?? String(month);
    case "MM":
      return pad(month + 1);
    case "M":
      return String(month + 1);
    case "Mo":
      return `${month + 1}${ordinalSuffix(month + 1)}`;
    case "DD":
      return pad(day);
    case "D":
      return String(day);
    case "Do":
      return `${day}${ordinalSuffix(day)}`;
    case "dddd":
      // weekday is always 0-6 (Date.getDay()) and weekdayNames has exactly 7
      // entries, so this index is never out of bounds; the fallback only
      // satisfies noUncheckedIndexedAccess.
      return weekdayNames[weekday] ?? String(weekday);
    case "ddd":
      return shortWeekdayNames[weekday] ?? String(weekday);
    case "dd":
      return minWeekdayNames[weekday] ?? String(weekday);
    case "d":
      return String(weekday);
    case "HH":
      return pad(hours);
    case "H":
      return String(hours);
    case "hh":
      return pad(hours % 12 || 12);
    case "h":
      return String(hours % 12 || 12);
    case "mm":
      return pad(minutes);
    case "m":
      return String(minutes);
    case "ss":
      return pad(seconds);
    case "s":
      return String(seconds);
    case "SSS":
      return pad(milliseconds, 3);
    case "SS":
      return pad(Math.floor(milliseconds / 10));
    case "S":
      return String(Math.floor(milliseconds / 100));
    case "A":
      return hours < 12 ? "AM" : "PM";
    case "a":
      return hours < 12 ? "am" : "pm";
    case "Q":
      return String(Math.floor(month / 3) + 1);
    case "X":
      return String(Math.floor(date.getTime() / 1000));
    case "x":
      return String(date.getTime());
    default: {
      const localized = localizedMomentFormats[token];
      return localized === undefined
        ? token
        : formatMomentFormat(date, localized);
    }
  }
}

/**
 * Renders `formatStr` as moment does for the modeled set: the longest token at
 * each position, `[text]` as a literal, `[[` and `]]` as an escaped bracket,
 * and any other character passed through.
 */
function formatMomentFormat(date: Date, formatStr: string): string {
  let output = "";
  let index = 0;
  while (index < formatStr.length) {
    const char = formatStr.charAt(index);
    if (char === "[") {
      // Observed on 1.14.4: `[text]` is literal; a `[` with no `]`, or one
      // nested before the close, stays a literal `[`.
      const close = formatStr.indexOf("]", index + 1);
      const nestedOpen = formatStr.indexOf("[", index + 1);
      if (close !== -1 && (nestedOpen === -1 || nestedOpen > close)) {
        output += formatStr.slice(index + 1, close);
        index = close + 1;
        continue;
      }
      output += "[";
      index += 1;
      continue;
    }
    const token = matchMomentToken(formatStr, index);
    if (token === null) {
      output += char;
      index += 1;
      continue;
    }
    output += formatMomentToken(token, date);
    index += token.length;
  }
  return output;
}

const createMoment = (input?: string | number | Date) => {
  const date =
    input instanceof Date
      ? input
      : input !== undefined
        ? new Date(input)
        : new Date();

  return {
    format(formatStr: string): string {
      return formatMomentFormat(date, formatStr);
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
 * Models Obsidian 1.14.4: a status of 400 or above rejects with an Error
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
  // Observed on Obsidian 1.14.4 desktop (Windows): the desktop flags are
  // true and the OS flag for the host (isWin) is true, and
  // `resourcePathPrefix` is a per-install `app://<hash>/` URL. The stub keeps
  // the OS flags false and a fixed prefix so no test depends on the machine.
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

// Observed on Obsidian 1.14.4 desktop (Windows): setIcon empties the element,
// then writes a lucide `<svg class="svg-icon lucide-<name>">` for a name it
// knows and nothing for one it does not (the set-icon probe confirms both,
// including the empty element left for "youtube"). renderIconMarkup carries the
// icons RSS Dashboard uses and returns "" for anything else, so an icon the app
// does not ship renders empty here too (ADR 0014).
//
// setIcon runs on every render, so parse each icon's markup once and clone from
// the cache; that keeps icon-heavy renders close to the old `data-icon` cost.
const parsedIconCache = new Map<string, Element>();

function setIconImpl(el: HTMLElement, iconName: string): void {
  const markup = renderIconMarkup(iconName);
  if (markup === "") {
    el.replaceChildren();
    return;
  }
  let svg = parsedIconCache.get(iconName);
  if (!svg) {
    svg =
      new DOMParser().parseFromString(markup, "text/html").body
        .firstElementChild ?? undefined;
  }
  if (!svg) {
    el.replaceChildren();
    return;
  }
  parsedIconCache.set(iconName, svg);
  el.replaceChildren(el.ownerDocument.importNode(svg, true));
}

// `getIcon` and `getIconIds` are not modeled: no production code imports them
// and no test needs them. Model either when a consumer appears, the way
// `AbstractInputSuggest` was modeled once folder suggesters needed it
// (obsidian-console-probes.md).

/** Mirrors Obsidian: the tooltip text is stored as the element's aria-label. */
function setTooltipImpl(el: HTMLElement, tooltip: string): void {
  el.setAttribute("aria-label", tooltip);
}

/**
 * Models `normalizePath` as read in the #372 source audit
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

// The pinned reference version (see the header). Observed on Obsidian 1.14.4
// desktop (Windows): the exported `apiVersion` is the running app version
// ("1.14.4"), and real requireApiVersion is true at or below it and false
// above it (see obsidian-console-probes.md).
const OBSIDIAN_REFERENCE_VERSION = "1.14.4";

// Observed on Obsidian 1.14.4 desktop (Windows): `apiVersion` is a mutable
// string export holding the running app version. Tests switch it through the
// hooks below to exercise minimum-version paths.
export let apiVersion: typeof ObsidianApi.apiVersion =
  OBSIDIAN_REFERENCE_VERSION;

/** Test hook (not an Obsidian API): pretend the app runs this version. */
export function __setObsidianVersion(version: string): void {
  apiVersion = version;
}

/** Test hook (not an Obsidian API): restore the pinned reference version. */
export function __resetObsidianVersion(): void {
  apiVersion = OBSIDIAN_REFERENCE_VERSION;
}

/**
 * Compares two dot-separated numeric versions. Missing segments count as 0, so
 * "1.14" equals "1.14.0". Only the dotted forms the probes covered are
 * modeled; pre-release or non-numeric segments are not observed.
 */
function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".");
  const rightParts = right.split(".");
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = Number(leftParts[index] ?? 0) - Number(rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Observed on Obsidian 1.14.4 desktop (Windows): true for every version at or
// below the running version (1.0.0, 1.8.7, 1.13.7, 1.14.3, 1.14.4) and false
// above it (1.14.5, 1.15.0, 2.0.0). Reads the mutable `apiVersion`, so the
// version hook switches the branch.
function requireApiVersionImpl(version: string): boolean {
  return compareVersions(version, apiVersion) <= 0;
}

/**
 * Models Obsidian's `debounce` (observed on 1.14.4 desktop, Windows; see
 * `obsidian-console-probes.md`). Returns a callable that collapses a burst of
 * calls into one trailing call after `timeout` ms:
 * - `resetTimer` restarts the wait on every call, so a burst fires once, after
 *   the last call, with that call's arguments.
 * - Without it, the first call fixes the deadline; a later call updates the
 *   arguments but does not push the call back.
 * `cancel()` drops a pending call (a no-op with none pending), `run()` fires a
 * pending call immediately and returns the callback's value, and both return
 * the debouncer so calls can chain.
 */
function debounceImpl<T extends unknown[], V>(
  cb: (...args: [...T]) => V,
  timeout = 0,
  resetTimer = false,
): ObsidianApi.Debouncer<T, V> {
  let timer: number | null = null;
  let latestArgs: [...T] | undefined;

  const fire = (): V | void => {
    timer = null;
    const args = latestArgs;
    return args === undefined ? undefined : cb(...args);
  };

  const debounced = ((...args: [...T]): ObsidianApi.Debouncer<T, V> => {
    latestArgs = args;
    if (timer !== null && resetTimer) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (timer === null) {
      // Observed: a later call with `resetTimer: false` still supplies the
      // arguments the trailing call receives, even though it keeps the
      // original deadline.
      timer = window.setTimeout(() => {
        fire();
      }, timeout);
    }
    return debounced;
  }) as ObsidianApi.Debouncer<T, V>;

  debounced.cancel = (): ObsidianApi.Debouncer<T, V> => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    return debounced;
  };

  debounced.run = (): V | void => {
    if (timer === null) return undefined;
    window.clearTimeout(timer);
    return fire();
  };

  return debounced;
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

/**
 * A file's `name`, `basename`, and `extension`, derived from its path.
 * Observed on Obsidian 1.14.4 desktop (Windows): `basename` is the name up to
 * its last dot and `extension` follows it ("my.file.name.md" -> "my.file.name"
 * and "md"); a name without a dot is its own basename with extension "".
 * Names starting with a dot weren't probed (Obsidian doesn't index them).
 */
function fileNameParts(path: string): {
  name: string;
  basename: string;
  extension: string;
} {
  const name = path.split("/").pop() ?? "";
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) {
    return { name, basename: name, extension: "" };
  }
  return {
    name,
    basename: name.slice(0, lastDot),
    extension: name.slice(lastDot + 1),
  };
}

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
    const { name, basename, extension } = fileNameParts(path);
    this.name = name;
    this.basename = basename;
    this.extension = extension;
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

/**
 * Obsidian's default file cache limit, observed on 1.14.4 desktop (Windows) as
 * `vault.cacheLimit` (65536 characters). Content longer than this is not held
 * in the `cachedRead` cache.
 */
const FILE_CACHE_LIMIT = 65536;

interface MockVaultAdapter {
  getBasePath(): string;
  getFullPath(path: string): string;
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<ArrayBuffer>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
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
   * Obsidian's `cachedRead` content cache (1.14.4, Windows), keyed by the
   * `TFile` object rather than its path. A successful `vault.read` fills it;
   * `vault.cachedRead` serves it and falls back to `read` on a miss. Keying by
   * object is why the entry outlives an `adapter.remove` of the file.
   */
  private fileCache: Map<TFileStub, string> = new Map();
  /**
   * The vault's config folder. Users can rename it, but Obsidian only accepts
   * a dot-prefixed name, so it's always hidden from the vault index. The stub
   * uses a non-default name so tests read it rather than hardcoding it.
   */
  configDir = ".vault-config";
  /**
   * Whether the file system distinguishes paths that differ only in case.
   * Windows and macOS don't (the default, observed on Obsidian 1.14.4
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
      // Observed on Obsidian 1.14.4 desktop (Windows): `getFullPath` joins
      // the vault path onto `getBasePath()` with OS separators. The stub is
      // OS-independent and always joins with "/". Mobile has no
      // `getBasePath` (not modeled; the stub is the desktop adapter).
      getBasePath: () => "/test/vault",
      getFullPath: (p: string) => `${this.adapter.getBasePath()}/${p}`,
      exists: async (path: string) => this.existsOnDisk(path),
      // Observed on Obsidian 1.14.4 desktop (Windows): a missing path throws
      // Node's ENOENT.
      read: async (path: string) => this.readFromDisk(path),
      // Observed on Obsidian 1.14.4 desktop (Windows): `adapter.readBinary` of
      // a missing path throws Node's ENOENT, so this models `read`.
      readBinary: async (path: string) =>
        new TextEncoder().encode(this.readFromDisk(path)).buffer,
      write: async (path: string, content: string) => {
        // Observed on Obsidian 1.14.4 desktop (Windows): a missing parent
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
      // Not yet observed against Obsidian: `append` creates the file when it
      // is missing, requires the parent folder like `write`, and joins the
      // index the same way.
      append: async (path: string, content: string) => {
        const parentPath = path.includes("/")
          ? path.slice(0, path.lastIndexOf("/"))
          : "";
        if (parentPath && !this.folderExistsOnDisk(parentPath)) {
          throw enoentError("open", `${this.adapter.getBasePath()}/${path}`);
        }
        this.adapterFiles.set(
          path,
          (this.adapterFiles.get(path) ?? "") + content,
        );
        if (!this.files.has(path)) {
          this.files.set(path, new TFileStub(path));
        }
      },
      // Not yet observed against Obsidian: modeled on Node's `fs.rename` (and
      // Obsidian's documented adapter member): the source must exist, the
      // destination's parent must exist, and an existing destination file is
      // replaced. A folder is not modeled because this repo only renames files.
      rename: async (oldPath: string, newPath: string) => {
        const newParentPath = newPath.includes("/")
          ? newPath.slice(0, newPath.lastIndexOf("/"))
          : "";
        if (newParentPath && !this.folderExistsOnDisk(newParentPath)) {
          throw enoentError(
            "rename",
            `${this.adapter.getBasePath()}/${newPath}`,
          );
        }
        const oldKey = this.diskKey(oldPath);
        const sourcePath = [...this.adapterFiles.keys()].find(
          (filePath) => this.diskKey(filePath) === oldKey,
        );
        if (sourcePath === undefined) {
          throw enoentError(
            "rename",
            `${this.adapter.getBasePath()}/${oldPath}`,
          );
        }
        if (this.folderExistsOnDisk(oldPath)) {
          throw Object.assign(
            new Error(
              `EPERM: operation not permitted, rename '${this.adapter.getBasePath()}/${oldPath}'`,
            ),
            { code: "EPERM" },
          );
        }
        const content = this.adapterFiles.get(sourcePath) ?? "";
        const file = this.files.get(sourcePath);
        this.adapterFiles.delete(sourcePath);
        this.files.delete(sourcePath);
        this.adapterFiles.set(newPath, content);
        if (file) {
          file.path = newPath;
          const parts = fileNameParts(newPath);
          file.name = parts.name;
          file.basename = parts.basename;
          file.extension = parts.extension;
          this.files.set(newPath, file);
        }
      },
      // Observed on Obsidian 1.14.4 desktop (Windows): creates missing parent
      // folders too, resolves on an existing folder, and the new folders join
      // the vault index like written files.
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
      // Observed on Obsidian 1.14.4 desktop (Windows): a missing path throws
      // Node's ENOENT, and a folder throws EPERM and stays.
      remove: async (path: string) => this.removeFromDisk(path),
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

  /**
   * The content of the file at `path` on disk, found the way the file system
   * finds it (a case variant on a case-insensitive one). Throws Node's ENOENT
   * when there's no such file.
   */
  private readFromDisk(path: string): string {
    const exact = this.adapterFiles.get(path);
    if (exact !== undefined) return exact;
    const key = this.diskKey(path);
    for (const [filePath, content] of this.adapterFiles) {
      if (this.diskKey(filePath) === key) return content;
    }
    throw enoentError("open", `${this.adapter.getBasePath()}/${path}`);
  }

  /**
   * Deletes the file at `path` from disk, found the way the file system finds
   * it (a case variant on a case-insensitive one; not probed). Throws what
   * Node's `unlink` throws on Windows: EPERM for a folder (Linux and macOS
   * report EISDIR), ENOENT for a missing path.
   */
  private removeFromDisk(path: string): void {
    const fullPath = `${this.adapter.getBasePath()}/${path}`;
    if (this.folderExistsOnDisk(path)) {
      throw Object.assign(
        new Error(`EPERM: operation not permitted, unlink '${fullPath}'`),
        { code: "EPERM" },
      );
    }
    const key = this.diskKey(path);
    const filePath = [...this.adapterFiles.keys()].find(
      (candidate) => this.diskKey(candidate) === key,
    );
    if (filePath === undefined) {
      throw enoentError("unlink", fullPath);
    }
    this.adapterFiles.delete(filePath);
    this.files.delete(filePath);
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
    // Observed on Obsidian 1.14.4 desktop: an existing path, or a case variant
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

  // Observed on Obsidian 1.14.4 desktop (Windows): reading a TFile whose file
  // was removed on disk throws Node's ENOENT. A successful read also caches the
  // content for `cachedRead` (`TFile.cache`), within the cache limit.
  async read(file: TFileStub | string): Promise<string> {
    const path = typeof file === "string" ? file : file.path;
    const content = this.readFromDisk(path);
    if (typeof file !== "string") this.cacheFile(file, content);
    return content;
  }

  // Observed on Obsidian 1.14.4 desktop (Windows): `cachedRead` returns the
  // content cached by an earlier read without touching the disk, so it still
  // returns content after the file is removed on disk. On a cache miss it falls
  // back to `read` (which caches on success), so a file removed before it was
  // ever read still throws ENOENT. `create` writes to disk without caching.
  async cachedRead(file: TFileStub): Promise<string> {
    const cached = this.fileCache.get(file);
    if (cached !== undefined) return cached;
    return this.read(file);
  }

  /** Obsidian's `TFile.cache`: stores content within the limit, else evicts. */
  private cacheFile(file: TFileStub, content: string): void {
    if (content.length <= FILE_CACHE_LIMIT) {
      this.fileCache.set(file, content);
    } else {
      this.fileCache.delete(file);
    }
  }

  // Observed on Obsidian 1.14.4 desktop (Windows): a file removed on disk
  // throws Node's ENOENT, so this models `read`.
  async readBinary(file: TFileStub): Promise<ArrayBuffer> {
    return new TextEncoder().encode(this.readFromDisk(file.path)).buffer;
  }

  async delete(file: TFileStub | string): Promise<void> {
    const path = typeof file === "string" ? file : file.path;
    this.files.delete(path);
    this.adapterFiles.delete(path);
  }

  async modify(_file: TFileStub, _content: string): Promise<void> {}

  /**
   * Obsidian's `process` (API typings, `@since 1.1.0`): reads the file, passes
   * its current content to `fn`, writes the returned value, and resolves with
   * the text that was written. A file removed on disk throws ENOENT before the
   * callback runs.
   */
  async process(
    file: TFileStub,
    fn: (data: string) => string,
  ): Promise<string> {
    const next = fn(this.readFromDisk(file.path));
    this.adapterFiles.set(file.path, next);
    return next;
  }

  async createFolder(folderPath: string): Promise<TFolderStub> {
    const cleanPath = folderPath.replace(/^\/+|\/+$/g, "");
    if (!cleanPath) return this.root;

    // Observed on Obsidian 1.14.4 desktop: an existing folder, or a case
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
    // Observed on Obsidian 1.14.4 desktop (Windows): trashing a folder takes
    // its whole subtree out of the index and off disk, including descendants
    // nested more than one level down and the folder itself.
    const key = this.diskKey(file.path);
    const isInside = (path: string): boolean => {
      const pathKey = this.diskKey(path);
      return pathKey === key || pathKey.startsWith(`${key}/`);
    };
    for (const filePath of [...this.adapterFiles.keys()]) {
      if (isInside(filePath)) this.adapterFiles.delete(filePath);
    }
    for (const filePath of [...this.files.keys()]) {
      if (isInside(filePath)) this.files.delete(filePath);
    }
    for (const folderPath of [...this.folders.keys()]) {
      if (isInside(folderPath)) this.forgetFolder(folderPath);
    }
  }

  /**
   * Observed on Obsidian 1.14.4 desktop (Windows): the file keeps its content
   * at the new path, its name parts follow the path, and the old path leaves
   * the index; renaming onto an existing path throws "Destination file
   * already exists!". Not probed: whether `vault.rename` itself normalizes
   * the path (the stub doesn't; `fileManager.renameFile` does), a rename
   * that only changes case (allowed here), a missing destination folder
   * (allowed here), and renaming folders (not modeled).
   */
  async rename(file: TFileStub, newPath: string): Promise<void> {
    const oldPath = file.path;
    if (
      this.diskKey(newPath) !== this.diskKey(oldPath) &&
      this.existsOnDisk(newPath)
    ) {
      throw new Error("Destination file already exists!");
    }

    const content = this.adapterFiles.get(oldPath);
    this.files.delete(oldPath);
    this.adapterFiles.delete(oldPath);

    file.path = newPath;
    Object.assign(file, fileNameParts(newPath));

    this.files.set(newPath, file);
    if (content !== undefined) {
      this.adapterFiles.set(newPath, content);
    }
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
  private leaves: WorkspaceLeafStub[] = [];
  public activeLeaf: unknown = null;
  private layoutReadyCallbacks: Array<() => void> = [];

  onLayoutChange = new MockEvent();
  onActiveLeafChange = new MockEvent();
  onWindowResize = new MockEvent();

  constructor(private readonly app: AppStub) {}

  /** Tracks a new leaf, so getLeavesOfType can find it once it has a view. */
  private openLeaf(): WorkspaceLeafStub {
    const leaf = new WorkspaceLeafStub(this.app);
    this.leaves.push(leaf);
    return leaf;
  }

  getLeavesOfType(type: string): WorkspaceLeafStub[] {
    return this.leaves.filter((leaf) => {
      const view = leaf.view as { getViewType?: () => string } | undefined;
      return view?.getViewType?.() === type;
    });
  }

  /** Visits every tracked leaf, as Obsidian's iterateAllLeaves does. */
  iterateAllLeaves(callback: (leaf: WorkspaceLeafStub) => void): void {
    this.leaves.forEach((leaf) => callback(leaf));
  }

  revealLeaf(_leaf: ObsidianApi.WorkspaceLeaf): Promise<void> {
    return Promise.resolve();
  }

  getMostRecentLeaf(): unknown {
    return this.activeLeaf;
  }

  setActiveLeaf(leaf: unknown, _options?: { focus?: boolean }): void {
    this.activeLeaf = leaf;
  }

  getLeaf(_type?: "split" | "tab"): WorkspaceLeafStub {
    return this.openLeaf();
  }

  // Not probed: whether these reuse an existing sidebar leaf.
  getLeftLeaf(_force?: boolean): WorkspaceLeafStub {
    return this.openLeaf();
  }

  getRightLeaf(_force?: boolean): WorkspaceLeafStub {
    return this.openLeaf();
  }

  onLayoutReady(callback: () => void): void {
    this.layoutReadyCallbacks.push(callback);
  }

  triggerLayoutReady(): void {
    const callbacks = [...this.layoutReadyCallbacks];
    this.layoutReadyCallbacks = [];
    callbacks.forEach((callback) => callback());
  }

  private readonly eventHandlers = new Map<
    string,
    Set<(...args: unknown[]) => unknown>
  >();

  /** Registers a handler. The returned ref's `off` detaches it again. */
  on(name: string, callback: (...args: unknown[]) => unknown): unknown {
    const handlers = this.eventHandlers.get(name) ?? new Set();
    handlers.add(callback);
    this.eventHandlers.set(name, handlers);
    return { off: () => handlers.delete(callback) };
  }

  /** Calls every handler registered for `name`, as Obsidian's trigger does. */
  trigger(name: string, ...args: unknown[]): void {
    for (const callback of [...(this.eventHandlers.get(name) ?? [])]) {
      callback(...args);
    }
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
      // Observed on Obsidian 1.14.4 desktop (Windows): the new path is
      // normalized ("a//r3.md" -> "a/r3.md"). Updating links in other notes
      // isn't modeled.
      renameFile: async (file: TFileStub, newPath: string) => {
        await this.vault.rename(file, normalizePathImpl(newPath));
      },
    };
    this.workspace = new MockWorkspace(this);
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

class ComponentStub {
  private children = new Set<ObsidianApi.Component>();
  private cleanups: Array<() => unknown> = [];
  /** Obsidian's own flag name; the probes read it to observe loading. */
  _loaded = false;

  // Not probed: calling load() or unload() twice in a row.
  load(): void {
    this._loaded = true;
    this.onload();
    this.children.forEach((child) => child.load());
  }

  onload(): void {}

  unload(): void {
    this._loaded = false;
    this.children.forEach((child) => child.unload());
    this.children.clear();
    const cleanups = this.cleanups;
    this.cleanups = [];
    cleanups.forEach((cleanup) => cleanup());
    this.onunload();
  }

  onunload(): void {}

  addChild<T extends ObsidianApi.Component>(component: T): T {
    this.children.add(component);
    if (this._loaded) {
      component.load();
    }
    return component;
  }

  removeChild<T extends ObsidianApi.Component>(component: T): T {
    if (this.children.delete(component)) {
      component.unload();
    }
    return component;
  }

  register(cb: () => unknown): void {
    this.cleanups.push(cb);
  }

  registerDomEvent(
    el: EventTarget,
    type: string,
    callback: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void {
    el.addEventListener(type, callback, options);
    this.register(() => el.removeEventListener(type, callback, options));
  }

  // Not probed: modeled on registerDomEvent, the interval is cleared on
  // unload.
  registerInterval(id: number): number {
    this.register(() => window.clearInterval(id));
    return id;
  }

  // Not probed. A ref from MockWorkspace.on carries an `off` that detaches the
  // handler on unload; refs from other stubs carry none and need no cleanup.
  registerEvent(evt: EventRef): void {
    const off = (evt as { off?: unknown } | undefined)?.off;
    if (typeof off === "function") this.register(() => off());
  }
}

class PluginStub extends ComponentStub {
  app: AppStub;
  manifest: PluginManifest;

  constructor(app: AppStub, manifest: PluginManifest) {
    super();
    this.app = app;
    this.manifest = manifest;
    // Obsidian loads a plugin from its folder, so the folder exists on disk.
    if (manifest.dir) {
      app.vault.addFolderOnDisk(manifest.dir);
    }
  }

  onload(): void {}
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

/**
 * Observed on Obsidian 1.14.4 desktop (Windows): a `Notice` instance has the
 * own keys `timerId`, `buttonContainerEl`, `win`, `containerEl`, `noticeEl`
 * and `messageEl`, and its prototype has `setMessage`, `setAutoHide`,
 * `addButton` and `hide`. `noticeEl` has class `notice-message` and holds the
 * message text (see obsidian-console-probes.md, "Notice"). The `console.debug`
 * line is stub tooling, not an Obsidian behavior: many tests watch it to see
 * which notices a code path shows.
 */
class NoticeStub {
  timerId: number | null;
  buttonContainerEl: HTMLDivElement;
  win: Window;
  containerEl: HTMLDivElement;
  // Deprecated in obsidian.d.ts; `messageEl` is the modern alias.
  noticeEl: HTMLDivElement;
  messageEl: HTMLDivElement;

  constructor(message: string | DocumentFragment, _timeout?: number) {
    this.timerId = null;
    this.buttonContainerEl = createDiv();
    this.win = activeWindow;
    this.containerEl = createDiv();
    this.containerEl.appendChild(this.buttonContainerEl);
    this.noticeEl = this.containerEl.createDiv({ cls: "notice-message" });
    this.messageEl = this.noticeEl;
    this.setMessage(message);
    console.debug("[Stub Notice]", message);
  }

  // From obsidian.d.ts ("Change the message of this notice.").
  setMessage(message: string | DocumentFragment): this {
    if (message instanceof DocumentFragment) {
      this.messageEl.empty();
      this.messageEl.appendChild(message);
    } else {
      this.messageEl.textContent = message;
    }
    return this;
  }

  setAutoHide(_autoHide: boolean): this {
    return this;
  }

  addButton(cb: (component: ObsidianApi.ButtonComponent) => unknown): this {
    const component = new ButtonComponentStub(this.buttonContainerEl);
    cb(component as unknown as ObsidianApi.ButtonComponent);
    return this;
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

  /**
   * Not probed: whether a deferred view loads synchronously or after a tick.
   * The stub's views load synchronously, so this resolves immediately. The
   * `Promise<void>` return is from the API typings (obsidian.d.ts).
   */
  loadIfDeferred(): Promise<void> {
    return Promise.resolve();
  }
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
}

// Menu extends Component in the API typings.
class MenuStub extends ComponentStub {
  static lastItems: MenuItemStub[] = [];

  constructor() {
    super();
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
  hide(): this {
    return this;
  }
  close(): void {}
}

class MenuItemStub {
  title = "";
  /** The icon id the item was given, as `setIcon` received it. */
  icon = "";
  // Observed on Obsidian 1.14.4 desktop (Windows): a fresh item has
  // `checked: null` and `disabled: false`.
  checked: boolean | null = null;
  disabled = false;
  isWarning = false;
  callback: ((evt: MouseEvent) => unknown) | undefined;

  setTitle(title: string | DocumentFragment): this {
    this.title = typeof title === "string" ? title : (title.textContent ?? "");
    return this;
  }
  setIcon(icon: string | null): this {
    this.icon = icon ?? "";
    return this;
  }
  setChecked(checked: boolean | null): this {
    this.checked = checked;
    return this;
  }
  setDisabled(disabled: boolean): this {
    this.disabled = disabled;
    return this;
  }
  setWarning(isWarning: boolean): this {
    this.isWarning = isWarning;
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

/**
 * A control added to a Setting row. Real Obsidian's `Setting.setDisabled`
 * forwards to every component already added, so each stub component exposes a
 * `setDisabled`.
 */
interface SettingComponent {
  setDisabled(disabled: boolean): unknown;
}

/**
 * A button control, the shape shared by `Setting.addButton` and
 * `Notice.addButton`. Observed on Obsidian 1.14.4 desktop (Windows): it wraps
 * a `<button>` in the given container and disables through
 * `buttonEl.disabled`.
 */
class ButtonComponentStub implements SettingComponent {
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
    setIconImpl(this.buttonEl, icon);
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

  // Observed on Obsidian 1.14.4 desktop (Windows): disabling a button
  // writes `buttonEl.disabled`.
  setDisabled(disabled: boolean): this {
    this.buttonEl.disabled = disabled;
    return this;
  }

  setCta(): this {
    this.buttonEl.classList.add("mod-cta");
    return this;
  }

  // Observed on Obsidian 1.14.4 desktop (Windows): setWarning is
  // `setDestructive().setCta()`, so it adds `mod-destructive mod-cta` and
  // never `mod-warning`.
  setWarning(): this {
    return this.setDestructive().setCta();
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
  // Observed on Obsidian 1.14.4 desktop (Windows): setHeading adds the heading
  // class and leaves the name, description and empty control in place.
  setHeading(): this {
    this.settingEl.addClass("setting-item-heading");
    return this;
  }
  // Observed on Obsidian 1.14.4 desktop (Windows): setClass splits on spaces
  // and adds every non-empty class.
  setClass(_cls?: string): this {
    const classes = _cls?.split(" ").filter(Boolean) ?? [];
    if (classes.length > 0) {
      this.settingEl.addClass(...classes);
    }
    return this;
  }
  // Observed on Obsidian 1.14.4 desktop (Windows): the tooltip lands on the
  // name element, not the row, description or control.
  setTooltip(_tooltip?: string): this {
    if (_tooltip !== undefined) {
      setTooltipImpl(this.nameEl, _tooltip);
    }
    return this;
  }
  // Observed on Obsidian 1.14.4 desktop (Windows): setDisabled toggles
  // `is-disabled` on the row and forwards the flag to every component already
  // added, so its reach is order-dependent; components added afterwards stay
  // interactive (see #1028 for the plugin call that relies on this).
  setDisabled(_disabled?: boolean): this {
    const disabled = _disabled ?? false;
    this.settingEl.toggleClass("is-disabled", disabled);
    for (const component of this.components) {
      component.setDisabled(disabled);
    }
    return this;
  }
  addButton(cb: (component: ObsidianApi.ButtonComponent) => unknown): this {
    return this.attach(new ButtonComponentStub(this.controlEl), cb);
  }

  addExtraButton(
    cb: (component: ObsidianApi.ExtraButtonComponent) => unknown,
  ): this {
    class ExtraButtonComponent {
      extraSettingsEl: HTMLElement;

      constructor(container: HTMLElement) {
        this.extraSettingsEl = container.createDiv({
          cls: "clickable-icon extra-setting-button",
        });
        this.extraSettingsEl.tabIndex = 0;
        // Observed on Obsidian 1.14.4 desktop (Windows): the icon defaults to
        // `lucide-settings` until setIcon replaces it.
        setIconImpl(this.extraSettingsEl, "settings");
      }

      setIcon(icon: string): this {
        setIconImpl(this.extraSettingsEl, icon);
        return this;
      }

      setTooltip(tooltip: string): this {
        setTooltipImpl(this.extraSettingsEl, tooltip);
        return this;
      }

      onClick(handler: (evt: MouseEvent) => void): this {
        this.extraSettingsEl.addEventListener("click", handler);
        return this;
      }

      // Observed on Obsidian 1.14.4 desktop (Windows): disabling adds
      // `is-disabled` and removes the `tabindex`. The re-enable direction was
      // not observed, so the stub leaves the attribute as-is.
      setDisabled(disabled: boolean): this {
        this.extraSettingsEl.toggleClass("is-disabled", disabled);
        if (disabled) {
          this.extraSettingsEl.removeAttribute("tabindex");
        }
        return this;
      }
    }

    const component = new ExtraButtonComponent(this.controlEl);
    return this.attach(component, cb);
  }

  addSlider(cb: (component: ObsidianApi.SliderComponent) => unknown): this {
    class SliderComponent {
      sliderEl: HTMLInputElement;
      valueEl: HTMLSpanElement;
      private displayFormat: (value: number) => string = (value) =>
        String(value);
      private changeHandler: ((value: number) => void) | null = null;

      constructor(container: HTMLElement) {
        // Observed on Obsidian 1.14.4 desktop (Windows): the `slider-value`
        // span is inserted before the range input, which carries the `slider`
        // class and `data-ignore-swipe`.
        this.valueEl = container.createSpan({ cls: "slider-value" });
        this.sliderEl = container.createEl("input", {
          cls: "slider",
          type: "range",
        });
        this.sliderEl.setAttribute("data-ignore-swipe", "true");
        this.sliderEl.addEventListener("input", () => {
          this.updateDisplay();
          this.changeHandler?.(this.getValue());
        });
        this.updateDisplay();
      }

      private updateDisplay(): void {
        this.valueEl.textContent = this.displayFormat(this.getValue());
      }

      setLimits(min: number, max: number, step: number): this {
        this.sliderEl.min = String(min);
        this.sliderEl.max = String(max);
        this.sliderEl.step = String(step);
        // Observed on Obsidian 1.14.4 desktop (Windows): setLimits refreshes
        // the value display.
        this.updateDisplay();
        return this;
      }

      // Observed on Obsidian 1.14.4 desktop (Windows): setValue fires onChange
      // only when the value actually changes.
      setValue(value: number): this {
        if (this.getValue() !== value) {
          this.sliderEl.value = String(value);
          this.updateDisplay();
          this.changeHandler?.(value);
        }
        return this;
      }

      // Observed on Obsidian 1.14.4 desktop (Windows): getValue reads
      // `valueAsNumber`.
      getValue(): number {
        return this.sliderEl.valueAsNumber;
      }

      setDisplayFormat(format: (value: number) => string): this {
        this.displayFormat = format;
        this.updateDisplay();
        return this;
      }

      setDynamicTooltip(): this {
        return this;
      }

      // Observed on Obsidian 1.14.4 desktop (Windows): disabling a slider
      // writes `sliderEl.disabled`.
      setDisabled(disabled: boolean): this {
        this.sliderEl.disabled = disabled;
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
      colorPickerEl: HTMLInputElement;
      private changeHandler: ((value: string) => void) | null = null;

      constructor(container: HTMLElement) {
        this.colorPickerEl = container.createEl("input", { type: "color" });
        this.colorPickerEl.addEventListener("input", () => {
          this.changeHandler?.(this.colorPickerEl.value);
        });
      }

      setValue(value: string): this {
        this.colorPickerEl.value = value;
        return this;
      }

      getValue(): string {
        return this.colorPickerEl.value;
      }

      setPlaceholder(value: string): this {
        this.colorPickerEl.placeholder = value;
        return this;
      }

      onChange(handler: (value: string) => void): this {
        this.changeHandler = handler;
        return this;
      }

      // Observed on Obsidian 1.14.4 desktop (Windows): disabling the color
      // picker writes `colorPickerEl.disabled`.
      setDisabled(disabled: boolean): this {
        this.colorPickerEl.disabled = disabled;
        return this;
      }
    }

    const component = new ColorComponent(this.controlEl);
    return this.attach(component, cb);
  }
  addToggle(cb: (component: ObsidianApi.ToggleComponent) => unknown): this {
    class ToggleComponent {
      toggleEl: HTMLElement;
      private inputEl: HTMLInputElement;
      private value = false;
      private changeHandler: ((value: boolean) => void) | null = null;

      constructor(container: HTMLElement) {
        // Observed on Obsidian 1.14.4 desktop (Windows): the toggle is a
        // `label.checkbox-container[tabindex=0]` wrapping an
        // `input[type=checkbox][tabindex=-1]`.
        this.toggleEl = container.createEl("label", {
          cls: "checkbox-container",
        });
        this.toggleEl.tabIndex = 0;
        this.inputEl = this.toggleEl.createEl("input", { type: "checkbox" });
        this.inputEl.tabIndex = -1;
        this.inputEl.addEventListener("change", () => {
          this.setValue(this.inputEl.checked);
          this.changeHandler?.(this.inputEl.checked);
        });
      }

      // Observed on Obsidian 1.14.4 desktop (Windows): setValue toggles
      // `is-enabled` on the label and does not set the inner input's `checked`.
      setValue(value: boolean): this {
        this.value = value;
        this.toggleEl.toggleClass("is-enabled", value);
        return this;
      }

      // Observed on Obsidian 1.14.4 desktop (Windows): getValue returns the
      // value that was set.
      getValue(): boolean {
        return this.value;
      }

      // Observed on Obsidian 1.14.4 desktop (Windows): disabling toggles
      // `is-disabled` on the label.
      setDisabled(disabled: boolean): this {
        this.toggleEl.toggleClass("is-disabled", disabled);
        return this;
      }

      onChange(handler: (value: boolean) => void): this {
        this.changeHandler = handler;
        return this;
      }

      _triggerChange(value: boolean): void {
        this.inputEl.checked = value;
        this.inputEl.dispatchEvent(new Event("change"));
      }
    }

    const component = new ToggleComponent(this.controlEl);
    this.attach(component, cb);
    // Observed on Obsidian 1.14.4 desktop (Windows): addToggle also marks the
    // row with `mod-toggle`.
    this.settingEl.addClass("mod-toggle");
    return this;
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

      // Observed on Obsidian 1.14.4 desktop (Windows): disabling a text input
      // writes `inputEl.disabled`.
      setDisabled(disabled: boolean): this {
        this.inputEl.disabled = disabled;
        return this;
      }
    }

    const component = new TextComponent(this.controlEl);
    return this.attach(component, cb);
  }
  addSearch(cb: (component: ObsidianApi.SearchComponent) => unknown): this {
    return this.attach(new SearchComponentStub(this.controlEl), cb);
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

      // Observed on Obsidian 1.14.4 desktop (Windows): disabling a dropdown
      // writes `selectEl.disabled`.
      setDisabled(disabled: boolean): this {
        this.selectEl.disabled = disabled;
        return this;
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

// Observed in the Obsidian 1.14.4 and 1.8.7 app bundles (app.js, app.css):
// `SearchComponent` builds `div.search-input-container` holding
// `input[type=search][enterkeyhint=search]` and a sibling
// `div.search-input-clear-button`. The clear button swallows `mousedown` so
// the input keeps focus; a click empties the input, runs the change handler,
// and focuses the input. app.css draws the button's filled circle-x and hides
// it while the input shows its placeholder, so it never renders an icon.
class SearchComponentStub {
  containerEl: HTMLDivElement;
  inputEl: HTMLInputElement;
  clearButtonEl: HTMLDivElement;
  private changeHandler: ((value: string) => void) | null = null;

  constructor(container: HTMLElement) {
    this.containerEl = container.createDiv("search-input-container");
    this.inputEl = this.containerEl.createEl("input", {
      type: "search",
      attr: { enterkeyhint: "search" },
    });
    this.inputEl.addEventListener("input", () => this.onChanged());
    this.clearButtonEl = this.containerEl.createDiv(
      "search-input-clear-button",
    );
    this.clearButtonEl.addEventListener("mousedown", (event) =>
      event.preventDefault(),
    );
    this.clearButtonEl.addEventListener("click", () => {
      if (this.inputEl.disabled) return;
      this.inputEl.value = "";
      this.onChanged();
      this.inputEl.focus();
    });
  }

  onChanged(): void {
    this.changeHandler?.(this.inputEl.value);
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

  setDisabled(disabled: boolean): this {
    this.inputEl.disabled = disabled;
    return this;
  }
}

class ModalStub {
  app: AppStub;
  scope: ScopeStub;
  containerEl: HTMLDivElement;
  modalEl: HTMLDivElement;
  /** Not in obsidian.d.ts (1.13.1), but present in 1.13.7 and 1.14.4. */
  headerEl: HTMLDivElement;
  titleEl: HTMLDivElement;
  contentEl: HTMLDivElement;
  constructor(app: AppStub) {
    this.app = app;
    this.scope = new ScopeStub();
    // Observed on Obsidian 1.14.4 desktop (Windows): containerEl is
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
    // Observed on Obsidian 1.14.4 desktop (Windows): the container is
    // detached before onClose runs, synchronously.
    this.containerEl.remove();
    this.onClose();
  }
}

/**
 * jsdom has no layout, so "shown" is approximated: connected, with no
 * `display: none` on the element or an ancestor.
 */
function isInputShown(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const view = el.ownerDocument.defaultView;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (view?.getComputedStyle(node).display === "none") return false;
  }
  return true;
}

/**
 * Models `AbstractInputSuggest` as probed on Obsidian 1.14.4 desktop (Windows),
 * `probes/abstract-input-suggest.repl`, with the running implementation read
 * over the same connection (obsidian-console-probes.md, "Step 3:
 * AbstractInputSuggest"). `PopoverSuggest` is folded in, because a consumer
 * only ever extends the combined class.
 *
 * Not modeled: reposition geometry (`reposition` and `autoReposition` do
 * nothing, so the container carries no `left`/`top` style), the open
 * animation, `PageUp`/`PageDown`, the touch-device deferral of
 * `onInputFocus`, the app keymap's scope stack, and the 500 ms poll that
 * closes the popover once the input leaves the document.
 */
class AbstractInputSuggestStub<T> {
  app: AppStub;
  scope: ScopeStub;
  /** Limit to the number of elements rendered at once; 0 disables it. */
  limit = 100;
  isOpen = false;
  /** The real class names its input `textInputEl`; it has no `inputEl`. */
  textInputEl: HTMLInputElement | HTMLDivElement;
  suggestEl: HTMLDivElement;
  suggestInnerEl: HTMLDivElement;
  /** Set by the 1.14.4 renderer: hovering a row (mousemove) selects it. */
  selectOnHover = true;
  autoReposition = (): void => {};
  private suggestionValues: T[] = [];
  private selectedItem = 0;
  private selectCb:
    ((value: T, evt: MouseEvent | KeyboardEvent) => unknown) | null = null;
  private pendingQuery: { cancelled: boolean } | null = null;

  // `getSuggestions` and `renderSuggestion` are abstract in the real class:
  // its prototype has neither, so a subclass that omits one throws a
  // TypeError the first time it is needed. Declared without a body to match.
  declare protected getSuggestions: (query: string) => T[] | Promise<T[]>;
  declare renderSuggestion: (value: T, el: HTMLElement) => void;

  constructor(app: AppStub, textInputEl: HTMLInputElement | HTMLDivElement) {
    this.app = app;
    this.textInputEl = textInputEl;
    // The real scope's parent is the app scope; the stub has no app keymap.
    this.scope = new ScopeStub();
    this.suggestEl = createDiv({ cls: "suggestion-container" });
    this.suggestInnerEl = this.suggestEl.createDiv({ cls: "suggestion" });

    // Observed on 1.14.4: the listeners are bound at construction through the
    // instance, so a subclass override of `onInputChange`, `onInputFocus` or
    // `close` takes part. The blur listener is `close`.
    textInputEl.addEventListener("input", this.onInputChange.bind(this));
    textInputEl.addEventListener("focus", this.onInputFocus.bind(this));
    textInputEl.addEventListener("blur", this.close.bind(this));
    // A mousedown on a row is cancelled, so the input keeps focus.
    this.suggestEl.addEventListener("mousedown", (evt) => {
      if (
        evt.target instanceof Element &&
        evt.target.closest(".suggestion-item")
      ) {
        evt.preventDefault();
      }
    });
    this.registerKeys();
  }

  setValue(value: string): void {
    if (this.textInputEl instanceof HTMLInputElement) {
      this.textInputEl.value = value;
    } else {
      // The real class sets `innerText`, which jsdom does not implement.
      this.textInputEl.textContent = value;
    }
  }

  getValue(): string {
    return this.textInputEl instanceof HTMLInputElement
      ? this.textInputEl.value
      : (this.textInputEl.textContent ?? "");
  }

  /** Runs on `input`, but only while the input is the active element. */
  onInputChange(): void {
    if (this.textInputEl.ownerDocument.activeElement !== this.textInputEl) {
      return;
    }
    if (this.pendingQuery) this.pendingQuery.cancelled = true;
    const query = { cancelled: false };
    this.pendingQuery = query;
    const result = this.getSuggestions(this.getValue());
    if (Array.isArray(result)) {
      this.showSuggestions(result);
      return;
    }
    // A falsy non-array result is ignored: the popover is left as it was. The
    // type forbids it, but a subclass can return `undefined` or `null`.
    const pending = result as Promise<T[]> | null | undefined;
    if (!pending) return;
    // A query superseded by a newer one is dropped when it resolves.
    void pending.then((values) => {
      if (!query.cancelled) this.showSuggestions(values);
    });
  }

  /** Runs on `focus`. Touch devices without a keyboard defer it; not modeled. */
  onInputFocus(): void {
    this.onInputChange();
  }

  /**
   * Renders the values (selecting the first row), then opens the popover. An
   * empty list closes it; an input that is not shown does nothing.
   */
  showSuggestions(values: T[]): void {
    if (values.length === 0) {
      this.close();
      return;
    }
    if (!isInputShown(this.textInputEl)) return;
    this.setSuggestions(this.limit > 0 ? values.slice(0, this.limit) : values);
    this.open();
  }

  selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void {
    // The base implementation only calls the `onSelect` callback: it neither
    // sets the input's value nor closes the popover, so a consumer does both.
    this.selectCb?.(value, evt);
  }

  /** A second call replaces the first callback. */
  onSelect(
    callback: (value: T, evt: MouseEvent | KeyboardEvent) => unknown,
  ): this {
    this.selectCb = callback;
    return this;
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    activeDocument.body.appendChild(this.suggestEl);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.setSuggestions([]);
    this.suggestEl.remove();
  }

  reposition(_rect?: unknown): void {}

  onEscapeKey(_evt: KeyboardEvent): void {
    this.close();
  }

  private setSuggestions(values: T[]): void {
    this.suggestionValues = values;
    this.suggestInnerEl.replaceChildren();
    values.forEach((value, index) => {
      const item = this.suggestInnerEl.createDiv({ cls: "suggestion-item" });
      this.renderSuggestion(value, item);
      item.addEventListener("click", (evt) => {
        this.setSelectedItem(index);
        this.selectSuggestion(value, evt);
      });
      item.addEventListener("mousemove", () => {
        if (this.selectOnHover) this.setSelectedItem(index);
      });
    });
    this.setSelectedItem(0);
  }

  /** An index past either end wraps to the other end. */
  private setSelectedItem(index: number): void {
    const count = this.suggestionValues.length;
    if (count === 0) return;
    this.selectedItem = index < 0 ? count - 1 : index >= count ? 0 : index;
    Array.from(this.suggestInnerEl.children).forEach((row, rowIndex) => {
      row.classList.toggle("is-selected", rowIndex === this.selectedItem);
    });
  }

  private registerKeys(): void {
    const move = (delta: number) => (): false => {
      this.setSelectedItem(this.selectedItem + delta);
      return false;
    };
    this.scope.register([], "ArrowUp", move(-1));
    this.scope.register([], "ArrowDown", move(1));
    this.scope.register([], "Home", () => {
      this.setSelectedItem(0);
      return false;
    });
    this.scope.register([], "End", () => {
      this.setSelectedItem(this.suggestionValues.length - 1);
      return false;
    });
    this.scope.register(["Ctrl"], "P", move(-1));
    this.scope.register(["Ctrl"], "N", move(1));
    this.scope.register([], "Enter", (evt) => {
      if (evt.isComposing) return undefined;
      const value = this.suggestionValues[this.selectedItem];
      if (value !== undefined) this.selectSuggestion(value, evt);
      return false;
    });
    this.scope.register([], "Escape", (evt) => {
      this.onEscapeKey(evt);
      return false;
    });
  }
}
class ScopeStub {
  public handlers: ObsidianApi.KeymapEventHandler[] = [];
  constructor(public parent?: ScopeStub) {}
  register(
    modifiers: ObsidianApi.Modifier[] | null,
    key: string | null,
    func: ObsidianApi.KeymapEventListener,
  ): ObsidianApi.KeymapEventHandler {
    // Observed on Obsidian 1.14.4 desktop (Windows): real Obsidian stores
    // `modifiers` as a comma-joined string with `Mod` resolved to the platform
    // key (`["Mod", "Shift"]` → "Ctrl,Shift" on Windows). The stub keeps the
    // array that tests inspect; the string form is not modeled (#431).
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
export const debounce: typeof ObsidianApi.debounce = debounceImpl;
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
export type DropdownComponent = ObsidianApi.DropdownComponent;
export type TextComponent = ObsidianApi.TextComponent;
export const TextComponent =
  TextComponentStub as unknown as typeof ObsidianApi.TextComponent;
export type SearchComponent = ObsidianApi.SearchComponent;
export const SearchComponent =
  SearchComponentStub as unknown as typeof ObsidianApi.SearchComponent;
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
  StubMatches<ObsidianApi.SearchComponent, SearchComponentStub>,
  StubMatches<ObsidianApi.Modal, ModalStub>,
  StubMatches<
    ObsidianApi.AbstractInputSuggest<unknown>,
    AbstractInputSuggestStub<unknown>
  >,
  StubMatches<ObsidianApi.Scope, ScopeStub>,
];
