/**
 * Returns whether `url` points at `domain` or one of its subdomains.
 *
 * Only the parsed host is compared, so the domain appearing in the path, the
 * query, the fragment, or the user info does not count. The comparison ignores
 * case and one trailing dot on the host. An input that does not parse as an
 * absolute URL returns false.
 */
export function hostMatches(url: string, domain: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);
  const target = domain.toLowerCase();
  return hostname === target || hostname.endsWith(`.${target}`);
}

/**
 * Returns whether `url` points at `domain` (or a subdomain) and its path
 * starts with `pathPrefix`. The host is compared as in `hostMatches`; the path
 * comparison is case-sensitive. An input that does not parse as an absolute URL
 * returns false.
 */
export function hostPathMatches(
  url: string,
  domain: string,
  pathPrefix: string,
): boolean {
  if (!hostMatches(url, domain)) return false;
  try {
    return new URL(url).pathname.startsWith(pathPrefix);
  } catch {
    return false;
  }
}
