import { describe, expect, it } from "vitest";
import { extractGitHubIssueContent } from "../../../src/utils/github-issue-page";

const ISSUE_URL = "https://github.com/golang/go/issues/82345";

interface IssueOverrides {
  state?: string;
  createdAt?: string;
  author?: { login: string } | null;
  labels?: string[];
  bodyHTML?: string;
}

// Trimmed to the fields the extractor reads, in the shape of a real issue page's
// embedded JSON (payload.issueViewerRoute.data.repository.issue).
function issuePage(overrides: IssueOverrides = {}): string {
  const issue = {
    number: 82345,
    state: overrides.state ?? "OPEN",
    createdAt: overrides.createdAt ?? "2026-10-19T21:38:02Z",
    author:
      overrides.author === undefined
        ? { login: "thatnealpatel" }
        : overrides.author,
    labels: {
      edges: (overrides.labels ?? []).map((name) => ({ node: { name } })),
    },
    bodyHTML: overrides.bodyHTML ?? "<p>The issue body.</p>",
  };
  const data = {
    payload: { issueViewerRoute: { data: { repository: { issue } } } },
  };
  return `<html><head><title>Issue</title></head><body><div id="app"><img src="https://avatars.githubusercontent.com/u/1" class="avatar"><span>MemberAuthor</span><ol><li></li></ol></div><script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(data).replace(/</g, "\\u003c")}</script></body></html>`;
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html ?? "", "text/html");
}

describe("extractGitHubIssueContent - valid issue page", () => {
  it("returns the issue body without avatars, role badges or empty list items", () => {
    const html = extractGitHubIssueContent(issuePage(), ISSUE_URL);

    expect(html).not.toBeNull();
    const doc = parse(html as string);
    expect(doc.body.textContent).toContain("The issue body.");
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.body.textContent).not.toContain("MemberAuthor");
    expect(doc.body.textContent).not.toContain("Reacted by");
    expect(doc.querySelectorAll("li")).toHaveLength(0);
  });

  it("states Open or Closed, the author, the date and the labels in one meta paragraph", () => {
    const open = parse(
      extractGitHubIssueContent(
        issuePage({ labels: ["release-blocker", "Security"] }),
        ISSUE_URL,
      ) as string,
    );
    const meta = open.body.firstElementChild as HTMLElement;
    const expectedDate = new Date("2026-10-19T21:38:02Z").toLocaleDateString();

    expect(meta.tagName).toBe("P");
    expect(meta.textContent).toContain("Open");
    expect(meta.textContent).toContain("opened by @thatnealpatel");
    expect(meta.textContent).toContain(expectedDate);
    expect(meta.textContent).toContain("release-blocker");
    expect(meta.textContent).toContain("Security");
    expect(meta.children).toHaveLength(0);

    const closed = parse(
      extractGitHubIssueContent(
        issuePage({ state: "CLOSED" }),
        ISSUE_URL,
      ) as string,
    );
    expect(closed.body.firstElementChild?.textContent).toContain("Closed");
  });

  it("omits the label part when the issue has no labels", () => {
    const doc = parse(
      extractGitHubIssueContent(issuePage({ labels: [] }), ISSUE_URL) as string,
    );

    expect(
      doc.body.firstElementChild?.textContent?.toLowerCase(),
    ).not.toContain("label");
  });

  it("renders a null author as @ghost", () => {
    const doc = parse(
      extractGitHubIssueContent(
        issuePage({ author: null }),
        ISSUE_URL,
      ) as string,
    );

    expect(doc.body.firstElementChild?.textContent).toContain(
      "opened by @ghost",
    );
  });

  it("escapes author and label text instead of emitting markup", () => {
    const html = extractGitHubIssueContent(
      issuePage({
        author: { login: "<img src=x onerror=alert(1)>" },
        labels: ["<script>alert(2)</script>"],
      }),
      ISSUE_URL,
    ) as string;
    const doc = parse(html);

    expect(doc.querySelector("img")).toBeNull();
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.body.firstElementChild?.textContent).toContain(
      "<script>alert(2)</script>",
    );
  });

  it("does not emit scripts, event handlers or javascript links from the body", () => {
    const html = extractGitHubIssueContent(
      issuePage({
        bodyHTML:
          '<p>Hi</p><script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(2)"><a href="javascript:alert(3)">x</a><iframe src="https://evil.example"></iframe>',
      }),
      ISSUE_URL,
    ) as string;
    const doc = parse(html);

    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("iframe")).toBeNull();
    expect(doc.querySelector("[onerror]")).toBeNull();
    expect(doc.querySelector("a")?.getAttribute("href") ?? "").not.toMatch(
      /^javascript:/i,
    );
    expect(doc.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.com/a.png",
    );
    expect(doc.body.textContent).toContain("Hi");
  });
});

describe("extractGitHubIssueContent - returns null", () => {
  it.each([
    ["a page with no embedded script", "<html><body><p>hi</p></body></html>"],
    [
      "invalid JSON",
      '<html><body><script data-target="react-app.embeddedData">{nope</script></body></html>',
    ],
    [
      "JSON with no issue object",
      '<html><body><script data-target="react-app.embeddedData">{"payload":{"issueViewerRoute":{"data":{"repository":{}}}}}</script></body></html>',
    ],
    [
      "an issue of an unexpected shape",
      '<html><body><script data-target="react-app.embeddedData">{"payload":{"issueViewerRoute":{"data":{"repository":{"issue":"nope"}}}}}</script></body></html>',
    ],
    ["an empty page", ""],
  ])("for %s", (_name, html) => {
    expect(extractGitHubIssueContent(html, ISSUE_URL)).toBeNull();
  });
});

describe("extractGitHubIssueContent - URL matching", () => {
  it.each([
    "https://github.com/golang/go/issues/82345/",
    "https://github.com/golang/go/issues/82345?foo=bar",
    "https://github.com/golang/go/issues/82345#issuecomment-123",
  ])("handles the issue URL %s", (url) => {
    expect(extractGitHubIssueContent(issuePage(), url)).not.toBeNull();
  });

  it.each([
    "https://github.com/golang/go/pull/66000",
    "https://github.com/golang/go/discussions/1",
    "https://github.com/golang/go/releases/tag/go1.0",
    "https://github.com/golang/go/commit/abc123",
    "https://gist.github.com/someone/abc123",
    "https://github.com/golang/go/issues",
    "https://github.com/golang/go/issues/new",
    "https://github.com/golang/go/issues/82345/extra",
    "https://example.com/golang/go/issues/82345",
    "https://notgithub.com/golang/go/issues/82345",
    "https://github.com.evil.example/golang/go/issues/82345",
    "not a url",
    "",
  ])("does not invoke the extractor for %s", (url) => {
    expect(extractGitHubIssueContent(issuePage(), url)).toBeNull();
  });
});
