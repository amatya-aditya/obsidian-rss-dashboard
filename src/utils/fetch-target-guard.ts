// What the live-version fetch may read (#1766). The reader, the article saver
// and the cover-image fetch decode a response as text and parse it with
// DOMParser and Readability on the main thread; a PDF or archive turns into a
// multi-MB string and freezes Obsidian. Only a web page is worth that parse.

/** Extensions of linked files that are never an article page. */
const NON_PAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  // documents
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "odp",
  "epub",
  // archives and installers
  "zip",
  "gz",
  "tgz",
  "bz2",
  "xz",
  "7z",
  "rar",
  "tar",
  "dmg",
  "exe",
  "msi",
  "apk",
  // images
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "avif",
  "bmp",
  "tif",
  "tiff",
  "ico",
  // audio and video
  "mp3",
  "m4a",
  "wav",
  "flac",
  "ogg",
  "mp4",
  "m4v",
  "mov",
  "mkv",
  "webm",
  "avi",
]);

/**
 * True when the URL's path ends in a file extension that is not a web page, so
 * the fetch can be skipped before any request. A URL that cannot be parsed, or
 * whose path has no such extension, is left to the response check.
 */
export function isNonPageUrl(url: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
  const dot = lastSegment.lastIndexOf(".");
  if (dot < 0) return false;
  return NON_PAGE_EXTENSIONS.has(lastSegment.slice(dot + 1).toLowerCase());
}

/**
 * True when the response declares a type that is not an HTML or XHTML page. A
 * response with no `Content-Type` is allowed: some servers omit it, and the
 * page is then read as before.
 */
export function isNonPageContentType(contentType: string | undefined): boolean {
  const mediaType = (contentType ?? "").split(";")[0]?.trim().toLowerCase();
  if (!mediaType) return false;
  return mediaType !== "text/html" && mediaType !== "application/xhtml+xml";
}

/**
 * The largest page, in bytes, that is decoded and parsed. A larger page is not
 * worth the main-thread parse cost: DOMParser and Readability scale with the
 * document size.
 */
export const MAX_PAGE_BYTES = 5_000_000;

/** True when a response of this many bytes is too large to decode and parse. */
export function isOversizedPage(byteLength: number): boolean {
  return byteLength > MAX_PAGE_BYTES;
}
