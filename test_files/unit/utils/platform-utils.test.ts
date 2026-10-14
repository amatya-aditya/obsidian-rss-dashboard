import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Obsidian from "obsidian";
import {
  ensureUtf8Meta,
  formatDateWithRelative,
  formatArticleDate,
  formatRelativeTime,
  getViewportTier,
  isPhoneViewport,
  isNarrowViewport,
  MOBILE_LAYOUT_MAX_WIDTH_PX,
  FOLDER_POPUP_MOBILE_MAX_WIDTH_PX,
  isTabletViewport,
  robustFetch,
  setCssProps,
  shouldUseMobileSidebarLayout,
} from "../../../src/utils/platform-utils";
import { installObsidianDomPolyfills } from "../test-dom-polyfills";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function encodeLatin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function encodeWindows1251Xml(declaration = true): Uint8Array {
  const prefix = declaration
    ? '<?xml version="1.0" encoding="windows-1251"?><rss><channel><title>'
    : "<rss><channel><title>";
  const suffix = "</title></channel></rss>";
  const cyrillic = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2]);
  const prefixBytes = new TextEncoder().encode(prefix);
  const suffixBytes = new TextEncoder().encode(suffix);
  const result = new Uint8Array(
    prefixBytes.length + cyrillic.length + suffixBytes.length,
  );
  result.set(prefixBytes);
  result.set(cyrillic, prefixBytes.length);
  result.set(suffixBytes, prefixBytes.length + cyrillic.length);
  return result;
}

beforeEach(() => {
  installObsidianDomPolyfills();
  document.body.empty();
  vi.restoreAllMocks();
});

describe("platform-utils.robustFetch", () => {
  it("uses charset from Content-Type header when present", async () => {
    const url = "https://example.com";
    const bodyBytes = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in iso-8859-1

    const requestUrlSpy = vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html; charset=iso-8859-1" },
      arrayBuffer: toArrayBuffer(bodyBytes),
      text: "",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch(url);
    expect(result).toBe("café");
    expect(requestUrlSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url, method: "GET" }),
    );
  });

  it("detects charset from <meta charset> when header has no charset", async () => {
    const html =
      '<html><head><meta charset="windows-1252"></head><body>café</body></html>';

    vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      arrayBuffer: toArrayBuffer(encodeLatin1(html)),
      text: "",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch("https://example.com/meta");
    expect(result).toBe(html);
  });

  it("detects charset from http-equiv Content-Type meta when needed", async () => {
    const html =
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1"></head><body>café</body></html>';

    vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      arrayBuffer: toArrayBuffer(encodeLatin1(html)),
      text: "",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch("https://example.com/equiv");
    expect(result).toBe(html);
  });

  it("detects windows-1251 from an XML declaration", async () => {
    vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/rss+xml" },
      arrayBuffer: toArrayBuffer(encodeWindows1251Xml()),
      text: "",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch("https://example.com/cp1251.xml");
    expect(result).toContain("Привет");
  });

  it("normalizes a quoted windows-1251 charset in a case-insensitive header", async () => {
    vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: {
        "Content-Type": 'application/rss+xml; charset="WINDOWS-1251"',
      },
      arrayBuffer: toArrayBuffer(encodeWindows1251Xml(false)),
      text: "",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch("https://example.com/cp1251.xml");
    expect(result).toContain("Привет");
  });

  it("lets an explicit encoding override win over a conflicting header", async () => {
    vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
      arrayBuffer: toArrayBuffer(encodeWindows1251Xml(false)),
      text: "",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch("https://example.com/cp1251.xml", {
      encodingOverride: "windows-1251",
    });
    expect(result).toContain("Привет");
  });

  it("defaults to utf-8 when no charset is detected", async () => {
    const html = "<html><head></head><body>hello π</body></html>";
    const bytes = new TextEncoder().encode(html);

    vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html" },
      arrayBuffer: toArrayBuffer(bytes),
      text: "",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch("https://example.com/utf8-default");
    expect(result).toBe(html);
  });

  it("falls back to utf-8 when TextDecoder throws for an invalid charset", async () => {
    const html = "<html><body>hello π</body></html>";
    const bytes = new TextEncoder().encode(html);

    vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/html; charset=not-a-charset" },
      arrayBuffer: toArrayBuffer(bytes),
      text: "",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch("https://example.com/fallback");
    expect(result).toBe(html);
  });

  it("returns response.text when arrayBuffer is absent", async () => {
    vi.spyOn(Obsidian, "requestUrl").mockResolvedValue({
      status: 200,
      headers: { "content-type": "text/plain" },
      text: "ok",
    } as unknown as Awaited<ReturnType<typeof Obsidian.requestUrl>>);

    const result = await robustFetch("https://example.com/text-only", {
      method: "POST",
    });
    expect(result).toBe("ok");
  });
});

describe("platform-utils.misc", () => {
  it("ensureUtf8Meta inserts a meta charset when missing", () => {
    expect(ensureUtf8Meta("<div>hi</div>")).toBe(
      '<meta charset="UTF-8"><div>hi</div>',
    );
    expect(ensureUtf8Meta('   <meta charset="UTF-8"><div>hi</div>')).toBe(
      '   <meta charset="UTF-8"><div>hi</div>',
    );
  });

  it("formatRelativeTime handles invalid and future dates deterministically", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:00Z"));

    expect(formatRelativeTime("not-a-date")).toBe("Invalid date");
    expect(formatRelativeTime(new Date("2026-03-30T12:00:00Z"))).toBe(
      "Just now",
    );

    vi.useRealTimers();
  });

  it("setCssProps sets custom properties", () => {
    const el = createDiv();
    setCssProps(el, { "--a": "1", "--b": "two" });
    expect(el.style.getPropertyValue("--a")).toBe("1");
    expect(el.style.getPropertyValue("--b")).toBe("two");
  });

  it("viewport helpers classify tiers", () => {
    expect(isPhoneViewport(500)).toBe(true);
    expect(isTabletViewport(900)).toBe(true);
    expect(shouldUseMobileSidebarLayout(900)).toBe(true);
    expect(getViewportTier(500)).toBe("phone");
    expect(getViewportTier(900)).toBe("tablet");
    expect(getViewportTier(1600)).toBe("desktop");
  });

  it("formatDateWithRelative returns relative text and absolute title", () => {
    vi.useFakeTimers();
    // 2026-05-15T12:00:00
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const date = new Date("2026-05-15T10:00:00Z");
    const result = formatDateWithRelative(date);

    expect(result.text).toBe("Today");
    // toLocaleDateString output can vary by environment, but we expect a string containing the date
    expect(result.title).toContain("2026");
    expect(result.title).toContain("May");

    vi.useRealTimers();
  });

  it("formatArticleDate respects relative/absolute styles", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const date = new Date("2026-05-15T10:00:00Z");

    // Case 1: Relative (default)
    const relativeResult = formatArticleDate(date, "relative");
    expect(relativeResult.text).toBe("Today");
    expect(relativeResult.title).toContain("2026");

    // Case 2: Absolute
    const absoluteResult = formatArticleDate(date, "absolute");
    expect(absoluteResult.text).toContain("2026");
    expect(absoluteResult.text).toContain("May");
    expect(absoluteResult.title).toBe("Today");

    vi.useRealTimers();
  });

  it("formatArticleDate returns 'Unknown date' rather than 'Invalid Date' for null/empty input", () => {
    expect(formatArticleDate(null)).toEqual({
      text: "Unknown date",
      title: "Unknown date",
    });
    expect(formatArticleDate("")).toEqual({
      text: "Unknown date",
      title: "Unknown date",
    });
  });

  it("prefixes the title with 'First seen:' and appends '*' to the visible text when isFirstSeenFallback is set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const date = new Date("2026-05-15T10:00:00Z");
    const result = formatArticleDate(date, "relative", {
      isFirstSeenFallback: true,
    });

    expect(result.text).toBe("Today *");
    expect(result.title).toMatch(/^First seen: /);

    vi.useRealTimers();
  });

  it("appends '*' to the absolute-style visible text too when isFirstSeenFallback is set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const date = new Date("2026-05-15T10:00:00Z");
    const result = formatArticleDate(date, "absolute", {
      isFirstSeenFallback: true,
    });

    expect(result.text).toMatch(/\*$/);
    expect(result.title).toBe("First seen: Today");

    vi.useRealTimers();
  });

  it("leaves the visible text and title untouched when isFirstSeenFallback is not set", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));

    const date = new Date("2026-05-15T10:00:00Z");
    const result = formatArticleDate(date, "relative");

    expect(result.text).toBe("Today");
    expect(result.title).not.toMatch(/^First seen: /);

    vi.useRealTimers();
  });
});

describe("platform-utils.isNarrowViewport", () => {
  it.each([true, false])(
    "uses the default 768px query and returns matches=%s",
    (matches) => {
      const matchMedia = vi.fn(() => ({ matches }));
      const win = { matchMedia } as unknown as Window;

      expect(MOBILE_LAYOUT_MAX_WIDTH_PX).toBe(768);
      expect(isNarrowViewport(win)).toBe(matches);
      expect(matchMedia).toHaveBeenCalledExactlyOnceWith("(max-width: 768px)");
    },
  );

  it.each([true, false])(
    "uses the folder popup's 600px query and returns matches=%s",
    (matches) => {
      const matchMedia = vi.fn(() => ({ matches }));
      const win = { matchMedia } as unknown as Window;

      expect(FOLDER_POPUP_MOBILE_MAX_WIDTH_PX).toBe(600);
      expect(isNarrowViewport(win, FOLDER_POPUP_MOBILE_MAX_WIDTH_PX)).toBe(
        matches,
      );
      expect(matchMedia).toHaveBeenCalledExactlyOnceWith("(max-width: 600px)");
    },
  );

  it("reevaluates the supplied window on each call", () => {
    const matchMedia = vi
      .fn()
      .mockReturnValueOnce({ matches: true })
      .mockReturnValueOnce({ matches: false });
    const win = { matchMedia } as unknown as Window;

    expect(isNarrowViewport(win, 480)).toBe(true);
    expect(isNarrowViewport(win, 480)).toBe(false);
    expect(matchMedia).toHaveBeenNthCalledWith(1, "(max-width: 480px)");
    expect(matchMedia).toHaveBeenNthCalledWith(2, "(max-width: 480px)");
  });
});
