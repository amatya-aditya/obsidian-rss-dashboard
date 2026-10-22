import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/utils/platform-utils", () => ({
  robustFetch: vi.fn(),
  robustFetchDetailed: vi.fn(),
  ensureUtf8Meta: (html: string) => html,
}));

import { robustFetchDetailed } from "../../../src/utils/platform-utils";
import { fetchWithProxyFallbackDetailed } from "../../../src/utils/fetch-helpers";

const detailedMock = vi.mocked(robustFetchDetailed);

const ISSUE_URL = "https://github.com/golang/go/issues/82345";
const PROSE = "Readable page text that Readability keeps. ".repeat(30);

const embedded = JSON.stringify({
  payload: {
    issueViewerRoute: {
      data: {
        repository: {
          issue: {
            state: "OPEN",
            createdAt: "2026-10-19T21:38:02Z",
            author: { login: "thatnealpatel" },
            labels: { edges: [{ node: { name: "Security" } }] },
            bodyHTML: "<p>The issue body.</p>",
          },
        },
      },
    },
  },
});

// An issue page: Readability-friendly prose, social metadata, and the embedded JSON.
const PAGE = `<html><head><title>Issue title</title>
<meta property="og:image" content="https://opengraph.githubassets.com/x/golang/go/issues/82345">
<meta name="description" content="Short description">
</head><body><article><h1>Issue title</h1><p>${PROSE}</p></article>
<script type="application/json" data-target="react-app.embeddedData">${embedded}</script></body></html>`;

describe("fetched GitHub issue pages (#1394)", () => {
  beforeEach(() => {
    detailedMock.mockReset();
    detailedMock.mockResolvedValue({ text: PAGE, status: 200 });
  });

  it("returns the issue's plain HTML for an issue URL", async () => {
    const result = await fetchWithProxyFallbackDetailed(ISSUE_URL);

    expect(result.failureType).toBe("none");
    expect(result.content).toContain("opened by @thatnealpatel");
    expect(result.content).toContain("The issue body.");
    expect(result.content).not.toContain("Readability keeps");
  });

  it("returns the Readability result for the same page at a non-issue URL", async () => {
    const result = await fetchWithProxyFallbackDetailed(
      "https://github.com/golang/go/pull/66000",
    );

    expect(result.content).toContain("Readability keeps");
    expect(result.content).not.toContain("opened by");
  });

  it("returns the Readability result when an issue page has no embedded data", async () => {
    detailedMock.mockResolvedValue({
      text: PAGE.replace('data-target="react-app.embeddedData"', ""),
      status: 200,
    });

    const result = await fetchWithProxyFallbackDetailed(ISSUE_URL);

    expect(result.content).toContain("Readability keeps");
  });

  it("keeps the page metadata and image the same as for a non-issue URL", async () => {
    const issue = await fetchWithProxyFallbackDetailed(ISSUE_URL);
    const other = await fetchWithProxyFallbackDetailed(
      "https://github.com/golang/go/pull/66000",
    );

    expect(issue.pageMetadata).toEqual(other.pageMetadata);
    expect(issue.pageImage).toBe(other.pageImage);
    expect(issue.pageImage).toBeDefined();
  });

  it("sends the same requests and headers as for a non-GitHub page (#1500)", async () => {
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

    const issue = await calls(ISSUE_URL);
    const other = await calls("https://example.com/a/issues/82345");

    expect(issue).toHaveLength(1);
    expect(issue).toEqual(other);
  });
});
