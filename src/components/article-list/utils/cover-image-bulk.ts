import type { FeedItem } from "../../../types/types";
import {
  resolveCoverImageOffer,
  type CoverImageAvailability,
} from "./cover-image-action";

/**
 * What the fetch-all-covers button shows (#1702): ready, unavailable because no
 * card on the page needs a cover, or a run in progress (a press cancels it).
 */
export type FetchAllCoversState = "idle" | "disabled" | "running";

/**
 * How many page requests the bulk cover-image fetch keeps open at once. The
 * feed-refresh limit does not apply: a cover fetch reads an article page on the
 * publisher's own site, and it must not queue behind (or starve) a refresh.
 */
export const BULK_COVER_IMAGE_CONCURRENCY = 3;

/**
 * The cards the bulk fetch runs on: the ones whose own control would offer the
 * fetch. That covers a card with no cover and one that only has the
 * feed's cover; it leaves out a card that already holds a fetched cover (its
 * control offers the restore, which a bulk run never performs) and any card
 * the fetch cannot reach, so the bulk run and the single-card control cannot
 * disagree about which cards qualify.
 */
export function selectBulkCoverImageTargets(
  articles: readonly FeedItem[],
  availability: CoverImageAvailability,
): FeedItem[] {
  return articles.filter(
    (article) =>
      resolveCoverImageOffer(article, availability)?.role === "fetch",
  );
}

export interface BulkCoverImageRunOptions {
  targets: readonly FeedItem[];
  /** Runs one card's fetch; resolves true when a cover was stored. */
  fetchOne: (article: FeedItem) => Promise<boolean>;
  /** Cancels the run: no new fetch starts, and the running ones finish. */
  signal: AbortSignal;
}

export interface BulkCoverImageResult {
  attempted: number;
  fetched: number;
  /** Targets a cancel kept from starting. */
  notStarted: number;
  cancelled: boolean;
}

/**
 * Runs the fetch over `targets` with a small worker pool. A fetch that
 * throws counts as a failure and does not stop the others. A cancel leaves the
 * covers already stored in place and lets the fetches in flight finish, so the
 * result still accounts for every started request.
 */
export async function runBulkCoverImageFetch({
  targets,
  fetchOne,
  signal,
}: BulkCoverImageRunOptions): Promise<BulkCoverImageResult> {
  let next = 0;
  let fetched = 0;

  const worker = async (): Promise<void> => {
    while (!signal.aborted) {
      const article = targets[next];
      if (!article) return;
      next += 1;
      try {
        if (await fetchOne(article)) fetched += 1;
      } catch (error) {
        console.error("Cover image fetch failed", error);
      }
    }
  };

  const workerCount = Math.min(BULK_COVER_IMAGE_CONCURRENCY, targets.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    attempted: next,
    fetched,
    notStarted: targets.length - next,
    cancelled: signal.aborted,
  };
}

function coverImages(count: number): string {
  return `${count} cover ${count === 1 ? "image" : "images"}`;
}

/** The one sentence that reports a finished or stopped run. */
export function describeBulkCoverImageResult(
  result: BulkCoverImageResult,
): string {
  const failed = result.attempted - result.fetched;
  const parts = [
    `${result.cancelled ? "Stopped. " : ""}Fetched ${result.fetched} of ${coverImages(result.attempted)}.`,
  ];
  if (failed > 0) {
    parts.push(`${failed} had no image or could not be fetched.`);
  }
  if (result.notStarted > 0) {
    parts.push(`${result.notStarted} not started.`);
  }
  return parts.join(" ");
}
