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
        return url.includes("podcasts.apple.com");
    },
    extractId(url: string): string | null {
        const match = url.match(/id(\d+)(?:\?|$)/);
        return match ? match[1] : null;
    }
};

export const SPOTIFY: PodcastPlatform = {
    name: "Spotify",
    id: "spotify",
    detect(url: string): boolean {
        return url.includes("open.spotify.com/show/");
    },
    extractId(url: string): string | null {
        const match = url.match(/show\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }
};

export const GOOGLE_PODCASTS: PodcastPlatform = {
    name: "Google Podcasts",
    id: "google",
    detect(url: string): boolean {
        return url.includes("podcasts.google.com/feed/");
    },
    extractId(url: string): string | null {
        const match = url.match(/feed\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
    }
};

const PLATFORMS: PodcastPlatform[] = [
    APPLE_PODCASTS,
    SPOTIFY,
    GOOGLE_PODCASTS
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
