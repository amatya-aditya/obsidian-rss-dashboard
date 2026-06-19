export function decodeUriFeedUrl(rawUrl: string): string {
  const candidate = rawUrl.trim();
  if (!candidate) {
    throw new Error("Missing required URL parameter for add-feed.");
  }

  if (!candidate.includes("%")) {
    return candidate;
  }

  try {
    return decodeURIComponent(candidate);
  } catch {
    throw new Error(
      "Feed URL is malformed. Ensure the url parameter is URL-encoded.",
    );
  }
}

export function buildUriAddFeedTitle(feedUrl: string): string {
  try {
    const parsed = new URL(feedUrl);
    const hostname = parsed.hostname.replace(/^www\./i, "").trim();
    return hostname || feedUrl;
  } catch {
    return feedUrl;
  }
}
