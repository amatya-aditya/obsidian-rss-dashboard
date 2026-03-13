import { requestUrl, RequestUrlParam } from "obsidian";

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const targetDate = typeof date === "string" ? new Date(date) : date;

  if (isNaN(targetDate.getTime())) {
    return "Invalid date";
  }

  if (now.toDateString() === targetDate.toDateString()) {
    return "Today";
  }

  const diffInMs = now.getTime() - targetDate.getTime();

  // Handle future dates - treat as "Just now" to avoid confusing output
  // like "in 6,638,873 seconds"
  if (diffInMs < 0) {
    return "Just now";
  }

  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInWeeks = Math.floor(diffInDays / 7);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  if (typeof Intl !== "undefined" && Intl.RelativeTimeFormat) {
    try {
      const rtf = new Intl.RelativeTimeFormat("en", {
        numeric: "auto",
        style: "long",
      });

      if (diffInYears > 0) {
        return rtf.format(-diffInYears, "year");
      } else if (diffInMonths > 0) {
        return rtf.format(-diffInMonths, "month");
      } else if (diffInWeeks > 0) {
        return rtf.format(-diffInWeeks, "week");
      } else if (diffInDays > 0) {
        return rtf.format(-diffInDays, "day");
      } else if (diffInHours > 0) {
        return rtf.format(-diffInHours, "hour");
      } else if (diffInMinutes > 0) {
        return rtf.format(-diffInMinutes, "minute");
      } else {
        return rtf.format(-diffInSeconds, "second");
      }
    } catch {
      // Fall through to manual formatting if Intl.RelativeTimeFormat fails
    }
  }

  if (diffInYears > 0) {
    return `${diffInYears} year${diffInYears > 1 ? "s" : ""} ago`;
  } else if (diffInMonths > 0) {
    return `${diffInMonths} month${diffInMonths > 1 ? "s" : ""} ago`;
  } else if (diffInWeeks > 0) {
    return `${diffInWeeks} week${diffInWeeks > 1 ? "s" : ""} ago`;
  } else if (diffInDays > 0) {
    return `${diffInDays} day${diffInDays > 1 ? "s" : ""} ago`;
  } else if (diffInHours > 0) {
    return `${diffInHours} hour${diffInHours > 1 ? "s" : ""} ago`;
  } else if (diffInMinutes > 0) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? "s" : ""} ago`;
  } else {
    return "Just now";
  }
}

export function formatDateWithRelative(date: Date | string): {
  text: string;
  title: string;
} {
  const targetDate = typeof date === "string" ? new Date(date) : date;
  const relativeTime = formatRelativeTime(targetDate);
  const absoluteDate = targetDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return {
    text: relativeTime,
    title: absoluteDate,
  };
}

export function ensureUtf8Meta(html: string): string {
  if (!/^\s*<meta[^>]+charset=/i.test(html)) {
    return '<meta charset="UTF-8">' + html;
  }
  return html;
}

/**
 * Robust fetch that handles encoding detection and manual decoding.
 * Useful for Android where requestUrl might mis-detect encoding.
 */
export async function robustFetch(
  url: string,
  options: Partial<RequestUrlParam> = {},
): Promise<string> {
  const response = await requestUrl({
    ...options,
    url,
    method: options.method || "GET",
  });

  if (!response.arrayBuffer) {
    return response.text || "";
  }

  const contentType = response.headers["content-type"] || "";
  let charset = detectCharsetFromHeader(contentType);

  if (!charset) {
    // Try to detect from body if not in header
    charset = detectCharsetFromBody(response.arrayBuffer);
  }

  // Default to utf-8 if still not found
  charset = charset || "utf-8";

  try {
    const decoder = new TextDecoder(charset);
    return decoder.decode(response.arrayBuffer);
  } catch (e) {
    console.warn(`[RSS Dashboard] Failed to decode with charset ${charset}:`, e);
    // Fallback to utf-8 if specified charset fails
    const decoder = new TextDecoder("utf-8");
    return decoder.decode(response.arrayBuffer);
  }
}

function detectCharsetFromHeader(contentType: string): string | null {
  const match = contentType.match(/charset=([^;]+)/i);
  return match ? match[1].trim() : null;
}

function detectCharsetFromBody(buffer: ArrayBuffer): string | null {
  // We only look at the first 2048 bytes for speed
  const view = new Uint8Array(buffer.slice(0, 2048));
  const text = new TextDecoder("ascii").decode(view);

  // Look for <meta charset="...">
  const charsetMatch = text.match(/<meta[^>]+charset=["']?([^"' >]+)/i);
  if (charsetMatch) return charsetMatch[1];

  // Look for <meta http-equiv="Content-Type" content="...charset=...">
  const equivMatch = text.match(
    /<meta[^>]+http-equiv=["']?Content-Type["']?[^>]+content=["']?[^"'>]+charset=([^"' >]+)/i,
  );
  if (equivMatch) return equivMatch[1];

  return null;
}

/**
 * Set CSS custom properties on an element
 * @param element The HTML element to set properties on
 * @param props An object with CSS property names as keys and values
 */
export function setCssProps(
  element: HTMLElement,
  props: Record<string, string>,
): void {
  for (const [property, value] of Object.entries(props)) {
    element.style.setProperty(property, value);
  }
}

export const PHONE_MAX_WIDTH = 768;
export const TABLET_LAYOUT_MAX_WIDTH = 1200;

export type ViewportTier = "phone" | "tablet" | "desktop";

function getViewportWidth(viewportWidth?: number): number {
  if (typeof viewportWidth === "number" && Number.isFinite(viewportWidth)) {
    return viewportWidth;
  }
  if (typeof window === "undefined") {
    return TABLET_LAYOUT_MAX_WIDTH + 1;
  }
  return window.innerWidth;
}

export function isPhoneViewport(viewportWidth?: number): boolean {
  return getViewportWidth(viewportWidth) <= PHONE_MAX_WIDTH;
}

export function isTabletViewport(viewportWidth?: number): boolean {
  const width = getViewportWidth(viewportWidth);
  return width > PHONE_MAX_WIDTH && width <= TABLET_LAYOUT_MAX_WIDTH;
}

export function shouldUseMobileSidebarLayout(viewportWidth?: number): boolean {
  const width = getViewportWidth(viewportWidth);
  return isPhoneViewport(width) || isTabletViewport(width);
}

export function getViewportTier(viewportWidth?: number): ViewportTier {
  const width = getViewportWidth(viewportWidth);
  if (isPhoneViewport(width)) {
    return "phone";
  }
  if (isTabletViewport(width)) {
    return "tablet";
  }
  return "desktop";
}
