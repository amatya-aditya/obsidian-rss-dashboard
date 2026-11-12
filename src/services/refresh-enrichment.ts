import type { Feed, FeedItem } from "../types/types";
import { resolveArticleMetadata } from "../utils/article-metadata";
import {
  getArticlePreviewSummaryText,
  resolveArticlePreviewImage,
} from "../utils/article-preview-utils";
import type { FullArticleFetchResult } from "../utils/fetch-helpers";
import { isNonPageUrl } from "../utils/fetch-target-guard";
import { isHttpUrl } from "../utils/http-url";
import {
  firstNonFormulaImageUrl,
  isAvatarImageUrl,
} from "../utils/image-url-utils";
import { isFeedIconUrl } from "../utils/reader-article-render";
import { suppressRefreshBoilerplate } from "../utils/refresh-enrichment-suppression";
import type { EnrichmentMutation } from "./settings-store";

interface RetryState {
  at: number;
  attempts: number;
}
interface Job {
  feedUrl: string;
  feedId?: string;
  guid: string;
  url: string;
  key: string;
  generation: number;
}
interface Dependencies {
  getFeeds(): Feed[];
  showCovers(): boolean;
  fetch(url: string): Promise<FullArticleFetchResult>;
  persist(): Promise<void>;
  commit?(apply: () => EnrichmentMutation | null): Promise<boolean>;
  waitUntilReady?(): Promise<void>;
  redraw(items: FeedItem[]): void;
  loadRetries(): unknown;
  saveRetries(value: Record<string, RetryState>): void;
  now(): number;
}

/** A plugin-lifetime queue shared by all ordinary feed refreshes. */
export class RefreshEnrichment {
  private readonly queue: Job[] = [];
  private readonly reserved = new Set<string>();
  private readonly pendingResults = new Map<
    string,
    { job: Job; result: FullArticleFetchResult }
  >();
  private readonly generations = new Map<string, number>();
  private readonly retries: Record<string, RetryState>;
  private active = 0;
  private disposed = false;
  private idle: (() => void)[] = [];
  private commitTail: Promise<void> = Promise.resolve();

  constructor(private readonly deps: Dependencies) {
    const stored = deps.loadRetries();
    this.retries = {};
    if (stored && typeof stored === "object" && !Array.isArray(stored)) {
      for (const [key, value] of Object.entries(
        stored as Record<string, unknown>,
      )) {
        if (
          value &&
          typeof value === "object" &&
          "at" in value &&
          "attempts" in value &&
          typeof value.at === "number" &&
          typeof value.attempts === "number"
        )
          this.retries[key] = { at: value.at, attempts: value.attempts };
      }
    }
  }

  enqueue(feeds: Feed[]): void {
    if (this.disposed) return;
    this.retryPending(feeds);
    const liveFeeds = this.deps.getFeeds();
    const candidates = feeds.map((feed) =>
      this.candidates(
        liveFeeds.find((f) =>
          feed.feedId ? f.feedId === feed.feedId : f.url === feed.url,
        ) ?? feed,
      ),
    );
    let count = 0;
    for (let round = 0; round < 3 && count < 12; round++) {
      const turn = candidates
        .map((entries) => entries[round])
        .filter((job): job is Job => !!job);
      turn.sort(
        (a, b) =>
          Number(Boolean(this.retries[a.key])) -
          Number(Boolean(this.retries[b.key])),
      );
      for (const job of turn) {
        if (count >= 12 || this.reserved.has(job.key)) continue;
        this.reserved.add(job.key);
        this.queue.push(job);
        count++;
      }
    }
    this.pump();
  }

  whenIdle(): Promise<void> {
    if (!this.active && !this.queue.length) return Promise.resolve();
    return new Promise((resolve) => this.idle.push(resolve));
  }

  cancelFeed(feed: Feed): void {
    const id = feed.feedId ?? feed.url;
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
    for (const [key, pending] of this.pendingResults) {
      if ((pending.job.feedId ?? pending.job.feedUrl) === id)
        this.pendingResults.delete(key);
    }
  }

  /** Retry safe persistence of previously fetched outcomes without another request. */
  retryPending(feeds: readonly Feed[] = this.deps.getFeeds()): void {
    if (this.disposed) return;
    for (const [key, pending] of this.pendingResults) {
      const current = this.current(pending.job);
      if (!current || current.item.refreshEnrichment?.url === pending.job.url) {
        this.pendingResults.delete(key);
        continue;
      }
      if (
        !feeds.some(
          (feed) =>
            feed.url === current.feed.url &&
            (!feed.feedId || feed.feedId === current.feed.feedId),
        ) ||
        this.reserved.has(key)
      )
        continue;
      this.reserved.add(key);
      this.queue.push(pending.job);
    }
    this.pump();
  }

  /** Invalidate work whose feed was disabled, removed, or changed by a reload. */
  reconcileFeeds(previous: readonly Feed[], next: readonly Feed[]): void {
    for (const feed of previous) {
      if (!feed.refreshEnrichment) continue;
      const current = next.find((entry) =>
        feed.feedId ? entry.feedId === feed.feedId : entry.url === feed.url,
      );
      if (!current?.refreshEnrichment || current.url !== feed.url)
        this.cancelFeed(feed);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.pendingResults.clear();
    this.finishIdle();
  }

  private candidates(feed: Feed): Job[] {
    if (!feed.refreshEnrichment) return [];
    // Retention has already sorted the feed using the user's date setting.
    const items = feed.items.slice(0, 20);
    const seenUrls = new Set<string>();
    const completedUrls = new Set(
      feed.items
        .filter((item) => item.refreshEnrichment?.url === item.link)
        .map((item) => item.link),
    );
    const jobs = items.flatMap((item) => {
      const key = JSON.stringify([feed.feedId ?? feed.url, item.link]);
      const retry = this.retries[key];
      if (
        !isHttpUrl(item.link) ||
        isNonPageUrl(item.link) ||
        completedUrls.has(item.link) ||
        seenUrls.has(item.link) ||
        this.reserved.has(key)
      )
        return [];
      if (
        getArticlePreviewSummaryText(item) &&
        (!this.deps.showCovers() ||
          resolveArticlePreviewImage(item, ["coverImage", "image"]))
      )
        return [];
      if (
        retry &&
        (retry.attempts >= 2 || this.deps.now() - retry.at < 86400000)
      )
        return [];
      seenUrls.add(item.link);
      return [
        {
          feedUrl: feed.url,
          feedId: feed.feedId,
          guid: item.guid,
          url: item.link,
          key,
          generation: this.generations.get(feed.feedId ?? feed.url) ?? 0,
        },
      ];
    });
    return jobs
      .sort(
        (a, b) =>
          Number(Boolean(this.retries[a.key])) -
          Number(Boolean(this.retries[b.key])),
      )
      .slice(0, 3);
  }

  private current(job: Job): { feed: Feed; item: FeedItem } | undefined {
    if (
      (this.generations.get(job.feedId ?? job.feedUrl) ?? 0) !== job.generation
    )
      return undefined;
    const feed = this.deps
      .getFeeds()
      .find((f) =>
        job.feedId ? f.feedId === job.feedId : f.url === job.feedUrl,
      );
    if (!feed?.refreshEnrichment || feed.url !== job.feedUrl) return undefined;
    const item = feed.items.find(
      (i) => i.guid === job.guid && i.link === job.url,
    );
    return item ? { feed, item } : undefined;
  }

  private pump(): void {
    while (!this.disposed && this.active < 2 && this.queue.length) {
      const job = this.queue.shift();
      if (!job) break;
      const current = this.current(job);
      const pending = this.pendingResults.has(job.key);
      if (
        !current ||
        current.item.refreshEnrichment?.url === job.url ||
        (!pending &&
          getArticlePreviewSummaryText(current.item) &&
          (!this.deps.showCovers() ||
            resolveArticlePreviewImage(current.item, ["coverImage", "image"])))
      ) {
        this.pendingResults.delete(job.key);
        this.reserved.delete(job.key);
        continue;
      }
      this.active++;
      void this.run(job)
        .catch((error: unknown) => {
          console.error("[RSS dashboard] Could not save page preview:", error);
        })
        .finally(() => {
          this.active--;
          this.reserved.delete(job.key);
          this.pump();
          this.finishIdle();
        });
    }
    this.finishIdle();
  }

  private async run(job: Job): Promise<void> {
    let result = this.pendingResults.get(job.key)?.result;
    if (!result) {
      try {
        result = await this.deps.fetch(job.url);
      } catch {
        result = { content: "", failureType: "network" };
      }
    }
    const commit = this.commitTail.then(() => this.applyResult(job, result));
    this.commitTail = commit.catch(() => {});
    await commit;
  }

  private async applyResult(
    job: Job,
    result: FullArticleFetchResult,
  ): Promise<void> {
    await this.deps.waitUntilReady?.();
    if (this.disposed) return;
    const current = this.current(job);
    if (!current) return;
    if (
      result.failureReason === "timeout" ||
      (result.failureType === "network" &&
        result.failureReason !== "unsupported")
    ) {
      const prior = this.retries[job.key];
      this.retries[job.key] = {
        at: this.deps.now(),
        attempts: (prior?.attempts ?? 0) + 1,
      };
      this.deps.saveRetries(this.retries);
      return;
    }
    try {
      const written = await this.persistResult(job, result);
      if (written || this.disposed || !this.current(job))
        this.pendingResults.delete(job.key);
      else if (this.current(job)?.item.refreshEnrichment?.url !== job.url)
        this.pendingResults.set(job.key, { job, result });
    } catch (error) {
      if (!this.disposed && this.current(job))
        this.pendingResults.set(job.key, { job, result });
      throw error;
    }
  }

  private async persistResult(
    job: Job,
    result: FullArticleFetchResult,
  ): Promise<boolean> {
    let changed: FeedItem[] = [];
    const apply = (): EnrichmentMutation | null => {
      const current = this.current(job);
      if (
        !current ||
        this.disposed ||
        current.item.refreshEnrichment?.url === job.url
      )
        return null;
      const mutation = this.applyCompletedResult(job, result, current);
      changed = mutation.changed;
      return mutation;
    };
    const written = this.deps.commit
      ? await this.deps.commit(apply)
      : await this.persistWithoutCoordinator(apply);
    if (written && !this.disposed && this.current(job))
      this.deps.redraw(changed);
    return written;
  }

  private async persistWithoutCoordinator(
    apply: () => EnrichmentMutation | null,
  ): Promise<boolean> {
    const mutation = apply();
    if (!mutation) return false;
    try {
      await this.deps.persist();
      return true;
    } catch (error) {
      mutation.rollback();
      throw error;
    }
  }

  private applyCompletedResult(
    job: Job,
    result: FullArticleFetchResult,
    current: { feed: Feed; item: FeedItem },
  ): EnrichmentMutation & { changed: FeedItem[] } {
    const description = result.pageMetadata
      ? resolveArticleMetadata(result.pageMetadata, {
          title: current.item.title,
        }).description
      : "";
    const imageCandidates = result.pageImageCandidates?.length
      ? result.pageImageCandidates
      : [result.pageImage];
    const image = imageCandidates
      .map((candidate) => firstNonFormulaImageUrl([candidate]))
      .filter(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.length > 0,
      )
      .find(
        (candidate) =>
          !isAvatarImageUrl(candidate) &&
          !isFeedIconUrl(candidate, current.item, [current.feed]),
      );
    const previous = new Map<FeedItem, FeedItem["refreshEnrichment"]>();
    for (const item of current.feed.items) {
      previous.set(item, item.refreshEnrichment);
      if (item.refreshEnrichment)
        item.refreshEnrichment = { ...item.refreshEnrichment };
    }
    const existing = current.feed.items.find(
      (item) =>
        item.link === job.url && item.refreshEnrichment?.url === job.url,
    )?.refreshEnrichment;
    const enrichment = existing ?? {
      url: job.url,
      description: description || undefined,
      image,
    };
    const changed = new Set<FeedItem>();
    for (const item of current.feed.items) {
      if (item.link === job.url && item.refreshEnrichment?.url !== job.url) {
        item.refreshEnrichment = { ...enrichment };
        changed.add(item);
      }
    }
    for (const item of suppressRefreshBoilerplate(current.feed))
      changed.add(item);
    const applied = new Map(
      current.feed.items.map((item) => [item, item.refreshEnrichment]),
    );
    const rollback = () => {
      for (const [item, value] of previous) {
        if (item.refreshEnrichment === applied.get(item))
          item.refreshEnrichment = value;
      }
    };
    return {
      feed: current.feed,
      changed: [...changed],
      rollback,
      isCurrent: () => this.current(job)?.item === current.item,
    };
  }

  private finishIdle(): void {
    if (this.active || this.queue.length) return;
    for (const resolve of this.idle.splice(0)) resolve();
  }
}
