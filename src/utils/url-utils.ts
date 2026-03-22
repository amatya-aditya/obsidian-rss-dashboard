export function isOpenableHttpUrl(rawUrl: string): boolean {
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
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
    const pathname = parsedUrl.pathname.replace(/\/+$/, "");
    return `${hostname}${port}${pathname}${parsedUrl.search}`;
  } catch {
    const trimmed = rawUrl.trim().toLowerCase().replace(/\/+$/, "");
    return trimmed ? trimmed : null;
  }
}

