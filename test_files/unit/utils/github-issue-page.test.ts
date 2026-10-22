import { describe, expect, it } from "vitest";
import { extractGitHubIssueContent } from "../../../src/utils/github-issue-page";

const ISSUE_URL = "https://github.com/golang/go/issues/82345";

interface IssueOverrides {
  state?: string;
  createdAt?: string;
  author?: { login: string } | null;
  labels?: string[];
  bodyHTML?: string;
  timeline?: Record<string, unknown>[];
  totalCommentsCount?: number;
}

function comment(
  login: string | null,
  bodyHTML: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    __typename: "IssueComment",
    createdAt: "2026-10-20T10:00:00Z",
    isHidden: false,
    isMinimized: false,
    author: login === null ? null : { login },
    bodyHTML,
    ...extra,
  };
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
    totalCommentsCount: overrides.totalCommentsCount ?? 0,
    timelineItems: {
      edges: (overrides.timeline ?? []).map((node) => ({ cursor: "c", node })),
    },
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

describe("extractGitHubIssueContent - comments", () => {
  const mixed = [
    comment("alice", "<p>First comment.</p>"),
    { __typename: "LabeledEvent", createdAt: "2026-10-20T11:00:00Z" },
    comment("spammer", "<p>Hidden comment.</p>", { isHidden: true }),
    comment("bob", "<p>Minimized comment.</p>", { isMinimized: true }),
    comment("gabyhelp[bot]", "<p>Bot comment.</p>"),
    comment(null, "<p>Ghost comment.</p>"),
  ];

  function render(overrides: IssueOverrides): Document {
    return parse(
      extractGitHubIssueContent(issuePage(overrides), ISSUE_URL) as string,
    );
  }

  it("renders only visible comments in payload order, bots kept, each as an h3 plus body split by hr", () => {
    const doc = render({ timeline: mixed, totalCommentsCount: 5 });
    const date = new Date("2026-10-20T10:00:00Z").toLocaleDateString();

    expect(doc.querySelector("h2")?.textContent).toBe("Comments");
    const headings = Array.from(doc.querySelectorAll("h3")).map(
      (h) => h.textContent,
    );
    expect(headings).toEqual([
      `@alice - ${date}`,
      `@gabyhelp[bot] - ${date}`,
      `@ghost - ${date}`,
    ]);
    expect(doc.querySelectorAll("hr")).toHaveLength(2);
    expect(doc.body.textContent).toContain("First comment.");
    expect(doc.body.textContent).toContain("Bot comment.");
    expect(doc.body.textContent).not.toContain("Hidden comment.");
    expect(doc.body.textContent).not.toContain("Minimized comment.");
    expect(doc.body.textContent).not.toContain("LabeledEvent");
  });

  it("still renders comments when the issue body is empty", () => {
    const doc = render({
      bodyHTML: "",
      timeline: [comment("alice", "<p>Only comment.</p>")],
      totalCommentsCount: 1,
    });

    expect(doc.querySelector("h3")?.textContent).toContain("@alice");
    expect(doc.body.textContent).toContain("Only comment.");
  });

  it("neutralizes scripts in comment bodies", () => {
    const doc = render({
      timeline: [
        comment(
          "alice",
          '<p>Hi</p><script>alert(1)</script><img src="x" onerror="alert(2)">',
        ),
      ],
      totalCommentsCount: 1,
    });

    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("[onerror]")).toBeNull();
  });

  it("has no Comments section or footer for an issue with no comments", () => {
    const doc = render({});

    expect(doc.querySelector("h2")).toBeNull();
    expect(doc.body.textContent).not.toContain("Showing");
  });
});

describe("extractGitHubIssueContent - missing-comments footer", () => {
  function footer(
    overrides: IssueOverrides,
    url = ISSUE_URL,
  ): HTMLElement | null {
    const doc = parse(
      extractGitHubIssueContent(issuePage(overrides), url) as string,
    );
    const last = doc.body.lastElementChild as HTMLElement | null;
    return last?.textContent?.startsWith("Showing") ? last : null;
  }

  it("counts M as comments only, not timeline events", () => {
    const timeline = [
      comment("alice", "<p>a</p>"),
      { __typename: "LabeledEvent" },
      { __typename: "AssignedEvent" },
      comment("bob", "<p>b</p>"),
    ];

    expect(footer({ timeline, totalCommentsCount: 2 })).toBeNull();
    expect(footer({ timeline, totalCommentsCount: 5 })?.textContent).toBe(
      "Showing 2 of 5 comments. Open on GitHub for the rest",
    );
  });

  it("adds the hidden clause when hidden or minimized comments were skipped", () => {
    const timeline = [
      comment("alice", "<p>a</p>"),
      comment("x", "<p>h</p>", { isHidden: true }),
      comment("y", "<p>m</p>", { isMinimized: true }),
    ];
    const el = footer({ timeline, totalCommentsCount: 23 });

    expect(el?.textContent).toBe(
      "Showing 1 of 23 comments (2 hidden by GitHub). Open on GitHub for the rest",
    );
  });

  it("links to the issue without its query or fragment", () => {
    const el = footer(
      { timeline: [comment("a", "<p>a</p>")], totalCommentsCount: 3 },
      `${ISSUE_URL}?foo=bar#issuecomment-1`,
    );

    expect(el?.querySelector("a")?.getAttribute("href")).toBe(ISSUE_URL);
  });

  it("omits the footer when all comments are shown, even with hidden ones skipped", () => {
    const timeline = [
      comment("alice", "<p>a</p>"),
      comment("x", "<p>h</p>", { isHidden: true }),
    ];

    expect(footer({ timeline, totalCommentsCount: 1 })).toBeNull();
  });
});
