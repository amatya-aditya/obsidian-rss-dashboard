import { afterEach, describe, expect, it, vi } from "vitest";
import {
  prefersReducedMotion,
  REDUCED_MOTION_QUERY,
  smoothScrollBehavior,
} from "../../../src/utils/motion-preference";

// jsdom has no media engine, so each test says what the user's OS preference is.
function mockPreference(reduce: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({ matches: reduce && query === REDUCED_MOTION_QUERY }) as MediaQueryList,
  );
}

describe("motion preference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports the operating system's reduce-motion preference", () => {
    mockPreference(true);
    expect(prefersReducedMotion(window)).toBe(true);
    mockPreference(false);
    expect(prefersReducedMotion(window)).toBe(false);
  });

  it("asks the window it is given, so a popout answers for itself", () => {
    const popout = {
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    } as unknown as Window;
    expect(prefersReducedMotion(popout)).toBe(true);
    expect(popout.matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
  });

  it("scrolls instantly instead of smoothly when motion is reduced", () => {
    mockPreference(true);
    expect(smoothScrollBehavior(window)).toBe("auto");
    mockPreference(false);
    expect(smoothScrollBehavior(window)).toBe("smooth");
  });
});
