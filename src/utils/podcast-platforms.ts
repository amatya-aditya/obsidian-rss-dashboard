import { hostMatches, hostPathMatches } from "./url-host";

export interface PodcastPlatform {
  name: string;
  id: string;
  detect(url: string): boolean;
  extractId(url: string): string | null;
}

export const APPLE_PODCASTS: PodcastPlatform = {
  name: "Apple Podcasts",
  id: "apple",
  detect(url: string): boolean {
    return hostMatches(url, "podcasts.apple.com");
  },
  extractId(url: string): string | null {
    const match = url.match(/id(\d+)(?:\?|$)/);
    return match?.[1] ?? null;
  },
};

export const SPOTIFY: PodcastPlatform = {
  name: "Spotify",
  id: "spotify",
  detect(url: string): boolean {
    return hostPathMatches(url, "open.spotify.com", "/show/");
  },
  extractId(url: string): string | null {
    const match = url.match(/show\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  },
};

export const GOOGLE_PODCASTS: PodcastPlatform = {
  name: "Google Podcasts",
  id: "google",
  detect(url: string): boolean {
    return hostPathMatches(url, "podcasts.google.com", "/feed/");
  },
  extractId(url: string): string | null {
    const match = url.match(/feed\/([a-zA-Z0-9_-]+)/);
    return match?.[1] ?? null;
  },
};

export const POCKET_CASTS: PodcastPlatform = {
  name: "Pocket Casts",
  id: "pocketcasts",
  detect(url: string): boolean {
    return hostPathMatches(url, "pocketcasts.com", "/podcast/");
  },
  extractId(url: string): string | null {
    const match = url.match(
      /pocketcasts\.com\/podcast\/[^/]+\/([0-9a-f-]{36})/i,
    );
    return match?.[1] ?? null;
  },
};

/**
 * Detects Pocket Casts short-share links: `https://pca.st/<slug>`.
 *
 * The slug is the path segment after the leading slash. The `extractId`
 * method returns that slug so the resolver can use it for an iTunes search
 * without needing to fetch the redirected page.
 */
export const POCKET_CASTS_SHORT: PodcastPlatform = {
  name: "Pocket Casts (short link)",
  id: "pocketcasts-short",
  detect(url: string): boolean {
    if (!hostMatches(url, "pca.st")) return false;
    try {
      const { pathname } = new URL(url);
      // Require at least one non-empty path segment after "/"
      return pathname.length > 1;
    } catch {
      return false;
    }
  },
  extractId(url: string): string | null {
    try {
      const { pathname } = new URL(url);
      // pathname is "/slug" — strip leading slash
      const slug = pathname.slice(1);
      return slug.length > 0 ? slug : null;
    } catch {
      return null;
    }
  },
};

const PLATFORMS: PodcastPlatform[] = [
  APPLE_PODCASTS,
  SPOTIFY,
  GOOGLE_PODCASTS,
  POCKET_CASTS,
  POCKET_CASTS_SHORT,
];

export function detectPodcastPlatform(url: string): PodcastPlatform | null {
  for (const platform of PLATFORMS) {
    if (platform.detect(url)) {
      return platform;
    }
  }
  return null;
}

export function isPodcastPlatformUrl(url: string): boolean {
  return detectPodcastPlatform(url) !== null;
}
