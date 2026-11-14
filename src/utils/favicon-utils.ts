export const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export const failedFeedIconUrls = new Set<string>();

/**
 * Consecutive failed loads per URL. A URL is blacklisted for the session only
 * after it fails this many times in a row; a successful load clears the count.
 */
const FEED_ICON_FAILURES_BEFORE_BLACKLIST = 2;

const feedIconFailureCounts = new Map<string, number>();

export function resetFeedIconFailureCache(): void {
  failedFeedIconUrls.clear();
  feedIconFailureCounts.clear();
}

export function createSafeIconImage(
  container: HTMLElement,
  src: string,
  alt: string,
  onErrorFallback: () => void,
  cssClass?: string,
): HTMLImageElement {
  const img = container.createEl("img", {
    attr: { src, alt },
    cls: cssClass ?? "rss-dashboard-feed-icon-img",
  });

  img.onload = () => {
    feedIconFailureCounts.delete(src);
  };

  img.onerror = () => {
    // Detach both handlers before swapping in the transparent pixel, so its
    // load cannot clear the failure count this handler is about to record.
    img.onload = null;
    img.onerror = null;

    const failures = (feedIconFailureCounts.get(src) ?? 0) + 1;
    if (failures >= FEED_ICON_FAILURES_BEFORE_BLACKLIST) {
      failedFeedIconUrls.add(src);
      feedIconFailureCounts.delete(src);
    } else {
      feedIconFailureCounts.set(src, failures);
    }

    img.src = TRANSPARENT_PIXEL;
    onErrorFallback();
  };

  return img;
}

export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      if (parts.length === 3 && parts[0] === "feeds") {
        return `${parts[1]}.${parts[2]}`;
      } else if (parts.length >= 3) {
        return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
      } else {
        return hostname;
      }
    }
    return hostname;
  } catch {
    const match = url.match(/https?:\/\/([^/?]+)/);
    if (match) {
      const hostname = match[1];
      if (!hostname) {
        return "";
      }
      const parts = hostname.split(".");
      if (parts.length >= 2) {
        if (parts.length === 3 && parts[0] === "feeds") {
          return `${parts[1] ?? ""}.${parts[2] ?? ""}`;
        } else if (parts.length >= 3) {
          return `${parts[parts.length - 2] ?? hostname}.${parts[parts.length - 1] ?? hostname}`;
        } else {
          return hostname;
        }
      }

      return hostname;
    }
    return "";
  }
}

export function getFaviconUrl(domain: string): string {
  if (!domain) return "";
  return `https://www.google.com/s2/favicons?sz=32&domain_url=http://${domain}`;
}
