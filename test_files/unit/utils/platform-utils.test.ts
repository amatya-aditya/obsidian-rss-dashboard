import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Obsidian from "obsidian";
import {
  attachInputClearButton,
  ensureUtf8Meta,
  formatRelativeTime,
  getViewportTier,
  isPhoneViewport,
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

    const result = await robustFetch("https://example.com/text-only", { method: "POST" });
    expect(result).toBe("ok");
  });
});

describe("platform-utils.attachInputClearButton", () => {
  it("toggles visibility on input events and clears on click", () => {
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const input = document.createElement("input");
    input.type = "text";
    wrapper.appendChild(input);
    const onClear = vi.fn();

    const clearButton = attachInputClearButton(
      wrapper,
      input,
      onClear,
    );

    expect(clearButton.dataset.icon).toBe("x");
    expect(clearButton.classList.contains("rss-discover-search-clear")).toBe(true);
    expect(clearButton.classList.contains("rss-discover-search-clear-hidden")).toBe(true);

    input.value = "abc";
    input.dispatchEvent(new Event("input"));
    expect(clearButton.classList.contains("rss-discover-search-clear-hidden")).toBe(false);

    clearButton.click();
    expect(input.value).toBe("");
    expect(clearButton.classList.contains("rss-discover-search-clear-hidden")).toBe(true);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("supports keyboard activation via Enter and Space", () => {
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const input = document.createElement("input");
    input.type = "text";
    wrapper.appendChild(input);
    input.value = "abc";

    const onClear = vi.fn();
    const clearButton = attachInputClearButton(wrapper, input, onClear);

    input.dispatchEvent(new Event("input"));
    expect(clearButton.classList.contains("rss-discover-search-clear-hidden")).toBe(false);

    const enterEvent = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    clearButton.dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(input.value).toBe("");

    input.value = "xyz";
    input.dispatchEvent(new Event("input"));
    const spaceEvent = new KeyboardEvent("keydown", { key: " ", cancelable: true });
    clearButton.dispatchEvent(spaceEvent);
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(onClear).toHaveBeenCalledTimes(2);
    expect(input.value).toBe("");
  });

  it("honors useButtonElement and custom classes", () => {
    const wrapper = document.createElement("div");
    document.body.appendChild(wrapper);
    const input = document.createElement("input");
    input.type = "text";
    wrapper.appendChild(input);
    input.value = "abc";

    const onClear = vi.fn();
    const clearButton = attachInputClearButton(wrapper, input, onClear, {
      useButtonElement: true,
      buttonClass: "my-clear",
      hiddenClass: "my-hidden",
    });

    expect(clearButton.tagName).toBe("BUTTON");
    expect(clearButton.getAttribute("type")).toBe("button");
    expect(clearButton.getAttribute("aria-label")).toBe("Clear search");
    expect(clearButton.getAttribute("title")).toBe("Clear search");
    expect(clearButton.classList.contains("my-clear")).toBe(true);
    expect(clearButton.classList.contains("my-hidden")).toBe(false);

    input.value = "";
    input.dispatchEvent(new Event("input"));
    expect(clearButton.classList.contains("my-hidden")).toBe(true);
  });
});

describe("platform-utils.misc", () => {
  it("ensureUtf8Meta inserts a meta charset when missing", () => {
    expect(ensureUtf8Meta("<div>hi</div>")).toBe('<meta charset="UTF-8"><div>hi</div>');
    expect(ensureUtf8Meta('   <meta charset="UTF-8"><div>hi</div>')).toBe(
      '   <meta charset="UTF-8"><div>hi</div>',
    );
  });

  it("formatRelativeTime handles invalid and future dates deterministically", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-29T12:00:00Z"));

    expect(formatRelativeTime("not-a-date")).toBe("Invalid date");
    expect(formatRelativeTime(new Date("2026-03-30T12:00:00Z"))).toBe("Just now");

    vi.useRealTimers();
  });

  it("setCssProps sets custom properties", () => {
    const el = document.createElement("div");
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
});

