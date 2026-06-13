export interface ProxyPreset {
  label: string;
  url: string;
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
  },
  { label: "CodeTabs", url: "https://api.codetabs.com/v1/proxy/?quest=" },
  { label: "Isomorphic-Git", url: "https://cors.isomorphic-git.org/" },
  { label: "ThingProxy", url: "https://thingproxy.freeboard.io/fetch/" },
  {
    label: "RSS2JSON",
    url: "https://api.rss2json.com/v1/api.json?rss_url=",
  },
];
