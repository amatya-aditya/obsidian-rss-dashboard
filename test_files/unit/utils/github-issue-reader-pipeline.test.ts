import { describe, expect, it } from "vitest";
import { extractGitHubIssueContent } from "../../../src/utils/github-issue-page";
import { cleanFetchedArticleDocument } from "../../../src/utils/reader-html-cleanup";
import { sanitizeAndAppendHtml } from "../../../src/utils/safe-html";

const ISSUE_URL = "https://github.com/golang/go/issues/82345";
const FIRST_PARAGRAPH = "crypto/tls: handshake panics on a truncated record";
const LONG_PARAGRAPH =
  "The panic reproduces on every platform when the server sends a record " +
  "shorter than its declared length, and it is reachable from an untrusted peer.";

// The body carries the GitHub custom elements and the markup UNK-002 asks about,
// plus a hostile script and event handler.
const BODY_HTML = [
  `<p dir="auto">${FIRST_PARAGRAPH}</p>`,
  `<p dir="auto">${LONG_PARAGRAPH} <g-emoji class="g-emoji" alias="warning">⚠️</g-emoji> ` +
    `<relative-time datetime="2026-10-19T21:38:02Z">Oct 19, 2026</relative-time></p>`,
  `<markdown-accessiblity-table><table><thead><tr><th>Go</th><th>Result</th></tr></thead>` +
    `<tbody><tr><td>1.25</td><td>panic</td></tr></tbody></table></markdown-accessiblity-table>`,
  `<details><summary>Stack trace</summary><pre>goroutine 1 [running]</pre></details>`,
  `<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled> reproduce</li></ul>`,
  `<script>window.pwned = 1</script>`,
  `<img src="https://github.com/x.png" onerror="window.pwned = 2">`,
].join("");

function issuePage(): string {
  const issue = {
    state: "OPEN",
    createdAt: "2026-10-19T21:38:02Z",
    author: { login: "thatnealpatel" },
    labels: { edges: [{ node: { name: "Security" } }] },
    bodyHTML: BODY_HTML,
    totalCommentsCount: 1,
    timelineItems: {
      edges: [
        {
          node: {
            __typename: "IssueComment",
            createdAt: "2026-10-20T10:00:00Z",
            isHidden: false,
            isMinimized: false,
            author: { login: "rsc" },
            bodyHTML: `<p>Thanks, I can reproduce this on tip.</p>`,
          },
        },
      ],
    },
  };
  const data = {
    payload: { issueViewerRoute: { data: { repository: { issue } } } },
  };
  return `<html><body><script type="application/json" data-target="react-app.embeddedData">${JSON.stringify(data).replace(/</g, "\\u003c")}</script></body></html>`;
}

function extracted(): string {
  const html = extractGitHubIssueContent(issuePage(), ISSUE_URL);
  if (html === null) throw new Error("expected the fixture to extract");
  return html;
}

function clean(html: string, feedDescriptionHtml?: string): Document {
  const doc = new DOMParser().parseFromString(html, "text/html");
  cleanFetchedArticleDocument(doc, { feedDescriptionHtml });
  return doc;
}

describe("GitHub issue content through the Reader cleanup (#1500)", () => {
  it("keeps the meta line, body, Comments heading and comment headings when no description repeats", () => {
    const text = clean(extracted()).body.textContent ?? "";

    expect(text).toContain("opened by @thatnealpatel");
    expect(text).toContain(FIRST_PARAGRAPH);
    expect(text).toContain(LONG_PARAGRAPH);
    expect(text).toContain("Comments");
    expect(text).toContain("@rsc - ");
    expect(text).toContain("Thanks, I can reproduce this on tip.");
  });

  it("removes the repeated description once and keeps the meta line and everything else", () => {
    const doc = clean(extracted(), `<p>${FIRST_PARAGRAPH}</p>`);
    const text = doc.body.textContent ?? "";

    expect(text.split(FIRST_PARAGRAPH)).toHaveLength(1);
    expect(text).toContain("opened by @thatnealpatel");
    expect(text).toContain(LONG_PARAGRAPH);
    expect(doc.querySelector("h2")?.textContent).toBe("Comments");
    expect(doc.querySelector("h3")?.textContent).toContain("@rsc - ");
    expect(doc.querySelector("details")).not.toBeNull();
    expect(doc.querySelector("table")).not.toBeNull();
  });
});

describe("GitHub issue content in the rendered Reader DOM (#1500)", () => {
  function render(): HTMLElement {
    const container = createDiv();
    document.body.appendChild(container);
    const doc = clean(extracted());
    // The Reader renders fetched content in rich mode (article-renderer).
    sanitizeAndAppendHtml(container, doc.body.innerHTML, { mode: "rich" });
    return container;
  }

  it("does not carry a script or an event handler from a hostile bodyHTML", () => {
    const container = render();

    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.innerHTML).not.toContain("pwned");
    container.remove();
  });

  it("keeps the details, table and task-list text readable", () => {
    const container = render();
    const text = container.textContent ?? "";

    expect(container.querySelector("details summary")?.textContent).toBe(
      "Stack trace",
    );
    expect(text).toContain("goroutine 1 [running]");
    expect(container.querySelectorAll("tbody td")).toHaveLength(2);
    expect(text).toContain("reproduce");
    expect(text).toContain("Oct 19, 2026");
    expect(text).toContain("⚠️");
    container.remove();
  });
});
