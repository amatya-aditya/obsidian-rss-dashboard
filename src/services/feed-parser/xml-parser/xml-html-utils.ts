// Named entities the feed parser understands. Numeric references are decoded
// generically; the one numeric reference that maps to something other than its
// own code point is listed here by its literal spelling.
const KNOWN_ENTITIES = new Map<string, string>([
  ["nbsp", " "],
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["lsquo", "\u2018"],
  ["rsquo", "\u2019"],
  ["ldquo", "\u201C"],
  ["rdquo", "\u201D"],
  ["ndash", "\u2013"],
  ["mdash", "\u2014"],
  ["hellip", "..."],
  ["copy", "\u00A9"],
  ["reg", "\u00AE"],
  ["trade", "\u2122"],
  ["deg", "\u00B0"],
  ["plusmn", "\u00B1"],
  ["times", "\u00D7"],
  ["divide", "\u00F7"],
  ["frac12", "\u00BD"],
  ["frac14", "\u00BC"],
  ["frac34", "\u00BE"],
  ["sup1", "\u00B9"],
  ["sup2", "\u00B2"],
  ["sup3", "\u00B3"],
  ["micro", "\u00B5"],
  ["para", "\u00B6"],
  ["middot", "\u00B7"],
  ["bull", "\u2022"],
  ["dagger", "\u2020"],
  ["Dagger", "\u2021"],
  ["permil", "\u2030"],
  ["lsaquo", "\u2039"],
  ["rsaquo", "\u203A"],
  ["euro", "\u20AC"],
  ["pound", "\u00A3"],
  ["cent", "\u00A2"],
  ["curren", "\u00A4"],
  ["yen", "\u00A5"],
  ["brvbar", "\u00A6"],
  ["sect", "\u00A7"],
  ["uml", "\u00A8"],
  ["ordf", "\u00AA"],
  ["laquo", "\u00AB"],
  ["not", "\u00AC"],
  ["shy", "\u00AD"],
  ["macr", "\u00AF"],
  ["ordm", "\u00BA"],
  ["raquo", "\u00BB"],
  ["iquest", "\u00BF"],
  ["Agrave", "\u00C0"],
  ["Aacute", "\u00C1"],
  ["Acirc", "\u00C2"],
  ["Atilde", "\u00C3"],
  ["Auml", "\u00C4"],
  ["Aring", "\u00C5"],
  ["AElig", "\u00C6"],
  ["Ccedil", "\u00C7"],
  ["Egrave", "\u00C8"],
  ["Eacute", "\u00C9"],
  ["Ecirc", "\u00CA"],
  ["Euml", "\u00CB"],
  ["Igrave", "\u00CC"],
  ["Iacute", "\u00CD"],
  ["Icirc", "\u00CE"],
  ["Iuml", "\u00CF"],
  ["ETH", "\u00D0"],
  ["Ntilde", "\u00D1"],
  ["Ograve", "\u00D2"],
  ["Oacute", "\u00D3"],
  ["Ocirc", "\u00D4"],
  ["Otilde", "\u00D5"],
  ["Ouml", "\u00D6"],
  ["Oslash", "\u00D8"],
  ["Ugrave", "\u00D9"],
  ["Uacute", "\u00DA"],
  ["Ucirc", "\u00DB"],
  ["Uuml", "\u00DC"],
  ["Yacute", "\u00DD"],
  ["THORN", "\u00DE"],
  ["szlig", "\u00DF"],
  ["agrave", "\u00E0"],
  ["aacute", "\u00E1"],
  ["acirc", "\u00E2"],
  ["atilde", "\u00E3"],
  ["auml", "\u00E4"],
  ["aring", "\u00E5"],
  ["aelig", "\u00E6"],
  ["ccedil", "\u00E7"],
  ["egrave", "\u00E8"],
  ["eacute", "\u00E9"],
  ["ecirc", "\u00EA"],
  ["euml", "\u00EB"],
  ["igrave", "\u00EC"],
  ["iacute", "\u00ED"],
  ["icirc", "\u00EE"],
  ["iuml", "\u00EF"],
  ["eth", "\u00F0"],
  ["ntilde", "\u00F1"],
  ["ograve", "\u00F2"],
  ["oacute", "\u00F3"],
  ["ocirc", "\u00F4"],
  ["otilde", "\u00F5"],
  ["ouml", "\u00F6"],
  ["oslash", "\u00F8"],
  ["ugrave", "\u00F9"],
  ["uacute", "\u00FA"],
  ["ucirc", "\u00FB"],
  ["uuml", "\u00FC"],
  ["yacute", "\u00FD"],
  ["thorn", "\u00FE"],
  ["yuml", "\u00FF"],
  ["#8230", "..."],
]);

function decodeEntity(match: string, body: string): string {
  const known = KNOWN_ENTITIES.get(body);
  if (known !== undefined) return known;
  if (!body.startsWith("#")) return match;

  const isHex = body[1] === "x" || body[1] === "X";
  const num = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
  return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
}

/** Decodes each entity once; decoded text is never scanned again. */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";

  return text.replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g,
    decodeEntity,
  );
}

export function decodeSubstackImageFetchUrl(url: string | null): string | null {
  if (!url || !/^https:\/\/substackcdn\.com\/image\/fetch\//i.test(url)) {
    return null;
  }

  const lastSlashIndex = url.lastIndexOf("/");
  if (lastSlashIndex === -1 || lastSlashIndex === url.length - 1) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(url.slice(lastSlashIndex + 1));
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function rewriteSubstackImageFetchSources(html: string): string {
  if (!html.includes("substackcdn.com/image/fetch/")) {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  let didRewrite = false;

  for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
    const src = img.getAttribute("src");
    const rewrittenSrc = decodeSubstackImageFetchUrl(src);

    if (rewrittenSrc && rewrittenSrc !== src) {
      img.setAttribute("src", rewrittenSrc);
      didRewrite = true;
    }
  }

  return didRewrite ? doc.body.innerHTML : html;
}

export function sanitizeCDATA(text: string, isHtml: boolean = false): string {
  if (!text) return "";

  let cleaned = text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .trim();

  if (isHtml) {
    cleaned = rewriteSubstackImageFetchSources(cleaned);
  } else {
    cleaned = decodeHtmlEntities(cleaned);
    cleaned = cleaned.replace(/\s+/g, " ").trim();
  }

  return cleaned;
}
