import { Notice, requestUrl } from "obsidian";

/**
 * Resolves a YouTube channel page URL (`@handle`, `youtube.com/@handle`,
 * `youtube.com/channel/`, `youtube.com/user/`, `youtube.com/c/`), a bare
 * handle, or a bare `UC…` channel id into its RSS feed URL. Extracted verbatim
 * from `MediaService.getYouTubeRssFeed` (#1155); returns null when no channel
 * or username can be resolved.
 */
export async function getYouTubeRssFeed(input: string): Promise<string | null> {
  if (!input) {
    return null;
  }

  let channelId = "";
  let username = "";

  try {
    if (/^UC[\w-]{22}$/.test(input)) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${input}`;
    } else if (input.includes("youtube.com/channel/")) {
      const match = input.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
      if (match?.[1]) {
        channelId = match[1];
      }
    } else if (input.includes("@")) {
      channelId = await resolveHandleChannelId(input);
    } else if (input.includes("youtube.com/user/")) {
      const match = input.match(/youtube\.com\/user\/([^/?#]+)/);
      if (match?.[1]) {
        username = match[1];
      }
    } else if (input.includes("youtube.com/c/")) {
      channelId = await resolveCustomChannelId(input);
    } else if (!/\s/.test(input) && !input.includes("/")) {
      if (!/^UC[\w-]{22}$/.test(input)) {
        username = input;
      }
    }

    if (channelId) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    } else if (username) {
      return `https://www.youtube.com/feeds/videos.xml?user=${username}`;
    }
  } catch (error) {
    new Notice(
      `Error processing YouTube feed: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return null;
}

/**
 * The `@handle` branch of `getYouTubeRssFeed`: derives the handle from `input`,
 * fetches the channel page, and reads the channel id from its HTML. The
 * empty-text guard is duplicated in the original (the second check is
 * unreachable); it and the Notice are preserved verbatim and are not deduped.
 */
async function resolveHandleChannelId(input: string): Promise<string> {
  let handle = "";
  if (input.includes("youtube.com/@")) {
    handle = input.split("youtube.com/@")[1]?.split(/[?#/]/)[0] ?? "";
  } else if (input.startsWith("@")) {
    handle = input.substring(1);
  }

  if (handle) {
    try {
      const response = await requestUrl({
        url: `https://www.youtube.com/@${handle}`,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      if (!response.text) {
        throw new Error("Empty response from YouTube");
      }

      if (!response.text) {
        throw new Error("Empty response from YouTube");
      }

      const extractedId = extractChannelIdFromHtml(response.text);
      if (extractedId) {
        return extractedId;
      }
    } catch (error) {
      console.error(`[YouTube] Error fetching channel:`, error);
      new Notice(
        `Error fetching YouTube channel: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return "";
}

/**
 * The `youtube.com/c/` branch of `getYouTubeRssFeed`. Separate from
 * `resolveHandleChannelId` on purpose: the two branches are pinned behavior,
 * so they are not deduped. The empty-text guard is duplicated in the original
 * (the second check is unreachable); it and the Notice are preserved verbatim.
 */
async function resolveCustomChannelId(input: string): Promise<string> {
  const match = input.match(/youtube\.com\/c\/([^/?#]+)/);
  if (match?.[1]) {
    try {
      const response = await requestUrl({
        url: `https://www.youtube.com/c/${match[1]}`,
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });

      if (!response.text) {
        throw new Error("Empty response from YouTube");
      }

      if (!response.text) {
        throw new Error("Empty response from YouTube");
      }

      const extractedId = extractChannelIdFromHtml(response.text);
      if (extractedId) {
        return extractedId;
      }
    } catch (error) {
      console.error(`[YouTube] Error fetching channel:`, error);
      new Notice(
        `Error fetching YouTube channel: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  return "";
}

function extractChannelIdFromHtml(html: string): string | null {
  if (!html) return null;

  // 1. Try RSS feed link
  const rssMatch = html.match(
    /href="https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})"/,
  );
  if (rssMatch?.[1]) return rssMatch[1];

  // 2. Try canonical link
  const canonicalMatch = html.match(
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
  );
  if (canonicalMatch?.[1]) return canonicalMatch[1];

  // 3. Try meta itemprop
  const metaMatch = html.match(
    /<meta itemprop="channelId" content="(UC[\w-]{22})"/,
  );
  if (metaMatch?.[1]) return metaMatch[1];

  // 4. Try other common metadata
  const ogMatch = html.match(
    /<meta property="og:url" content="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/,
  );
  if (ogMatch?.[1]) return ogMatch[1];

  // 5. Fallback to existing broad patterns
  const patterns = [
    /channelId"?\s*:\s*"(UC[\w-]{22})"/,
    /"externalId"\s*:\s*"(UC[\w-]{22})"/,
    /"id"\s*:\s*"(UC[\w-]{22})"/,
    /data-channel-external-id="(UC[\w-]{22})"/,
    /"channelId"\s*:\s*"(UC[\w-]{22})"/,
    /channelId=(UC[\w-]{22})/,
    /"ucid"\s*:\s*"(UC[\w-]{22})"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}
