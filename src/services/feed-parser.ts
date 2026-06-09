// Backward-compatible re-export barrel
export {
  EMPTY_FEED_ERROR_MESSAGE,
  EmptyFeedError,
  isEmptyFeedError,
  getFeedErrorMessage,
  formatFeedParseNoticeMessage,
} from "./feed-parser/feed-errors.js";

export { isValidFeed } from "./feed-parser/feed-validation.js";

export {
  mergeFeedHistoryItems,
  applyFeedRetentionLimits,
} from "./feed-parser/feed-retention.js";

export type {
  ParsedFeed,
  ParsedItem,
  FeedPreviewData,
  FeedParseOptions,
} from "./feed-parser/types.js";

export { resolvePodcastPlatformUrl } from "./feed-parser/podcast-platform-resolver.js";

export {
  parseFeedPreviewFromXmlText,
  loadFeedForPreview,
} from "./feed-parser/feed-preview.js";

export { fetchFeedXml } from "./feed-parser/feed-fetch.js";

export { CustomXMLParser } from "./feed-parser/xml-parser/custom-xml-parser.js";

export { FeedParser } from "./feed-parser/feed-parser-class.js";

export { FeedParserService } from "./feed-parser/feed-parser-service.js";
