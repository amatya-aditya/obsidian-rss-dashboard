/**
 * Identifies the exact build a device is running, so builds can be compared
 * across devices and quoted in bug reports. `manifest.json`'s version is the
 * same for every local build, so it cannot do this on its own (issue #373).
 */
export interface BuildInfo {
  /**
   * Short git commit the bundle was built from, "unknown" when git was
   * unavailable, or "" for a reproducible release build (which embeds no
   * environment-specific value).
   */
  commit: string;
  /** True when the working tree had uncommitted changes at build time. */
  dirty: boolean;
  /** ISO 8601 build time in UTC, or "" when unknown or a release build. */
  builtAt: string;
}

// Replaced with a literal by esbuild's `define` (see esbuild.config.mjs).
declare const __RSS_DASHBOARD_BUILD__: BuildInfo | undefined;

const UNKNOWN_BUILD: BuildInfo = {
  commit: "unknown",
  dirty: false,
  builtAt: "",
};

export function getBuildInfo(): BuildInfo {
  return typeof __RSS_DASHBOARD_BUILD__ !== "undefined"
    ? __RSS_DASHBOARD_BUILD__
    : { ...UNKNOWN_BUILD };
}

/**
 * For example "Version 2.7.0 · build 96cd0b7+dirty · 2026-09-24 18:03 UTC".
 * The time is in UTC so the label reads the same on every device. A
 * reproducible release build carries no build-specific value, so its label is
 * just "Version 2.8.0"; the commit and time are omitted rather than shown
 * empty.
 */
export function formatBuildLabel(version: string, build: BuildInfo): string {
  const parts = [`Version ${version}`];
  if (build.commit) {
    parts.push(`build ${build.commit}${build.dirty ? "+dirty" : ""}`);
  }
  if (build.builtAt) {
    parts.push(`${build.builtAt.slice(0, 16).replace("T", " ")} UTC`);
  }
  return parts.join(" · ");
}
