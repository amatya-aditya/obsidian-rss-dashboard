// Persisted article metadata (#247 slice 4, ADR 0007): copies the resolved
// page metadata onto flat FeedItem fields, once. First-write-wins: after
// `metadataFetchedAt` is set, a later fetch or refresh never overwrites them.
import type { FeedItem } from "../types/types";
import {
  resolveArticleMetadata,
  type RawArticleMetadata,
} from "./article-metadata";

export type ArticleMetadataUpdate = Pick<
  FeedItem,
  | "publisherDescription"
  | "language"
  | "languageSource"
  | "canonicalUrl"
  | "metadataFetchedAt"
>;

/**
 * The fields to write for a fetched article, or null when the item already
 * holds metadata. Fields that did not resolve are left out; the timestamp is
 * always set, since the fetch did happen.
 */
export function planMetadataWrite(
  item: FeedItem,
  pageMetadata: RawArticleMetadata,
  articleHtml: string,
  now: number = Date.now(),
): ArticleMetadataUpdate | null {
  if (item.metadataFetchedAt) return null;

  const resolved = resolveArticleMetadata(pageMetadata, {
    title: item.title,
    articleHtml,
    description: item.description,
  });

  const update: ArticleMetadataUpdate = { metadataFetchedAt: now };
  if (resolved.description) update.publisherDescription = resolved.description;
  if (resolved.language) {
    update.language = resolved.language;
    update.languageSource = resolved.languageSource;
  }
  if (resolved.canonicalUrl) update.canonicalUrl = resolved.canonicalUrl;
  return update;
}

/**
 * Plans the write and applies it to the in-memory item. Returns the update so
 * the caller can persist it, or null when nothing was written.
 */
export function applyArticleMetadata(
  item: FeedItem,
  pageMetadata: RawArticleMetadata | undefined,
  articleHtml: string,
  now?: number,
): ArticleMetadataUpdate | null {
  if (!pageMetadata) return null;
  const update = planMetadataWrite(item, pageMetadata, articleHtml, now);
  if (update) Object.assign(item, update);
  return update;
}
