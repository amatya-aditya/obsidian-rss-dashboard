export interface ProxyPreset {
  label: string;
  url: string;
  /**
   * False when the proxy wraps the page in JSON instead of relaying the body,
   * so it cannot serve an article page as HTML. Absent means it relays raw.
   */
  relaysRawBody?: boolean;
}

/**
 * List of predefined CORS proxies used for fallback when direct feed fetching fails.
 * RSS2JSON must be the last item as it's used as a final fallback for non-XML endpoints.
 */
export const PREDEFINED_PROXIES: ProxyPreset[] = [
  {
    label: "AllOrigins (Raw)",
    url: "https://api.allorigins.win/raw?url=",
  },
  {
    label: "AllOrigins (Get)",
    url: "https://api.allorigins.win/get?url=",
    relaysRawBody: false,
  },
  { label: "CodeTabs", url: "https://api.codetabs.com/v1/proxy/?quest=" },
  { label: "Isomorphic-Git", url: "https://cors.isomorphic-git.org/" },
  { label: "ThingProxy", url: "https://thingproxy.freeboard.io/fetch/" },
  {
    label: "RSS2JSON",
    url: "https://api.rss2json.com/v1/api.json?rss_url=",
    relaysRawBody: false,
  },
];

/** The setting value that selects the built-in proxy list. */
export const AUTO_PROXY_URL = "auto";

/**
 * Resolves the **CORS proxy URL** setting to the proxy prefixes to try, in
 * order. `"auto"` expands to the built-in list; any other value is used as
 * given. With `rawBodyOnly`, proxies that wrap the page in JSON are left out
 * of an `"auto"` expansion, for callers that need the page HTML itself.
 */
export function resolveProxyPrefixes(
  proxyUrl: string,
  options: { rawBodyOnly?: boolean } = {},
): string[] {
  if (proxyUrl.trim() !== AUTO_PROXY_URL) {
    return [proxyUrl];
  }
  return PREDEFINED_PROXIES.filter(
    (proxy) => !options.rawBodyOnly || proxy.relaysRawBody !== false,
  ).map((proxy) => proxy.url);
}
