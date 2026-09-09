/**
 * A small, dependency-free parser for the OPML text FreshRSS's own
 * `cli/export-opml-for-user.php` produces (ticket 12's OPML round-trip
 * scenario). This is intentionally not a general XML/OPML parser -- it only
 * needs to understand the one shape FreshRSS actually emits, confirmed by
 * reading FreshRSS's own `app/views/helpers/export/opml.phtml` (via
 * `marienfressinaud/LibOpml`): every feed outline is nested exactly one
 * level inside a category outline, because FreshRSS always assigns every
 * feed to a category (including its own default/uncategorized one) -- there
 * is no FreshRSS-side notion of a top-level feed outline with no enclosing
 * category, unlike RSS Dashboard's own `generateFreshRssSubscriptionOpml`,
 * which emits uncategorized feeds at the top level. The comparison logic in
 * `run-contract.mjs` deliberately does not assume symmetry here -- see its
 * OPML scenario comments.
 */

const ENTITY_REPLACEMENTS = [
  [/&quot;/g, '"'],
  [/&apos;/g, "'"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&amp;/g, "&"],
];

function decodeXmlEntities(value) {
  let decoded = value;
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    decoded = decoded.replace(pattern, replacement);
  }
  return decoded;
}

/** Parses `name="value"` pairs out of one outline tag's attribute text. */
function parseOutlineAttributes(attrText) {
  /** @type {Record<string, string>} */
  const attrs = {};
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = attrRe.exec(attrText))) {
    attrs[match[1]] = decodeXmlEntities(match[2]);
  }
  return attrs;
}

/**
 * @typedef {{ url: string, title: string, category: string | null }} ParsedOpmlFeedEntry
 */

/**
 * Parses FreshRSS-exported OPML text into a flat list of feed entries, each
 * carrying the immediate enclosing category outline's text (or `null` for a
 * feed outline with no enclosing category -- not expected from FreshRSS's
 * own export per the module doc comment above, but handled rather than
 * assumed away).
 *
 * @param {string} xml
 * @returns {ParsedOpmlFeedEntry[]}
 */
export function parseFreshRssOpml(xml) {
  /** @type {ParsedOpmlFeedEntry[]} */
  const entries = [];
  /** @type {Array<string | null>} */
  const categoryStack = [];
  const tagRe = /<outline\b[^>]*>|<\/outline>/g;
  let match;

  while ((match = tagRe.exec(xml))) {
    const tag = match[0];
    if (tag === "</outline>") {
      categoryStack.pop();
      continue;
    }

    const selfClosing = /\/\s*>$/.test(tag);
    const attrsPart = tag.slice("<outline".length, tag.length - (selfClosing ? 2 : 1));
    const attrs = parseOutlineAttributes(attrsPart);
    const currentCategory = categoryStack.length > 0 ? categoryStack[categoryStack.length - 1] : null;

    if (typeof attrs.xmlUrl === "string" && attrs.xmlUrl !== "") {
      entries.push({
        url: attrs.xmlUrl,
        title: attrs.title ?? attrs.text ?? "",
        category: currentCategory,
      });
      if (!selfClosing) categoryStack.push(currentCategory);
    } else if (!selfClosing) {
      categoryStack.push(attrs.title ?? attrs.text ?? null);
    }
  }

  return entries;
}

/**
 * Finds every parsed entry whose `url` includes `urlFragment` (the same
 * "match by known fixture-server file name" convention `run-contract.mjs`
 * uses for FreshRSS's own opaque subscription IDs elsewhere in this
 * harness -- never an assumed exact string match against a URL FreshRSS may
 * have normalized).
 *
 * @param {ParsedOpmlFeedEntry[]} entries
 * @param {string} urlFragment
 */
export function findOpmlEntriesByUrlFragment(entries, urlFragment) {
  return entries.filter((entry) => entry.url.includes(urlFragment));
}
