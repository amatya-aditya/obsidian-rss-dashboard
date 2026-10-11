/**
 * Opt-in developer logging.
 *
 * Obsidian's plugin guidelines ask the developer console to show only error
 * messages by default, so these diagnostics stay silent unless a build turns
 * them on. `esbuild`'s `define` bakes in the flag below (see
 * esbuild.config.mjs): the production build gets `false`, and the dev/watch
 * build gets `true` for local diagnosis. Warnings and errors never route
 * through here; `console.warn` and `console.error` stay direct.
 */

// Replaced with a literal by esbuild's `define` (see esbuild.config.mjs).
declare const __RSS_DASHBOARD_DEBUG__: boolean | undefined;

let debugOverride: boolean | null = null;

function isDebugLoggingEnabled(): boolean {
  if (debugOverride !== null) return debugOverride;
  return (
    typeof __RSS_DASHBOARD_DEBUG__ !== "undefined" &&
    __RSS_DASHBOARD_DEBUG__ === true
  );
}

/**
 * Overrides the build default for the current session. Tests use this to
 * exercise the enabled path; production code never calls it.
 */
export function setDebugLoggingEnabled(enabled: boolean | null): void {
  debugOverride = enabled;
}

/** Writes a diagnostic to the developer console only when debug logging is on. */
export function debugLog(...args: unknown[]): void {
  if (!isDebugLoggingEnabled()) return;
  console.debug(...args);
}
