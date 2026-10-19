// A root element named `rss`, `feed` or `rdf`, optionally namespace-prefixed:
// a feed may bind the Atom, RSS 2.0 or RSS 1.0 namespace to any prefix, and
// `<ns6:feed>` is the same element as `<feed>` (#1338).
const FEED_ROOT_ELEMENT = /<(?:[a-z_][a-z0-9._-]*:)?(?:rss|feed|rdf)\b/;

export function isValidFeed(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 2048).toLowerCase();
  const isXmlFeed =
    FEED_ROOT_ELEMENT.test(sample) ||
    sample.includes('xmlns="http://purl.org/rss/1.0/"') ||
    sample.includes("xmlns:rdf=");
  if (isXmlFeed) return true;

  try {
    const parsed: unknown = JSON.parse(text);
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      "version" in parsed &&
      typeof parsed.version === "string" &&
      parsed.version.startsWith("https://jsonfeed.org/version/")
    );
  } catch {
    return false;
  }
}
