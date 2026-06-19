import { ObsidianProtocolData } from "obsidian";

export class UriProtocolHandler {
  private static readonly URI_ACTION_ADD_FEED = "add-feed";

  constructor(private pluginId: string) {}

  public resolveRequestedUriAction(params: ObsidianProtocolData): string {
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
      routeAction === this.pluginId.toLowerCase() &&
      typeof params.url === "string" &&
      params.url.trim().length > 0
    ) {
      return UriProtocolHandler.URI_ACTION_ADD_FEED;
    }

    if (routeAction === this.pluginId.toLowerCase()) {
      return "";
    }

    return routeAction;
  }

}
