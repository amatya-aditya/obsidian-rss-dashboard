import { Notice, type ObsidianProtocolData } from "obsidian";
import { isValidUrl } from "../utils/validation";

const URI_ACTION_ADD_FEED = "add-feed";

export interface AddFeedUriRequest {
  /** Decoded and validated. */
  url: string;
  /** The host without a leading `www.`, else the URL. */
  title: string;
  /** `settings.media.defaultRssFolder`, else "RSS". */
  defaultFolder: string;
}

export interface UriActionHandlerOptions {
  /** `manifest.id`; never changes. */
  pluginId: string;
  /** Activates the dashboard view, then opens the Add feed modal prefilled. */
  openAddFeed: (request: AddFeedUriRequest) => Promise<void>;
  /** Read on every call, so a settings reload is seen. */
  getDefaultRssFolder: () => string | undefined;
}

export class UriActionHandler {
  constructor(private readonly options: UriActionHandlerOptions) {}

  async dispatch(params: ObsidianProtocolData): Promise<void> {
    const action = this.resolveRequestedUriAction(params);

    if (!action) {
      new Notice(
        "Missing URI action. Use action=add-feed with a URL parameter.",
      );
      return;
    }

    try {
      switch (action) {
        case URI_ACTION_ADD_FEED:
          await this.handleAddFeedUriAction(params);
          return;
        default:
          new Notice(`Unsupported RSS Dashboard URI action: ${action}`);
      }
    } catch (error) {
      console.error("[RSS Dashboard] URI action failed:", error);
      new Notice(
        `RSS Dashboard URI action failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  private resolveRequestedUriAction(params: ObsidianProtocolData): string {
    const routeAction = (params.action ?? "").trim().toLowerCase();
    const queryAction =
      typeof params.uriAction === "string"
        ? params.uriAction.trim().toLowerCase()
        : "";

    if (queryAction) {
      return queryAction;
    }

    // Obsidian protocol reserves `action` for the route itself.
    // For links like `obsidian://rss-dashboard?...`, infer add-feed when a URL
    // parameter is present so browser-triggered links work reliably.
    if (
      routeAction === this.options.pluginId.toLowerCase() &&
      typeof params.url === "string" &&
      params.url.trim().length > 0
    ) {
      return URI_ACTION_ADD_FEED;
    }

    if (routeAction === this.options.pluginId.toLowerCase()) {
      return "";
    }

    return routeAction;
  }

  private decodeUriFeedUrl(rawUrl: string): string {
    const candidate = rawUrl.trim();
    if (!candidate) {
      throw new Error("Missing required URL parameter for add-feed.");
    }

    if (!candidate.includes("%")) {
      return candidate;
    }

    try {
      return decodeURIComponent(candidate);
    } catch {
      throw new Error(
        "Feed URL is malformed. Ensure the url parameter is URL-encoded.",
      );
    }
  }

  private buildUriAddFeedTitle(feedUrl: string): string {
    try {
      const parsed = new URL(feedUrl);
      const hostname = parsed.hostname.replace(/^www\./i, "").trim();
      return hostname || feedUrl;
    } catch {
      return feedUrl;
    }
  }

  private async handleAddFeedUriAction(
    params: ObsidianProtocolData,
  ): Promise<void> {
    const rawUrl = typeof params.url === "string" ? params.url : "";
    if (!rawUrl.trim()) {
      new Notice("Missing required URL parameter for add-feed.");
      return;
    }

    const decodedUrl = this.decodeUriFeedUrl(rawUrl);
    const urlValidation = isValidUrl(decodedUrl);
    if (!urlValidation.valid) {
      new Notice(urlValidation.error ?? "Invalid feed URL.");
      return;
    }

    const defaultFolder = this.options.getDefaultRssFolder()?.trim() || "RSS";

    await this.options.openAddFeed({
      url: decodedUrl,
      title: this.buildUriAddFeedTitle(decodedUrl),
      defaultFolder,
    });
  }
}
