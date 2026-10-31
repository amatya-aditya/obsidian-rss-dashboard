import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  robustFetchDetailed: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
}));

import { robustFetchDetailed } from "../../../src/utils/platform-utils";
import { fetchWithProxyFallbackDetailed } from "../../../src/utils/fetch-helpers";
import {
  PageCoverImageService,
  createPageCoverFetch,
} from "../../../src/services/page-cover-image-service";

const detailedMock = vi.mocked(robustFetchDetailed);

const POST_URL = "https://bsky.app/profile/bsky.app/post/3myx7vphq3s2j";
const DID = "did:plc:z72i7hdynmk6r22z27h6tvur";
const AVATAR = `https://cdn.bsky.app/img/avatar_thumbnail/plain/${DID}/bafkavatar`;
const REPLY_IMAGE = `https://cdn.bsky.app/img/feed_thumbnail/plain/${DID}/bafkreply`;
const thumb = (name: string) =>
  `https://cdn.bsky.app/img/feed_thumbnail/plain/${DID}/${name}`;
const full = (name: string) =>
  `https://cdn.bsky.app/img/feed_fullsize/plain/${DID}/${name}`;

// A post page as the server returns it: the post is not in the body (the app
// renders it client-side), only in the head's JSON-LD and og:image tags.
function postPage(options: {
  text?: string;
  images?: string[];
  ogImages: string[];
}): string {
  const mainEntity = {
    "@type": "DiscussionForumPosting",
    url: POST_URL,
    text: options.text ?? "getting our Halloween decorations set up",
    ...(options.images ? { image: options.images } : {}),
    comment: [
      {
        "@type": "Comment",
        text: "look at this",
        sharedContent: { "@type": "WebPage", image: REPLY_IMAGE },
      },
    ],
  };
  const jsonLd = { "@type": "WebPage", url: POST_URL, mainEntity };
  const og = options.ogImages
    .map((src) => `<meta property="og:image" content="${src}">`)
    .join("");
  return `<html><head><title>@bsky.app on Bluesky</title>${og}<script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body><div id="root"></div><noscript>You need to enable JavaScript to run this app.</noscript></body></html>`;
}

const IMAGE_PAGE = postPage({
  text: "Short post",
  images: [thumb("one"), thumb("two")],
  ogImages: [thumb("one"), thumb("two"), REPLY_IMAGE],
});
const TEXT_ONLY_PAGE = postPage({ ogImages: [AVATAR, REPLY_IMAGE] });

describe("fetched Bluesky post pages (#1738)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
    detailedMock.mockResolvedValue({ text: IMAGE_PAGE, status: 200 });
  });

  it("returns the post's text and full-size images as trusted content", async () => {
    const result = await fetchWithProxyFallbackDetailed(POST_URL);

    expect(result.failureType).toBe("none");
    expect(result.content).toContain("Short post");
    expect(result.content).toContain(full("one"));
    expect(result.content).toContain(full("two"));
    expect(result.content).not.toContain(REPLY_IMAGE);
    expect(result.trusted).toBe(true);
  });

  it("uses the post's first image as the page image", async () => {
    const result = await fetchWithProxyFallbackDetailed(POST_URL);

    expect(result.pageImage).toBe(full("one"));
  });

  it("gives a text-only post no page image, not the author's avatar or a reply's image", async () => {
    detailedMock.mockResolvedValue({ text: TEXT_ONLY_PAGE, status: 200 });

    const result = await fetchWithProxyFallbackDetailed(POST_URL);

    expect(result.pageImage).toBeUndefined();
    expect(result.trusted).toBeUndefined();
    expect(result.content).not.toContain("<img");
  });

  it("reads the cover of a metadata-only fetch from the post, not from og:image", async () => {
    const withImages = await fetchWithProxyFallbackDetailed(
      POST_URL,
      "",
      undefined,
      { metadataOnly: true },
    );
    detailedMock.mockResolvedValue({ text: TEXT_ONLY_PAGE, status: 200 });
    const textOnly = await fetchWithProxyFallbackDetailed(
      POST_URL,
      "",
      undefined,
      { metadataOnly: true },
    );

    expect(withImages.pageImage).toBe(full("one"));
    expect(withImages.content).toBe("");
    expect(textOnly.pageImage).toBeUndefined();
  });

  it("sends the same requests and headers as for a non-Bluesky page", async () => {
    const proxy = "https://proxy.example/?url=";
    const calls = async (url: string) => {
      detailedMock.mockClear();
      await fetchWithProxyFallbackDetailed(url, proxy, 30);
      return detailedMock.mock.calls.map(([target, options]) => ({
        target: String(target).replace(url, "<page>"),
        headers: (options as { headers?: Record<string, string> } | undefined)
          ?.headers,
      }));
    };

    const bluesky = await calls(POST_URL);
    const other = await calls("https://example.com/profile/bsky.app/post/1");

    expect(bluesky).toHaveLength(1);
    expect(bluesky).toEqual(other);
  });
});

describe("the card's cover-image fetch for a Bluesky post (AC-004)", () => {
  // The real path: the metadata-only page read, then the cover service, which
  // builds the cover from the page metadata's og:image and twitter:image.
  const service = () =>
    new PageCoverImageService({
      fetchPage: createPageCoverFetch(() => ({ articleSaving: {} })),
    });

  beforeEach(() => {
    detailedMock.mockReset();
  });

  it("finds the post's first full-size picture, not an og:image from a reply", async () => {
    detailedMock.mockResolvedValue({
      text: postPage({
        images: [thumb("one"), thumb("two")],
        ogImages: [REPLY_IMAGE, thumb("one")],
      }),
      status: 200,
    });

    await expect(service().fetch(POST_URL)).resolves.toEqual({
      status: "found",
      url: full("one"),
    });
  });

  it("finds nothing for a text-only post, whose og:image is the author's avatar", async () => {
    detailedMock.mockResolvedValue({ text: TEXT_ONLY_PAGE, status: 200 });

    await expect(service().fetch(POST_URL)).resolves.toEqual({
      status: "none",
      url: "",
    });
  });

  it("finds nothing for a text-only post even when twitter:image names the avatar", async () => {
    detailedMock.mockResolvedValue({
      text: TEXT_ONLY_PAGE.replace(
        "</head>",
        `<meta name="twitter:image" content="${AVATAR}"></head>`,
      ),
      status: 200,
    });

    await expect(service().fetch(POST_URL)).resolves.toEqual({
      status: "none",
      url: "",
    });
  });

  it("finds nothing from the head of a refused Bluesky post page", async () => {
    // A refused page still hands back its head; the avatar in it is not a cover.
    detailedMock.mockResolvedValue({
      text: TEXT_ONLY_PAGE.replace("<body>", "<body><!-- challenge -->"),
      status: 403,
    });

    const result = await service().fetch(POST_URL);

    expect(result.url).toBe("");
  });
});

describe("a Bluesky URL that is not a post page, and other pages (AC-006)", () => {
  const PROSE = "Readable page text that Readability keeps. ".repeat(30);
  const ARTICLE = `<html><head><title>T</title><meta property="og:image" content="https://example.com/hero.jpg"></head><body><article><h1>T</h1><p>${PROSE}</p></article></body></html>`;

  beforeEach(() => {
    detailedMock.mockReset();
    detailedMock.mockResolvedValue({ text: ARTICLE, status: 200 });
  });

  it("keeps the Readability content and og:image page image for another host", async () => {
    const result = await fetchWithProxyFallbackDetailed(
      "https://example.com/a",
    );

    expect(result.content).toContain("Readability keeps");
    expect(result.pageImage).toBe("https://example.com/hero.jpg");
    expect(result.trusted).toBeUndefined();
  });

  it("keeps the Readability content and og:image for a Bluesky page that is not a post", async () => {
    const result = await fetchWithProxyFallbackDetailed(
      "https://bsky.app/profile/bsky.app",
    );

    expect(result.content).toContain("Readability keeps");
    expect(result.pageImage).toBe("https://example.com/hero.jpg");
    expect(result.trusted).toBeUndefined();
  });

  it("falls back to the Readability content when a post page has no post data", async () => {
    const result = await fetchWithProxyFallbackDetailed(POST_URL);

    expect(result.content).toContain("Readability keeps");
    expect(result.trusted).toBeUndefined();
  });
});
