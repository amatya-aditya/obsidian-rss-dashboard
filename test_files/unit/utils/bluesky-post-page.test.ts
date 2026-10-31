import { describe, expect, it } from "vitest";
import {
  extractBlueskyPost,
  isBlueskyPostUrl,
} from "../../../src/utils/bluesky-post-page";
import { cleanFetchedArticleDocument } from "../../../src/utils/reader-html-cleanup";
import { sanitizeAndAppendHtml } from "../../../src/utils/safe-html";

const POST_URL = "https://bsky.app/profile/bsky.app/post/3myx7vphq3s2j";
const DID = "did:plc:z72i7hdynmk6r22z27h6tvur";
const AVATAR = `https://cdn.bsky.app/img/avatar_thumbnail/plain/${DID}/bafkavatar`;

function thumb(name: string): string {
  return `https://cdn.bsky.app/img/feed_thumbnail/plain/${DID}/${name}`;
}

function full(name: string): string {
  return `https://cdn.bsky.app/img/feed_fullsize/plain/${DID}/${name}`;
}

interface PostOverrides {
  text?: string;
  images?: string[];
  video?: Record<string, unknown>;
  comments?: Record<string, unknown>[];
  ogImages?: string[];
  mainEntity?: Record<string, unknown> | null;
}

// Trimmed to the fields the extractor reads, in the shape of a real post page:
// one JSON-LD block in the head (a WebPage wrapping a DiscussionForumPosting)
// and one og:image tag per image, or the author's avatar when there are none.
function postPage(overrides: PostOverrides = {}): string {
  const mainEntity =
    overrides.mainEntity === undefined
      ? {
          "@type": "DiscussionForumPosting",
          url: POST_URL,
          text: overrides.text ?? "getting our Halloween decorations set up",
          ...(overrides.images ? { image: overrides.images } : {}),
          ...(overrides.video ? { video: overrides.video } : {}),
          comment: overrides.comments ?? [],
        }
      : overrides.mainEntity;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: POST_URL,
    ...(mainEntity ? { mainEntity } : {}),
  };
  const ogImages = overrides.ogImages ?? overrides.images ?? [AVATAR];
  const ogTags = ogImages
    .map((src) => `<meta property="og:image" content="${src}">`)
    .join("\n");
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>@bsky.app on Bluesky</title>
${ogTags}
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head><body><div id="root"></div><noscript>You need to enable JavaScript to run this app.</noscript></body></html>`;
}

function extracted(html: string, url = POST_URL) {
  const result = extractBlueskyPost(html, url);
  if (result === null) throw new Error("expected the fixture to extract");
  return result;
}

function imageSources(html: string): string[] {
  return Array.from(
    new DOMParser().parseFromString(html, "text/html").querySelectorAll("img"),
  ).map((img) => img.getAttribute("src") ?? "");
}

describe("isBlueskyPostUrl", () => {
  it.each([
    POST_URL,
    "https://bsky.app/profile/did:plc:abc123/post/3myx7vphq3s2j",
    "https://bsky.app/profile/bsky.app/post/3myx7vphq3s2j/",
    "https://BSKY.APP/profile/bsky.app/post/3myx7vphq3s2j?ref=rss#top",
    "http://bsky.app/profile/bsky.app/post/3myx7vphq3s2j",
  ])("matches the post page %s", (url) => {
    expect(isBlueskyPostUrl(url)).toBe(true);
  });

  it.each([
    "https://bsky.app/profile/bsky.app",
    "https://bsky.app/profile/bsky.app/post",
    "https://bsky.app/profile/bsky.app/post/3myx7vphq3s2j/reposted-by",
    "https://bsky.app/profile/bsky.app/feed/3myx7vphq3s2j",
    "https://bsky.app/hashtag/halloween",
    "https://www.bsky.app/profile/bsky.app/post/3myx7vphq3s2j",
    "https://bsky.app.evil.example/profile/bsky.app/post/3myx7vphq3s2j",
    "https://example.com/profile/bsky.app/post/3myx7vphq3s2j",
    "https://staging.bsky.app/profile/bsky.app/post/3myx7vphq3s2j",
    "ftp://bsky.app/profile/bsky.app/post/3myx7vphq3s2j",
    "not a url",
    "",
  ])("rejects %s", (url) => {
    expect(isBlueskyPostUrl(url)).toBe(false);
  });
});

describe("extractBlueskyPost - image posts (AC-001)", () => {
  it("returns the post text and every image in order at full size", () => {
    const html = postPage({
      text: "getting our Halloween decorations set up",
      images: [thumb("one"), thumb("two"), thumb("three"), thumb("four")],
    });

    const { content } = extracted(html);

    expect(
      new DOMParser().parseFromString(content, "text/html").body.textContent,
    ).toContain("getting our Halloween decorations set up");
    expect(imageSources(content)).toEqual([
      full("one"),
      full("two"),
      full("three"),
      full("four"),
    ]);
  });

  it("returns every image of a gallery post, not only the first four", () => {
    const names = ["a", "b", "c", "d", "e"];

    const { content } = extracted(
      postPage({ images: names.map((name) => thumb(name)) }),
    );

    expect(imageSources(content)).toEqual(names.map((name) => full(name)));
  });

  it("caps the images at 20", () => {
    const names = Array.from({ length: 25 }, (_, i) => `img${i}`);

    const { content } = extracted(
      postPage({ images: names.map((name) => thumb(name)) }),
    );

    expect(imageSources(content)).toEqual(
      names.slice(0, 20).map((name) => full(name)),
    );
  });

  it("uses the first full-size image as the cover", () => {
    const result = extracted(
      postPage({ images: [thumb("one"), thumb("two")] }),
    );

    expect(result.coverImage).toBe(full("one"));
  });

  it("leaves an image URL that is not a feed thumbnail as it is", () => {
    const other = "https://example.com/pictures/one.jpg";

    const { content } = extracted(postPage({ images: [other] }));

    expect(imageSources(content)).toEqual([other]);
  });

  it("skips an image entry that is not an http(s) URL", () => {
    const { content, coverImage } = extracted(
      postPage({
        images: [
          "javascript:alert(1)",
          "data:image/svg+xml,<svg/>",
          "/relative.jpg",
          "",
          thumb("ok"),
        ],
      }),
    );

    expect(imageSources(content)).toEqual([full("ok")]);
    expect(coverImage).toBe(full("ok"));
  });

  it("keeps the paragraphs and line breaks of the post text", () => {
    const { content } = extracted(
      postPage({
        text: "First line\nsecond line\n\nNew paragraph",
        images: [thumb("one")],
      }),
    );
    const doc = new DOMParser().parseFromString(content, "text/html");
    const paragraphs = Array.from(
      doc.querySelectorAll("p[data-rss-keep-lead]"),
    ).map((p) => p.innerHTML);

    expect(paragraphs).toEqual(["First line<br>second line", "New paragraph"]);
  });

  it("escapes the post text so it cannot add markup", () => {
    const { content } = extracted(
      postPage({
        text: `<img src=x onerror="window.pwned = 1"> & <script>window.pwned = 2</script>`,
        images: [thumb("one")],
      }),
    );
    const doc = new DOMParser().parseFromString(content, "text/html");

    expect(doc.querySelector("script")).toBeNull();
    expect(imageSources(content)).toEqual([full("one")]);
    expect(doc.body.textContent).toContain(`<img src=x onerror="window.pwned`);
    expect(doc.body.textContent).toContain("& <script>");
  });

  it("returns only the images when the post has no text", () => {
    const { content } = extracted(
      postPage({ text: "", images: [thumb("one")] }),
    );

    expect(imageSources(content)).toEqual([full("one")]);
    expect(
      new DOMParser()
        .parseFromString(content, "text/html")
        .querySelector("p[data-rss-keep-lead]"),
    ).toBeNull();
  });
});

describe("extractBlueskyPost - what it must not read (AC-003, AC-004)", () => {
  it("returns null for a text-only post, whose og:image is the author's avatar", () => {
    expect(
      extractBlueskyPost(postPage({ ogImages: [AVATAR] }), POST_URL),
    ).toBeNull();
  });

  it("returns null for a link-card post that carries no image", () => {
    const html = postPage({
      mainEntity: {
        "@type": "DiscussionForumPosting",
        url: POST_URL,
        text: "Worth a read",
        sharedContent: { "@type": "WebPage", url: "https://example.com/a" },
        comment: [],
      },
      ogImages: [AVATAR],
    });

    expect(extractBlueskyPost(html, POST_URL)).toBeNull();
  });

  it("returns null for a quote post whose replies carry images", () => {
    const html = postPage({
      mainEntity: {
        "@type": "DiscussionForumPosting",
        url: POST_URL,
        text: "STREAMING LIVE NOW\n\n[contains quote post or other embedded content]",
        isBasedOn: { "@type": "DiscussionForumPosting" },
        comment: [
          {
            "@type": "Comment",
            text: "nice",
            sharedContent: { "@type": "WebPage", image: thumb("reply") },
            image: [thumb("reply-image")],
          },
        ],
      },
      ogImages: [AVATAR, thumb("reply")],
    });

    expect(extractBlueskyPost(html, POST_URL)).toBeNull();
  });

  it("never takes an image from a reply or from an og:image tag", () => {
    const html = postPage({
      images: [thumb("post")],
      comments: [
        {
          "@type": "Comment",
          text: "look",
          sharedContent: { "@type": "WebPage", image: thumb("reply") },
        },
      ],
      ogImages: [AVATAR, thumb("post"), thumb("reply")],
    });

    const result = extracted(html);

    expect(imageSources(result.content)).toEqual([full("post")]);
    expect(result.coverImage).toBe(full("post"));
    expect(result.content).not.toContain("reply");
    expect(result.content).not.toContain("avatar");
  });

  it.each([
    ["no JSON-LD at all", "<html><head></head><body>x</body></html>"],
    [
      "JSON-LD that is not JSON",
      `<html><head><script type="application/ld+json">{nope</script></head></html>`,
    ],
    [
      "a JSON-LD block without a mainEntity",
      `<html><head><script type="application/ld+json">{"@type":"WebPage"}</script></head></html>`,
    ],
    ["an empty page", ""],
  ])("returns null for %s", (_label, html) => {
    expect(extractBlueskyPost(html, POST_URL)).toBeNull();
  });

  it("returns null when the mainEntity is not a DiscussionForumPosting", () => {
    const html = postPage({
      mainEntity: { "@type": "Person", image: [thumb("one")] },
    });

    expect(extractBlueskyPost(html, POST_URL)).toBeNull();
  });

  it("returns null when the mainEntity image is not a list of strings", () => {
    const html = postPage({
      mainEntity: {
        "@type": "DiscussionForumPosting",
        text: "x",
        image: { url: thumb("one") },
      },
    });

    expect(extractBlueskyPost(html, POST_URL)).toBeNull();
  });

  it("returns null for a URL that is not a Bluesky post page, even with the same markup", () => {
    const html = postPage({ images: [thumb("one")] });

    expect(extractBlueskyPost(html, "https://example.com/a")).toBeNull();
    expect(
      extractBlueskyPost(html, "https://bsky.app/profile/bsky.app"),
    ).toBeNull();
  });
});

describe("extractBlueskyPost - video posts (DEC-009)", () => {
  const POSTER =
    "https://video.bsky.app/watch/did%3Aplc%3Az72i7hdynmk6r22z27h6tvur/bafkvideo/thumbnail.jpg";
  const video = {
    "@type": "VideoObject",
    name: "A before and after",
    thumbnailUrl: POSTER,
    contentUrl: POSTER.replace("thumbnail.jpg", "playlist.m3u8"),
    embedUrl: POST_URL,
  };

  it("returns the text, the poster and a Watch on Bluesky link, with no playlist", () => {
    const result = extracted(
      postPage({
        text: "v1.136 is live!",
        images: [POSTER],
        video,
        ogImages: [POSTER],
      }),
    );
    const doc = new DOMParser().parseFromString(result.content, "text/html");
    const link = doc.querySelector("a");

    expect(doc.body.textContent).toContain("v1.136 is live!");
    expect(imageSources(result.content)).toEqual([POSTER]);
    expect(link?.textContent).toBe("Watch on Bluesky");
    expect(link?.getAttribute("href")).toBe(POST_URL);
    expect(result.content).not.toContain("m3u8");
    expect(result.coverImage).toBe(POSTER);
  });

  it("shows the poster once when the image list repeats it", () => {
    const { content } = extracted(
      postPage({ images: [POSTER], video, ogImages: [POSTER] }),
    );

    expect(imageSources(content)).toEqual([POSTER]);
  });

  it("links the post without the query string or fragment of the page URL", () => {
    const { content } = extracted(
      postPage({ images: [POSTER], video }),
      `${POST_URL}?ref=rss#top`,
    );

    expect(
      new DOMParser()
        .parseFromString(content, "text/html")
        .querySelector("a")
        ?.getAttribute("href"),
    ).toBe(POST_URL);
  });

  it("still returns the text and the link when the video names no poster", () => {
    const result = extracted(
      postPage({
        text: "A clip",
        video: { "@type": "VideoObject", name: "A clip" },
      }),
    );

    expect(result.content).toContain("A clip");
    expect(result.content).toContain("Watch on Bluesky");
    expect(imageSources(result.content)).toEqual([]);
    expect(result.coverImage).toBe("");
  });
});

describe("extractBlueskyPost - purity (AC-005)", () => {
  it("takes only the page HTML and its URL, so it has nothing to request with", () => {
    // The requests a fetched Bluesky page makes are compared with any other
    // page's in fetch-helpers-bluesky.test.ts.
    expect(extractBlueskyPost.length).toBe(2);
  });
});

describe("extractBlueskyPost through the Reader cleanup (AC-001, AC-002)", () => {
  it("keeps a short post's text and all its images after the Reader cleanup and sanitizer", () => {
    const { content } = extracted(
      postPage({
        text: "Short post",
        images: [thumb("one"), thumb("two")],
      }),
    );
    const doc = new DOMParser().parseFromString(content, "text/html");
    cleanFetchedArticleDocument(doc, {});
    const host = activeDocument.body.createDiv();
    sanitizeAndAppendHtml(host, doc.body.innerHTML, { mode: "rich" });

    expect(host.textContent).toContain("Short post");
    expect(
      Array.from(host.querySelectorAll("img")).map((img) =>
        img.getAttribute("src"),
      ),
    ).toEqual([full("one"), full("two")]);

    host.remove();
  });

  it("keeps every image of a post with no text, where the first image leads the body", () => {
    const { content } = extracted(
      postPage({ text: "", images: [thumb("one"), thumb("two")] }),
    );
    const doc = new DOMParser().parseFromString(content, "text/html");
    cleanFetchedArticleDocument(doc, {});
    const host = activeDocument.body.createDiv();
    sanitizeAndAppendHtml(host, doc.body.innerHTML, { mode: "rich" });

    expect(
      Array.from(host.querySelectorAll("img")).map((img) =>
        img.getAttribute("src"),
      ),
    ).toEqual([full("one"), full("two")]);

    host.remove();
  });
});
