import { describe, expect, it, vi } from "vitest";
import { copyTextToClipboard, exportBlob } from "../../src/utils/export-utils";

describe("export-utils", () => {
  it("exports via share sheet on mobile when available", async () => {
    const originalCreateObjectURLDesc = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const createObjectURLMock = vi.fn(() => "blob:mock");
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURLMock,
      configurable: true,
    });

    const shareMock = vi
      .fn<[ShareData], Promise<void>>()
      .mockResolvedValue(undefined);
    const originalShareDesc = Object.getOwnPropertyDescriptor(
      navigator,
      "share",
    );
    const originalCanShareDesc = Object.getOwnPropertyDescriptor(
      navigator,
      "canShare",
    );
    Object.defineProperty(navigator, "share", {
      value: shareMock,
      configurable: true,
    });
    Object.defineProperty(navigator, "canShare", {
      value: vi.fn<[ShareData], boolean>().mockReturnValue(true),
      configurable: true,
    });

    const result = await exportBlob({
      blob: new Blob(["{}"], { type: "application/json" }),
      filename: "data.json",
      isMobile: true,
    });

    expect(result).toBe("shared");
    expect(shareMock).toHaveBeenCalledTimes(1);
    const data = shareMock.mock.calls[0][0];
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files?.[0]).toBeInstanceOf(File);
    expect(data.files?.[0]?.name).toBe("data.json");
    expect(createObjectURLMock).not.toHaveBeenCalled();

    if (originalCreateObjectURLDesc) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectURLDesc);
    } else {
      delete (URL as unknown as Record<string, unknown>)["createObjectURL"];
    }
    if (originalShareDesc) {
      Object.defineProperty(navigator, "share", originalShareDesc);
    } else {
      delete (navigator as unknown as Record<string, unknown>)["share"];
    }
    if (originalCanShareDesc) {
      Object.defineProperty(navigator, "canShare", originalCanShareDesc);
    } else {
      delete (navigator as unknown as Record<string, unknown>)["canShare"];
    }
  });

  it("treats AbortError as a canceled export on mobile", async () => {
    const shareMock = vi
      .fn<[ShareData], Promise<void>>()
      .mockRejectedValue(new DOMException("Canceled", "AbortError"));
    const originalShareDesc = Object.getOwnPropertyDescriptor(
      navigator,
      "share",
    );
    Object.defineProperty(navigator, "share", {
      value: shareMock,
      configurable: true,
    });

    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const result = await exportBlob({
      blob: new Blob(["{}"], { type: "application/json" }),
      filename: "data.json",
      isMobile: true,
    });

    expect(result).toBe("canceled");
    expect(openSpy).not.toHaveBeenCalled();

    openSpy.mockRestore();
    if (originalShareDesc) {
      Object.defineProperty(navigator, "share", originalShareDesc);
    } else {
      delete (navigator as unknown as Record<string, unknown>)["share"];
    }
  });

  it("falls back to opening the blob URL on mobile when share is unavailable", async () => {
    vi.useFakeTimers();

    const originalShareDesc = Object.getOwnPropertyDescriptor(
      navigator,
      "share",
    );
    Object.defineProperty(navigator, "share", {
      value: undefined,
      configurable: true,
    });

    const originalCreateObjectURLDesc = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const originalRevokeObjectURLDesc = Object.getOwnPropertyDescriptor(
      URL,
      "revokeObjectURL",
    );
    const createObjectURLMock = vi.fn(() => "blob:mock");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURLMock,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURLMock,
      configurable: true,
    });

    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => window);

    const result = await exportBlob({
      blob: new Blob(["{}"], { type: "application/json" }),
      filename: "data.json",
      isMobile: true,
    });

    expect(result).toBe("opened");
    expect(openSpy).toHaveBeenCalledWith("blob:mock", "_blank");

    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock");

    vi.useRealTimers();
    openSpy.mockRestore();
    if (originalCreateObjectURLDesc) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectURLDesc);
    } else {
      delete (URL as unknown as Record<string, unknown>)["createObjectURL"];
    }
    if (originalRevokeObjectURLDesc) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURLDesc);
    } else {
      delete (URL as unknown as Record<string, unknown>)["revokeObjectURL"];
    }
    if (originalShareDesc) {
      Object.defineProperty(navigator, "share", originalShareDesc);
    } else {
      delete (navigator as unknown as Record<string, unknown>)["share"];
    }
  });

  it("downloads via anchor on desktop", async () => {
    vi.useFakeTimers();

    const originalCreateObjectURLDesc = Object.getOwnPropertyDescriptor(
      URL,
      "createObjectURL",
    );
    const originalRevokeObjectURLDesc = Object.getOwnPropertyDescriptor(
      URL,
      "revokeObjectURL",
    );
    const createObjectURLMock = vi.fn(() => "blob:mock");
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURLMock,
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURLMock,
      configurable: true,
    });

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const appendSpy = vi.spyOn(document.body, "appendChild");

    const result = await exportBlob({
      blob: new Blob(["{}"], { type: "application/json" }),
      filename: "data.json",
      isMobile: false,
    });

    expect(result).toBe("downloaded");
    expect(clickSpy).toHaveBeenCalled();

    const appended = appendSpy.mock.calls.find(
      ([node]) => node instanceof HTMLAnchorElement,
    )?.[0] as HTMLAnchorElement | undefined;
    expect(appended).toBeDefined();
    expect(appended?.download).toBe("data.json");
    expect(appended?.href).toBe("blob:mock");

    await vi.advanceTimersByTimeAsync(1000);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock");

    vi.useRealTimers();
    appendSpy.mockRestore();
    clickSpy.mockRestore();
    if (originalCreateObjectURLDesc) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectURLDesc);
    } else {
      delete (URL as unknown as Record<string, unknown>)["createObjectURL"];
    }
    if (originalRevokeObjectURLDesc) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURLDesc);
    } else {
      delete (URL as unknown as Record<string, unknown>)["revokeObjectURL"];
    }
  });

  it("copies using navigator.clipboard when available", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    const originalClipboardDesc = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextMock },
      configurable: true,
    });

    const result = await copyTextToClipboard("hello");
    expect(result).toBe("copied");
    expect(writeTextMock).toHaveBeenCalledWith("hello");

    if (originalClipboardDesc) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDesc);
    } else {
      delete (navigator as unknown as Record<string, unknown>)["clipboard"];
    }
  });

  it("falls back to document.execCommand('copy') when clipboard API is missing", async () => {
    const originalClipboardDesc = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    const execCommandMock = vi.fn<[string], boolean>(() => true);
    const originalExecCommandDesc = Object.getOwnPropertyDescriptor(
      document,
      "execCommand",
    );
    Object.defineProperty(document, "execCommand", {
      value: execCommandMock,
      configurable: true,
    });

    const result = await copyTextToClipboard("hello");
    expect(result).toBe("copied");
    expect(execCommandMock).toHaveBeenCalledWith("copy");

    if (originalExecCommandDesc) {
      Object.defineProperty(document, "execCommand", originalExecCommandDesc);
    } else {
      delete (document as unknown as Record<string, unknown>)["execCommand"];
    }
    if (originalClipboardDesc) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDesc);
    } else {
      delete (navigator as unknown as Record<string, unknown>)["clipboard"];
    }
  });

  it("returns failed when both clipboard API and execCommand fail", async () => {
    const originalClipboardDesc = Object.getOwnPropertyDescriptor(
      navigator,
      "clipboard",
    );
    Object.defineProperty(navigator, "clipboard", {
      value: undefined,
      configurable: true,
    });

    const execCommandMock = vi.fn<[string], boolean>(() => false);
    const originalExecCommandDesc = Object.getOwnPropertyDescriptor(
      document,
      "execCommand",
    );
    Object.defineProperty(document, "execCommand", {
      value: execCommandMock,
      configurable: true,
    });

    const result = await copyTextToClipboard("hello");
    expect(result).toBe("failed");

    if (originalExecCommandDesc) {
      Object.defineProperty(document, "execCommand", originalExecCommandDesc);
    } else {
      delete (document as unknown as Record<string, unknown>)["execCommand"];
    }
    if (originalClipboardDesc) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDesc);
    } else {
      delete (navigator as unknown as Record<string, unknown>)["clipboard"];
    }
  });
});
