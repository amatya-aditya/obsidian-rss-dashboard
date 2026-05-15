export function isOpenableHttpUrl(rawUrl: string): boolean {
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * YouTube video IDs are 11-character base64url strings ([-_A-Za-z0-9]{11}).
 */
const YT_VIDEO_ID_RE = /^[-_A-Za-z0-9]{11}$/;

/**
 * Extract a YouTube video ID from any known identity form:
 *   - yt:video:VIDEO_ID          (YouTube Atom feed <id> element)
 *   - https://www.youtube.com/watch?v=VIDEO_ID
 *   - https://www.youtube.com/shorts/VIDEO_ID
 *   - https://youtu.be/VIDEO_ID
 *
 * Returns the 11-char video ID string, or null if not a recognised YouTube identity.
 */
function extractYouTubeVideoId(rawId: string): string | null {
  if (rawId.startsWith("yt:video:")) {
    const id = rawId.slice("yt:video:".length);
    return YT_VIDEO_ID_RE.test(id) ? id : null;
  }
  try {
    const u = new URL(rawId);
    const host = u.hostname.toLowerCase();
    if (
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com"
    ) {
      const v = u.searchParams.get("v");
      if (v && YT_VIDEO_ID_RE.test(v)) return v;
      const shortsMatch = u.pathname.match(
        /^\/shorts\/([-_A-Za-z0-9]{11})(?:[/?#]|$)/,
      );
      if (shortsMatch) return shortsMatch[1];
    }
    if (host === "youtu.be") {
      const pathId = u.pathname.slice(1).split(/[/?#]/)[0];
      if (YT_VIDEO_ID_RE.test(pathId)) return pathId;
    }
  } catch {
    // not a URL – fall through
  }
  return null;
}

/**
 * Canonicalize a URL-like guid used to identify feed items.
 *
 * Rules (applied in order):
 * 1. YouTube identity forms (yt:video:ID, watch?v=ID, shorts/ID, youtu.be/ID)
 *    are all normalised to `yt:video:VIDEO_ID` so the same video never
 *    accumulates duplicate entries when YouTube's <id> format changes between
 *    refreshes or parsing paths.
 * 2. Some feeds (e.g. BBC) use a numeric URL fragment (`#0`, `#1`, ...) that
 *    can change between refreshes; the fragment is stripped.
 * 3. Everything else is returned unchanged.
 */
export function canonicalizeItemIdentityUrl(rawId: string): string {
  const trimmed = (rawId ?? "").trim();
  if (!trimmed) return trimmed;

  // Rule 1 – YouTube identity normalisation
  const ytVideoId = extractYouTubeVideoId(trimmed);
  if (ytVideoId) return `yt:video:${ytVideoId}`;

  // Rule 2 – strip numeric URL fragments (BBC-style)
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
