import type { PageCoverImageResult } from "./page-cover-image-service";

/**
 * The Notice text for a failed cover-image fetch (#1314), or null when there is
 * nothing to report: a stored image needs no notice, and "skipped" means no
 * request was made at all, so the action should not have been offered.
 */
export function coverImageFailureNotice(
  result: PageCoverImageResult,
): string | null {
  if (result.status === "found" || result.status === "skipped") return null;
  if (result.status === "restricted") {
    return "That page is restricted, so no cover image was read.";
  }
  if (result.status === "none") {
    return "No cover image found on that page.";
  }
  if (result.reason === "blocked") {
    return "The site refused the request, so no cover image was read.";
  }
  return result.reason === "timeout"
    ? "The article page timed out, so no cover image was read."
    : "Could not reach the article page, so no cover image was read.";
}
