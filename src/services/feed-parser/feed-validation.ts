export function isValidFeed(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 2048).toLowerCase();
  const isXmlFeed =
    sample.includes("<rss") ||
    sample.includes("<feed") ||
    sample.includes("<rdf:rdf") ||
    sample.includes("<rdf") ||
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
