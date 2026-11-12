/** Normalizes page values only for same-feed boilerplate comparison. */
export function normalizeRefreshEnrichmentValue(
  field: "description" | "image",
  value: string,
): string {
  if (field === "description")
    return value.toLowerCase().replace(/\s+/g, " ").trim();
  try {
    const url = new URL(value.trim());
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}
