import type { FeedItem, SavedTemplate } from "../types/types";

/** Id of the stand-in template that carries a one-save filename override; it is not a saved template. */
export const ONE_SAVE_OVERRIDE_TEMPLATE_ID = "reader-one-save-override";

export function resolveSavedTemplateForArticle(
  item: FeedItem,
  feeds: readonly { url: string; customTemplate?: string }[],
  savedTemplates: readonly SavedTemplate[],
  globalDefaultTemplateId?: string,
): SavedTemplate | undefined {
  const feedTemplateId = feeds.find(
    (feed) => feed.url === item.feedUrl,
  )?.customTemplate;
  if (feedTemplateId) {
    const feedTemplate = savedTemplates.find(
      (template) => template.id === feedTemplateId,
    );
    if (feedTemplate) return feedTemplate;
  }
  return savedTemplates.find(
    (template) => template.id === globalDefaultTemplateId,
  );
}
