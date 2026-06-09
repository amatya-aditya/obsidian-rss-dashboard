export function isValidFeed(text: string): boolean {
  if (!text) return false;
  const sample = text.slice(0, 2048).toLowerCase();
  return (
    sample.includes("<rss") ||
    sample.includes("<feed") ||
    sample.includes("<rdf:rdf") ||
    sample.includes("<rdf") ||
    sample.includes('xmlns="http://purl.org/rss/1.0/"') ||
    sample.includes("xmlns:rdf=")
  );
}
