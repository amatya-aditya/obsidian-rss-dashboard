import { Notice } from "obsidian";
import type { FeedItem } from "../../../types/types";
import {
  describeBulkCoverImageResult,
  runBulkCoverImageFetch,
  type FetchAllCoversState,
} from "./cover-image-bulk";

/** What the controller needs from the list that owns the cards (#1702). */
export interface FetchAllCoversHost {
  /** The cards a run would fetch right now. */
  getTargets(): FeedItem[];
  /** Fetches one card's cover, resolving true when one was stored. */
  fetchOne(article: FeedItem): Promise<boolean>;
  /** Tells the header button which state to show. */
  onStateChange(state: FetchAllCoversState): void;
}

/**
 * The state of the header's fetch-all-covers run (#1702): one press starts it,
 * the next press while it runs cancels it, and it ends with one Notice that
 * sums up the run. It owns only the run; the list supplies the cards and the
 * fetch, so the two cannot drift from the per-card control.
 */
export class FetchAllCoversController {
  private abort: AbortController | null = null;

  constructor(private readonly host: FetchAllCoversHost) {}

  /** The state the button shows: running, ready, or unavailable. */
  public getState(): FetchAllCoversState {
    if (this.abort) return "running";
    return this.host.getTargets().length > 0 ? "idle" : "disabled";
  }

  /** Starts a run, or cancels the one in progress. */
  public toggle(): void {
    if (this.abort) {
      this.abort.abort();
      return;
    }
    void this.run();
  }

  /** Stops new fetches from starting, e.g. when the list is torn down. */
  public cancel(): void {
    this.abort?.abort();
  }

  private async run(): Promise<void> {
    const targets = this.host.getTargets();
    if (targets.length === 0) {
      new Notice("No cards on this page need a cover image.");
      return;
    }

    const controller = new AbortController();
    this.abort = controller;
    this.host.onStateChange("running");

    const result = await runBulkCoverImageFetch({
      targets,
      fetchOne: (article) => this.host.fetchOne(article),
      signal: controller.signal,
    });

    this.abort = null;
    this.host.onStateChange(this.getState());
    new Notice(describeBulkCoverImageResult(result));
  }
}
