import { describe, it, expect } from "vitest";
import {
  extractHighestResolutionFromSrcset,
  findFirstNonFormulaImage,
  firstNonFormulaImageUrl,
  hasLatexPhpQuery,
  isAvatarImageUrl,
  isLatexFormulaImage,
  isTrackingPixel,
  isTrackingPixelElement,
  isTrackingPixelTag,
  optimizeImageUrl,
  promoteLazyImageSources,
  promotePictureImageSources,
} from "../../../src/utils/image-url-utils.js";

const COUNTER = "https://counter.example.com/content/123456/count.gif";

describe("isLatexFormulaImage", () => {
  it("recognizes WordPress LaTeX images by class", () => {
    expect(
      isLatexFormulaImage(
        "https://example.com/rendered-formula.png",
        "alignnone latex size-full",
      ),
    ).toBe(true);
  });

  it("recognizes persisted WordPress LaTeX image URLs without a class", () => {
    expect(
      isLatexFormulaImage(
        "https://s0.wp.com/latex.php?latex=%7Bx%7D&bg=ffffff&fg=000000",
      ),
    ).toBe(true);
  });

  it("does not classify ordinary WordPress images as formulas", () => {
    expect(
      isLatexFormulaImage(
        "https://i0.wp.com/example.com/wp-content/uploads/photo.jpg?w=600",
        "wp-post-image",
      ),
    ).toBe(false);
  });
});

describe("isTrackingPixel", () => {
  it.each([
    ["tracking/", "https://img.example.com/tracking/a.png"],
    ["pixel.gif", "https://img.example.com/pixel.gif"],
    ["beacon.", "https://beacon.example.com/a.png"],
    ["1x1", "https://img.example.com/1x1.png"],
    ["/track/", "https://img.example.com/track/a.png"],
    ["rss-pixel", "https://img.example.com/rss-pixel.png"],
  ])("recognizes the url pattern %s anywhere in the url", (_pattern, url) => {
    expect(isTrackingPixel(url)).toBe(true);
  });

  it("does not treat a near miss as a tracking pixel", () => {
    expect(isTrackingPixel("https://t.example.com/pixel.png")).toBe(false);
  });

  it.each([
    ["a 1 by 1 counter", "1", "1"],
    ["a declared zero width", "0", "640"],
    ["a declared zero height", "640", "0"],
    ["a fractional size", "1.5", "1.5"],
  ])("rejects %s whatever its url", (_label, width, height) => {
    expect(isTrackingPixel(COUNTER, width, height)).toBe(true);
  });

  it("rejects a declared size written with a unit", () => {
    expect(isTrackingPixel(COUNTER, "1px", "1px")).toBe(true);
  });

  it.each(["2", "640"])("accepts a declared size of %s", (size) => {
    expect(isTrackingPixel(COUNTER, size, size)).toBe(false);
  });

  it("accepts an undeclared or unparseable size", () => {
    expect(isTrackingPixel(COUNTER)).toBe(false);
    expect(isTrackingPixel(COUNTER, null, null)).toBe(false);
    expect(isTrackingPixel(COUNTER, "100%", "auto")).toBe(false);
    expect(isTrackingPixel(COUNTER, "", "  ")).toBe(false);
  });
});

describe("isTrackingPixelElement", () => {
  function parseImage(html: string): HTMLImageElement {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.querySelector("img") as HTMLImageElement;
  }

  it("reads the declared size from the element", () => {
    expect(
      isTrackingPixelElement(
        parseImage(`<img src="${COUNTER}" width="1" height="1">`),
      ),
    ).toBe(true);
  });

  it("accepts an element with a usable declared size or none at all", () => {
    expect(
      isTrackingPixelElement(
        parseImage('<img src="https://img.example.com/photo.jpg" width="640">'),
      ),
    ).toBe(false);
    expect(
      isTrackingPixelElement(
        parseImage('<img src="https://img.example.com/photo.jpg">'),
      ),
    ).toBe(false);
  });
});

describe("isTrackingPixelTag", () => {
  it("reads a quoted declared size from the tag text", () => {
    expect(
      isTrackingPixelTag(`<img src="${COUNTER}" width="1" height="1">`),
    ).toBe(true);
  });

  it("reads a bare declared size from the tag text", () => {
    expect(
      isTrackingPixelTag(`<img src="${COUNTER}" width=0 height=640>`),
    ).toBe(true);
  });

  it("rejects a tracking url even when the tag declares no size", () => {
    expect(
      isTrackingPixelTag(
        '<img src="https://img.example.com/tracking/a.png" alt="">',
      ),
    ).toBe(true);
  });

  it("does not read a data attribute as the declared size", () => {
    expect(
      isTrackingPixelTag(
        `<img data-width="1" data-height="1" src="${COUNTER}">`,
      ),
    ).toBe(false);
  });

  it("does not read a size mentioned inside another attribute value", () => {
    expect(
      isTrackingPixelTag(
        '<img src="https://img.example.com/photo.jpg" alt="shown width=1 wide" class="a b">',
      ),
    ).toBe(false);
  });

  it("accepts a photo the tag declares larger than 1 by 1", () => {
    expect(
      isTrackingPixelTag(
        '<img src="https://img.example.com/photo.jpg" width="640" height="360">',
      ),
    ).toBe(false);
  });
});

describe("findFirstNonFormulaImage", () => {
  function body(html: string): HTMLElement {
    return new DOMParser().parseFromString(html, "text/html").body;
  }

  it("skips a 1 by 1 tracking counter and returns the next eligible image", () => {
    const image = findFirstNonFormulaImage(
      body(
        `<img src="${COUNTER}" alt="The Conversation" width="1" height="1">` +
          '<img src="https://img.example.com/photo.jpg" width="640">',
      ),
    );

    expect(image?.getAttribute("src")).toBe(
      "https://img.example.com/photo.jpg",
    );
  });

  it("returns nothing when a 1 by 1 tracking counter is the only image", () => {
    const image = findFirstNonFormulaImage(
      body(
        `<p>Article text.</p><img src="${COUNTER}" alt="The Conversation" width="1" height="1">`,
      ),
    );

    expect(image).toBeNull();
  });

  it("keeps an image whose size appears only inside another attribute value", () => {
    const image = findFirstNonFormulaImage(
      body(
        '<img src="https://img.example.com/photo.jpg" alt="shown width=1 wide">',
      ),
    );

    expect(image?.getAttribute("src")).toBe(
      "https://img.example.com/photo.jpg",
    );
  });

  it("still skips a rendered formula image", () => {
    const image = findFirstNonFormulaImage(
      body(
        '<img class="latex" src="https://s0.wp.com/latex.php?latex=x" alt="{x}">' +
          '<img src="https://img.example.com/photo.jpg">',
      ),
    );

    expect(image?.getAttribute("src")).toBe(
      "https://img.example.com/photo.jpg",
    );
  });
});

describe("firstNonFormulaImageUrl", () => {
  const PIXEL = "https://img.example.com/pixel.gif";
  const PHOTO = "https://img.example.com/photo.jpg";

  it("skips a tracking pixel and returns the next candidate", () => {
    expect(firstNonFormulaImageUrl([PIXEL, PHOTO])).toBe(PHOTO);
  });

  it("returns nothing when every candidate is a tracking pixel", () => {
    expect(firstNonFormulaImageUrl([PIXEL, ""])).toBeUndefined();
  });

  it("still skips a rendered formula image", () => {
    expect(
      firstNonFormulaImageUrl(["https://s0.wp.com/latex.php?latex=x", PHOTO]),
    ).toBe(PHOTO);
  });

  it("keeps the first usable url when nothing rejects it", () => {
    expect(firstNonFormulaImageUrl([PHOTO, PIXEL])).toBe(PHOTO);
  });

  // #1182 residual: a size-only counter (here The Conversation's count.gif)
  // carries no declared size in a bare stored url, so a url-only check cannot
  // reject it offline. Out of scope for this issue; see its "Out of scope".
  it("cannot reject a size-only counter from a bare url", () => {
    expect(firstNonFormulaImageUrl([COUNTER])).toBe(COUNTER);
  });
});

describe("isAvatarImageUrl (#1342)", () => {
  it("recognizes the avatar host named in the #812 evidence", () => {
    expect(
      isAvatarImageUrl("https://avatars.githubusercontent.com/u/78101617"),
    ).toBe(true);
  });

  it("recognizes an avatar host whatever the scheme and case", () => {
    expect(isAvatarImageUrl("http://AVATARS.GITHUBUSERCONTENT.com/u/1")).toBe(
      true,
    );
  });

  it("recognizes a gravatar host", () => {
    expect(isAvatarImageUrl("https://secure.gravatar.com/avatar/abc")).toBe(
      true,
    );
  });

  it("leaves an ordinary article image and a non-URL alone", () => {
    expect(isAvatarImageUrl("https://news.example.com/img/hero.jpg")).toBe(
      false,
    );
    // A host that merely names the denylist host in its path is not the host.
    expect(
      isAvatarImageUrl("https://cdn.example.com/avatars.githubusercontent.com"),
    ).toBe(false);
    expect(isAvatarImageUrl("/img/hero.jpg")).toBe(false);
  });
});

describe("optimizeImageUrl", () => {
  it("rewrites Brightspot crop URLs without offset", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/8552x5292/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot crop URLs with +0+0 offset", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/8552x5292+0+0/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs with ! delimiter", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/8552x5292!/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/600x/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs without ! delimiter", () => {
    const input =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/8552x5292/legacy_icon.jpg";
    const expected =
      "https://media.npr.brightspotcdn.com/dims4/default/resize/600x/legacy_icon.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot crop URLs on media.npr.org with +0+0 offset", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/crop/8552x5292+0+0/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs on media.npr.org with ! delimiter", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/8552x5292!/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/600x/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("rewrites Brightspot resize URLs on media.npr.org without ! delimiter", () => {
    const input =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/8552x5292/medium.jpg";
    const expected =
      "https://media.npr.org/assets/img/2024/01/15/test.jpg/resize/600x/medium.jpg";
    expect(optimizeImageUrl(input)).toBe(expected);
  });

  it("does not mangle non-Brightspot URLs", () => {
    const url = "https://example.com/image.jpg";
    expect(optimizeImageUrl(url)).toBe(url);
  });

  it("leaves empty input as empty", () => {
    expect(optimizeImageUrl("")).toBe("");
  });
});

// Fallback path: a "[" host never parses, so these inputs reach the text check.
const UNPARSEABLE = "http://[";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The original regex, kept as a reference for the differential test.
function originalLatexUrlText(src: string): boolean {
  return /(?:^|\/)latex\.php\?[^#]*\blatex=/i.test(src);
}

const LATEX_FRAGMENTS = [
  "latex.php?",
  "/latex.php?",
  "LaTeX.PHP?",
  "latex=",
  "LATEX=",
  "xlatex=",
  "_latex=",
  "1latex=",
  "latex.php",
  "#",
  "/",
  "?",
  "&",
  "=",
  "a",
  "b",
  "Z",
  "9",
  "_",
  "-",
  ".",
  "%",
];

function randomLatexString(random: () => number): string {
  const count = Math.floor(random() * 10);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += LATEX_FRAGMENTS[Math.floor(random() * LATEX_FRAGMENTS.length)];
  }
  return out;
}

describe("isLatexFormulaImage with unparseable URLs", () => {
  const detect = (rest: string) => isLatexFormulaImage(UNPARSEABLE + rest);

  it("matches latex.php with a latex parameter after a slash", () => {
    expect(detect("/x/latex.php?latex=y")).toBe(true);
    expect(detect("/latex.php?bg=fff&latex=y")).toBe(true);
    expect(detect("/LaTeX.PHP?LATEX=y")).toBe(true);
  });

  it("requires a word boundary before the latex parameter", () => {
    expect(detect("/latex.php?xlatex=y")).toBe(false);
    expect(detect("/latex.php?_latex=y")).toBe(false);
    expect(detect("/latex.php?a&latex=y")).toBe(true);
  });

  it("requires latex.php to start a path segment", () => {
    expect(detect("/xlatex.php?latex=y")).toBe(false);
    expect(detect("/x/latex.php?latex=y")).toBe(true);
  });

  it("stops looking at a fragment marker", () => {
    expect(detect("/latex.php?a#latex=y")).toBe(false);
    expect(detect("/latex.php?a#/latex.php?latex=y")).toBe(true);
  });

  it("finds a later match after an earlier one failed", () => {
    expect(detect("/latex.php?a/latex.php?xlatex=/latex.php?latex=")).toBe(
      true,
    );
    expect(detect("/latex.php?a#b/latex.php?c")).toBe(false);
  });

  it("matches the previous behavior on generated inputs", () => {
    const random = seededRandom(20260929);
    for (let i = 0; i < 4000; i++) {
      const rest = randomLatexString(random);
      const expected = originalLatexUrlText((UNPARSEABLE + rest).trim());
      expect(detect(rest), JSON.stringify(rest)).toBe(expected);
    }
  });

  it("handles long paths quickly", () => {
    for (const rest of [
      "/latex.php?".repeat(5000),
      "/latex.php?a".repeat(4200),
      "/latex.php?#".repeat(4200),
      "/latex.php?latex#".repeat(3000),
    ]) {
      const started = performance.now();
      expect(detect(rest)).toBe(false);
      expect(performance.now() - started).toBeLessThan(200);
    }
  });
});

describe("hasLatexPhpQuery", () => {
  it("matches the previous behavior on generated inputs", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 5000; i++) {
      const text = randomLatexString(random);
      expect(hasLatexPhpQuery(text), JSON.stringify(text)).toBe(
        originalLatexUrlText(text),
      );
    }
  });

  it("accepts latex.php at the very start of the text", () => {
    expect(hasLatexPhpQuery("latex.php?latex=y")).toBe(true);
    expect(hasLatexPhpQuery("xlatex.php?latex=y")).toBe(false);
  });
});

describe("promoteLazyImageSources", () => {
  const parse = (html: string): Document =>
    new DOMParser().parseFromString(html, "text/html");

  it("promotes data-lazy to src for an image with no src (JSTOR Daily)", () => {
    const doc = parse(
      '<img width="1050" class="attachment-full" alt="x" data-lazy="https://daily.jstor.org/a.jpg" />',
    );

    promoteLazyImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "https://daily.jstor.org/a.jpg",
    );
  });

  it.each(["data-src", "data-lazy-src", "data-original"])(
    "promotes %s over an inline data: placeholder",
    (attribute) => {
      const doc = parse(
        `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" ${attribute}="/real.png">`,
      );

      promoteLazyImageSources(doc);

      expect(doc.querySelector("img")?.getAttribute("src")).toBe("/real.png");
    },
  );

  it("promotes data-srcset when the image has no srcset", () => {
    const doc = parse(
      '<img data-src="/a.png" data-srcset="/a.png 1x, /b.png 2x">',
    );

    promoteLazyImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("srcset")).toBe(
      "/a.png 1x, /b.png 2x",
    );
  });

  it("leaves an image that already has a real src alone", () => {
    const doc = parse('<img src="/real.png" data-lazy="/other.png">');

    promoteLazyImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("src")).toBe("/real.png");
  });

  it("skips a flag value and tries the next lazy attribute", () => {
    const doc = parse('<img data-lazy="true" data-src="/real.png">');

    promoteLazyImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("src")).toBe("/real.png");
  });

  it("ignores a lazy attribute that is not a single URL", () => {
    const doc = parse('<img data-lazy="not a url">');

    promoteLazyImageSources(doc);

    expect(doc.querySelector("img")?.hasAttribute("src")).toBe(false);
  });
});

describe("extractHighestResolutionFromSrcset", () => {
  it("returns null for empty or null srcset", () => {
    expect(extractHighestResolutionFromSrcset(null)).toBe(null);
    expect(extractHighestResolutionFromSrcset("")).toBe(null);
  });

  it("extracts the highest width descriptor", () => {
    const srcset =
      "https://example.com/img-300.jpg 300w, https://example.com/img-1200.jpg 1200w, https://example.com/img-600.jpg 600w";
    expect(extractHighestResolutionFromSrcset(srcset)).toBe(
      "https://example.com/img-1200.jpg",
    );
  });

  it("extracts the highest pixel density descriptor", () => {
    const srcset =
      "https://example.com/img-1x.jpg 1x, https://example.com/img-3x.jpg 3x, https://example.com/img-2x.jpg 2x";
    expect(extractHighestResolutionFromSrcset(srcset)).toBe(
      "https://example.com/img-3x.jpg",
    );
  });

  it("splits a minified candidate list with no space after the comma (#1361)", () => {
    const srcset =
      "https://cdn.example.com/photo-640.jpg 640w,https://cdn.example.com/photo-1400.jpg 1400w";
    expect(extractHighestResolutionFromSrcset(srcset)).toBe(
      "https://cdn.example.com/photo-1400.jpg",
    );
  });

  it("splits minified candidates whose URLs have no scheme", () => {
    expect(
      extractHighestResolutionFromSrcset(
        "/photo-640.jpg 640w,/photo-1400.jpg 1400w",
      ),
    ).toBe("/photo-1400.jpg");
  });

  it("keeps a candidate URL that itself contains commas whole", () => {
    const substack =
      "https://substackcdn.com/image/fetch/$s_!x!,w_424,c_limit/https%3A%2F%2Fexample.com%2Fphoto.png";
    const srcset = `${substack} 424w, https://cdn.example.com/photo-848.png 848w`;

    expect(extractHighestResolutionFromSrcset(srcset)).toBe(
      "https://cdn.example.com/photo-848.png",
    );
    expect(extractHighestResolutionFromSrcset(`${substack} 424w`)).toBe(
      substack,
    );
  });
});

describe("promotePictureImageSources", () => {
  const parse = (html: string): Document =>
    new DOMParser().parseFromString(html, "text/html");

  it("fills a missing src from the highest-resolution source candidate (Medium)", () => {
    const doc = parse(`
      <figure>
        <div role="button" tabindex="0">
          <span>Press enter or click to view image in full size</span>
          <div>
            <picture>
              <source srcset="https://cdn.example.com/photo-640.webp 640w,https://cdn.example.com/photo-1400.webp 1400w" type="image/webp">
              <source srcset="https://cdn.example.com/photo-640.jpg 640w,https://cdn.example.com/photo-1400.jpg 1400w">
              <img alt="" width="700" height="365" loading="eager" role="presentation">
            </picture>
          </div>
        </div>
        <figcaption>Caption</figcaption>
      </figure>
    `);

    promotePictureImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/photo-1400.webp",
    );
    expect(doc.querySelector('[role="button"] > span')).toBeNull();
  });

  it("skips a higher non-http candidate in favour of a lower http one", () => {
    const doc = parse(`
      <picture>
        <source srcset="https://cdn.example.com/photo-640.jpg 640w, data:image/gif;base64,AAAA 1400w">
        <img>
      </picture>
    `);

    promotePictureImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/photo-640.jpg",
    );
  });

  it("leaves a standalone image's srcset alone", () => {
    const doc = parse(
      '<img srcset="https://cdn.example.com/photo-640.jpg 640w">',
    );

    promotePictureImageSources(doc);

    expect(doc.querySelector("img")?.hasAttribute("src")).toBe(false);
  });

  it("uses the first source with a usable candidate, ahead of the image's own srcset", () => {
    const doc = parse(`
      <picture>
        <source srcset="data:image/gif;base64,AAAA 640w">
        <source srcset="https://cdn.example.com/from-source.jpg 800w">
        <img srcset="https://cdn.example.com/from-image.jpg 1600w">
      </picture>
    `);

    promotePictureImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/from-source.jpg",
    );
  });

  it("falls back to the image's own srcset when no source has a usable candidate", () => {
    const doc = parse(`
      <picture>
        <source srcset="data:image/gif;base64,AAAA 640w">
        <img srcset="https://cdn.example.com/small.jpg 640w, https://cdn.example.com/large.jpg 1400w">
      </picture>
    `);

    promotePictureImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/large.jpg",
    );
  });

  it("leaves an image that already has an http(s) src alone", () => {
    const doc = parse(`
      <picture>
        <source srcset="https://cdn.example.com/other.jpg 1400w">
        <img src="https://cdn.example.com/real.jpg">
      </picture>
    `);

    promotePictureImageSources(doc);

    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "https://cdn.example.com/real.jpg",
    );
  });

  it.each([
    ["an empty source", '<source srcset=""><img>'],
    [
      "a data: candidate",
      '<source srcset="data:image/gif;base64,AAAA 640w"><img>',
    ],
    [
      "a non-http(s) candidate",
      '<source srcset="app://local/photo.jpg 640w"><img>',
    ],
    ["a relative candidate", '<source srcset="/photo.jpg 640w"><img>'],
  ])("never uses %s as the src", (_name, markup) => {
    const doc = parse(`<picture>${markup}</picture>`);

    promotePictureImageSources(doc);

    expect(doc.querySelector("img")?.hasAttribute("src")).toBe(false);
  });
});
