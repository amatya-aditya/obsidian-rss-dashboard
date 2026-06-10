export function optimizeImageUrl(url: string, maxWidth = 600): string {
  if (!url) return url;

  // NPR / Brightspot CDN
  if (url.includes("brightspotcdn.com")) {
    return url
      .replace(/\/crop\/\d+x\d+\//g, "/")
      .replace(/\/resize\/\d+x\d+(\/|$)/g, `/resize/${maxWidth}x/`);
  }

  // WordPress Photon / Jetpack CDN
  if (
    url.includes("i0.wp.com") ||
    url.includes("i1.wp.com") ||
    url.includes("i2.wp.com")
  ) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("w", String(maxWidth));
      parsed.searchParams.delete("h");
      return parsed.toString();
    } catch {
      return url;
    }
  }

  // Cloudinary
  if (url.includes("cloudinary.com")) {
    return url.replace(/\/upload\//, `/upload/w_${maxWidth},c_scale/`);
  }

  // Generic: return unchanged (unknown CDN, no safe transform)
  return url;
}

export function optimizeImageUrlsInContent(content: string, maxWidth = 600): string {
  if (!content) return content;

  return content.replace(
    /<img([^>]+)src=["']([^"']+)["']/gi,
    (match: string, attributes: string, src: string) => {
      const optimizedSrc = optimizeImageUrl(src, maxWidth);
      return `<img${attributes}src="${optimizedSrc}"`;
    }
  );
}