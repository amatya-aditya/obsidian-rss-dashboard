export function isOpenableHttpUrl(rawUrl: string): boolean {
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Canonicalize a URL-like guid used to identify feed items.
 *
 * Some feeds (e.g. BBC) use a numeric URL fragment (`#0`, `#1`, ...) that can
 * change between refreshes for the same article, causing duplicate items to
 * accumulate if we treat it as part of identity.
 *
 * Rules:
 * - Only affects valid http(s) URLs
 * - Only strips numeric fragments like `#0`, `#1`, ...
 * - Leaves everything else (including query params and non-numeric fragments) unchanged
 */
export function canonicalizeItemIdentityUrl(rawId: string): string {
  const trimmed = (rawId ?? "").trim();
  if (!trimmed) return trimmed;

  try {
    const parsedUrl = new URL(trimmed);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return trimmed;
    }

    const hash = parsedUrl.hash || "";
    if (!hash) return trimmed;
    if (!/^#\d+$/.test(hash)) return trimmed;

    // Preserve the original string formatting (avoid URL re-serialization).
    return trimmed.endsWith(hash) ? trimmed.slice(0, -hash.length) : trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Resolve a potentially relative URL against a base URL and ensure it is http(s).
 * If the URL is already an absolute http(s) URL, returns the original string
 * (trimmed) to preserve formatting.
 */
export function resolveAbsoluteHttpUrl(
  maybeRelativeUrl: string | undefined | null,
  baseUrl: string,
): string | null {
  const raw = (maybeRelativeUrl ?? "").trim();
  if (!raw || raw === "#") return null;

  if (isOpenableHttpUrl(raw)) return raw;

  try {
    const resolved = new URL(raw, baseUrl).toString();
    return isOpenableHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

export function normalizeUrlForComparison(rawUrl: string): string | null {
  try {
    const parsedUrl = new URL(rawUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const port = parsedUrl.port ? `:${parsedUrl.port}` : "";
    const pathname = parsedUrl.pathname.toLowerCase().replace(/\/+$/, "");
    return `${hostname}${port}${pathname}${parsedUrl.search}`;
  } catch {
    const trimmed = rawUrl.trim().toLowerCase().replace(/\/+$/, "");
    return trimmed ? trimmed : null;
  }
}
