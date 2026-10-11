import { afterEach, describe, expect, it, vi } from "vitest";
import {
  debugLog,
  setDebugLoggingEnabled,
} from "../../../src/utils/debug-logger";

/**
 * The plugin's diagnostics are silent by default so the developer console
 * shows only errors (Obsidian's plugin guidelines). A build or a test opts in
 * through the debug flag; these tests pin both sides of that gate.
 */
describe("debugLog", () => {
  afterEach(() => {
    setDebugLoggingEnabled(null);
    vi.restoreAllMocks();
  });

  it("writes nothing to the console by default", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

    debugLog("[RSS Dashboard] diagnostic");

    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("writes the diagnostic through to the console once enabled", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    setDebugLoggingEnabled(true);

    debugLog("[RSS Dashboard] diagnostic", { detail: 1 });

    expect(debugSpy).toHaveBeenCalledWith("[RSS Dashboard] diagnostic", {
      detail: 1,
    });
  });

  it("stays silent again after it is disabled", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    setDebugLoggingEnabled(true);
    setDebugLoggingEnabled(false);

    debugLog("[RSS Dashboard] diagnostic");

    expect(debugSpy).not.toHaveBeenCalled();
  });
});
