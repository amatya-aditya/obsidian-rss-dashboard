/**
 * The article search's one matching rule. The dashboard's list hides rows with
 * it and the dashboard's select-first action picks the first visible article
 * with it, so a query means the same thing in both places (#1465).
 */
export function articleTitleMatchesSearch(
  title: string,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return (title ?? "").toLowerCase().includes(normalized);
}
