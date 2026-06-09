export function decodeHtmlEntities(text: string): string {
  if (!text) return "";

  const decoded = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#8230;/g, "...")
    .replace(/&#8217;/g, "\u2019")
    .replace(/&#8216;/g, "\u2018")
    .replace(/&#8220;/g, "\u201C")
    .replace(/&#8221;/g, "\u201D")
    .replace(/&#8211;/g, "\u2013")
    .replace(/&#8212;/g, "\u2014")
    .replace(/&#038;/g, "&")
    .replace(/&#x26;/g, "&")
    .replace(/&#x3c;/g, "<")
    .replace(/&#x3e;/g, ">")
    .replace(/&#x22;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2f;/g, "/")
    .replace(/&apos;/g, "'")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ndash;/g, "\u2013")
    .replace(/&mdash;/g, "\u2014")
    .replace(/&hellip;/g, "...")
    .replace(/&copy;/g, "\u00A9")
    .replace(/&reg;/g, "\u00AE")
    .replace(/&trade;/g, "\u2122")
    .replace(/&deg;/g, "\u00B0")
    .replace(/&plusmn;/g, "\u00B1")
    .replace(/&times;/g, "\u00D7")
    .replace(/&divide;/g, "\u00F7")
    .replace(/&frac12;/g, "\u00BD")
    .replace(/&frac14;/g, "\u00BC")
    .replace(/&frac34;/g, "\u00BE")
    .replace(/&sup1;/g, "\u00B9")
    .replace(/&sup2;/g, "\u00B2")
    .replace(/&sup3;/g, "\u00B3")
    .replace(/&micro;/g, "\u00B5")
    .replace(/&para;/g, "\u00B6")
    .replace(/&middot;/g, "\u00B7")
    .replace(/&bull;/g, "\u2022")
    .replace(/&dagger;/g, "\u2020")
    .replace(/&Dagger;/g, "\u2021")
    .replace(/&permil;/g, "\u2030")
    .replace(/&lsaquo;/g, "\u2039")
    .replace(/&rsaquo;/g, "\u203A")
    .replace(/&euro;/g, "\u20AC")
    .replace(/&pound;/g, "\u00A3")
    .replace(/&cent;/g, "\u00A2")
    .replace(/&curren;/g, "\u00A4")
    .replace(/&yen;/g, "\u00A5")
    .replace(/&brvbar;/g, "\u00A6")
    .replace(/&sect;/g, "\u00A7")
    .replace(/&uml;/g, "\u00A8")
    .replace(/&ordf;/g, "\u00AA")
    .replace(/&laquo;/g, "\u00AB")
    .replace(/&not;/g, "\u00AC")
    .replace(/&shy;/g, "\u00AD")
    .replace(/&macr;/g, "\u00AF")
    .replace(/&ordm;/g, "\u00BA")
    .replace(/&raquo;/g, "\u00BB")
    .replace(/&frac14;/g, "\u00BC")
    .replace(/&frac12;/g, "\u00BD")
    .replace(/&frac34;/g, "\u00BE")
    .replace(/&iquest;/g, "\u00BF")
    .replace(/&Agrave;/g, "\u00C0")
    .replace(/&Aacute;/g, "\u00C1")
    .replace(/&Acirc;/g, "\u00C2")
    .replace(/&Atilde;/g, "\u00C3")
    .replace(/&Auml;/g, "\u00C4")
    .replace(/&Aring;/g, "\u00C5")
    .replace(/&AElig;/g, "\u00C6")
    .replace(/&Ccedil;/g, "\u00C7")
    .replace(/&Egrave;/g, "\u00C8")
    .replace(/&Eacute;/g, "\u00C9")
    .replace(/&Ecirc;/g, "\u00CA")
    .replace(/&Euml;/g, "\u00CB")
    .replace(/&Igrave;/g, "\u00CC")
    .replace(/&Iacute;/g, "\u00CD")
    .replace(/&Icirc;/g, "\u00CE")
    .replace(/&Iuml;/g, "\u00CF")
    .replace(/&ETH;/g, "\u00D0")
    .replace(/&Ntilde;/g, "\u00D1")
    .replace(/&Ograve;/g, "\u00D2")
    .replace(/&Oacute;/g, "\u00D3")
    .replace(/&Ocirc;/g, "\u00D4")
    .replace(/&Otilde;/g, "\u00D5")
    .replace(/&Ouml;/g, "\u00D6")
    .replace(/&times;/g, "\u00D7")
    .replace(/&Oslash;/g, "\u00D8")
    .replace(/&Ugrave;/g, "\u00D9")
    .replace(/&Uacute;/g, "\u00DA")
    .replace(/&Ucirc;/g, "\u00DB")
    .replace(/&Uuml;/g, "\u00DC")
    .replace(/&Yacute;/g, "\u00DD")
    .replace(/&THORN;/g, "\u00DE")
    .replace(/&szlig;/g, "\u00DF")
    .replace(/&agrave;/g, "\u00E0")
    .replace(/&aacute;/g, "\u00E1")
    .replace(/&acirc;/g, "\u00E2")
    .replace(/&atilde;/g, "\u00E3")
    .replace(/&auml;/g, "\u00E4")
    .replace(/&aring;/g, "\u00E5")
    .replace(/&aelig;/g, "\u00E6")
    .replace(/&ccedil;/g, "\u00E7")
    .replace(/&egrave;/g, "\u00E8")
    .replace(/&eacute;/g, "\u00E9")
    .replace(/&ecirc;/g, "\u00EA")
    .replace(/&euml;/g, "\u00EB")
    .replace(/&igrave;/g, "\u00EC")
    .replace(/&iacute;/g, "\u00ED")
    .replace(/&icirc;/g, "\u00EE")
    .replace(/&iuml;/g, "\u00EF")
    .replace(/&eth;/g, "\u00F0")
    .replace(/&ntilde;/g, "\u00F1")
    .replace(/&ograve;/g, "\u00F2")
    .replace(/&oacute;/g, "\u00F3")
    .replace(/&ocirc;/g, "\u00F4")
    .replace(/&otilde;/g, "\u00F5")
    .replace(/&ouml;/g, "\u00F6")
    .replace(/&divide;/g, "\u00F7")
    .replace(/&oslash;/g, "\u00F8")
    .replace(/&ugrave;/g, "\u00F9")
    .replace(/&uacute;/g, "\u00FA")
    .replace(/&ucirc;/g, "\u00FB")
    .replace(/&uuml;/g, "\u00FC")
    .replace(/&yacute;/g, "\u00FD")
    .replace(/&thorn;/g, "\u00FE")
    .replace(/&yuml;/g, "\u00FF")
    .replace(/&#(\d+);/g, (match: string, dec: string) => {
      const num = parseInt(dec, 10);
      return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (match: string, hex: string) => {
      const num = parseInt(hex, 16);
      return num >= 0 && num <= 0x10ffff ? String.fromCodePoint(num) : match;
    });

  return decoded;
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
