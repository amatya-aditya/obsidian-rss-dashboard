export const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

export const failedFeedIconUrls = new Set<string>();

export function resetFeedIconFailureCache(): void {
  failedFeedIconUrls.clear();
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

  img.onerror = () => {
    failedFeedIconUrls.add(src);
    img.onerror = null;
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
    }
    return "";
  }
}

export function getFaviconUrl(domain: string): string {
  if (!domain) return "";
  return `https://www.google.com/s2/favicons?sz=32&domain_url=http://${domain}`;
}