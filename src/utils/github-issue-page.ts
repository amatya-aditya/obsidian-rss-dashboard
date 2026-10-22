/**
 * Reads a GitHub issue page's own embedded JSON and renders it as plain
 * semantic HTML. Mozilla Readability run over GitHub's app-shaped DOM keeps
 * avatars, role badges and empty list items (#1394), so the Reader tries this
 * first for `github.com/{owner}/{repo}/issues/{n}`.
 *
 * The extractor reads only the page the fetch already returned: it makes no
 * request and sets no headers. Every failure returns `null`, and the caller
 * keeps its Readability result unchanged.
 */

import { KEEP_LEAD_ATTRIBUTE } from "./reader-html-cleanup";

const GITHUB_HOST = "github.com";
const ISSUE_PATH = /^\/[^/]+\/[^/]+\/issues\/\d+\/?$/;
const EMBEDDED_DATA_SELECTOR = 'script[data-target="react-app.embeddedData"]';

const REMOVED_BODY_TAGS = "script, style, iframe, object, embed, form, base";
const URL_ATTRIBUTES = ["href", "src", "srcset", "poster", "action"];
const UNSAFE_SCHEME = /^\s*(?:javascript|vbscript|data:text\/html)/i;

interface GitHubIssue {
  state: string;
  createdAt: string;
  author: { login: string } | null;
  labels: string[];
  bodyHTML: string;
  comments: GitHubIssueComment[];
  hiddenCommentCount: number;
  totalCommentsCount: number | null;
}

interface GitHubIssueComment {
  author: { login: string } | null;
  createdAt: string;
  bodyHTML: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** True for `https://github.com/{owner}/{repo}/issues/{n}`, whatever follows `?` or `#`. */
export function isGitHubIssueUrl(pageUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return false;
  }
  return (
    (url.protocol === "https:" || url.protocol === "http:") &&
    url.hostname.toLowerCase() === GITHUB_HOST &&
    ISSUE_PATH.test(url.pathname)
  );
}

function readEmbeddedIssue(html: string): Record<string, unknown> | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const script = doc.querySelector(EMBEDDED_DATA_SELECTOR);
  if (!script?.textContent) return null;

  let data: unknown;
  try {
    data = JSON.parse(script.textContent);
  } catch {
    return null;
  }

  let node: unknown = data;
  for (const key of [
    "payload",
    "issueViewerRoute",
    "data",
    "repository",
    "issue",
  ]) {
    if (!isRecord(node)) return null;
    node = node[key];
  }
  return isRecord(node) ? node : null;
}

function readLabelNames(issue: Record<string, unknown>): string[] {
  const labels = issue.labels;
  if (!isRecord(labels) || !Array.isArray(labels.edges)) return [];
  const names: string[] = [];
  for (const edge of labels.edges) {
    const node = isRecord(edge) ? edge.node : null;
    if (isRecord(node) && typeof node.name === "string" && node.name) {
      names.push(node.name);
    }
  }
  return names;
}

function readAuthor(value: unknown): { login: string } | null {
  return isRecord(value) && typeof value.login === "string" && value.login
    ? { login: value.login }
    : null;
}

/**
 * Reads the comments of the first timeline page only (DEC-004): non-comment
 * nodes are skipped, hidden and minimized comments are skipped but counted.
 */
function readComments(issue: Record<string, unknown>): {
  comments: GitHubIssueComment[];
  hidden: number;
} {
  const comments: GitHubIssueComment[] = [];
  let hidden = 0;
  const timeline = issue.timelineItems;
  if (!isRecord(timeline) || !Array.isArray(timeline.edges)) {
    return { comments, hidden };
  }
  for (const edge of timeline.edges) {
    const node = isRecord(edge) ? edge.node : null;
    if (!isRecord(node) || node.__typename !== "IssueComment") continue;
    if (node.isHidden === true || node.isMinimized === true) {
      hidden++;
      continue;
    }
    comments.push({
      author: readAuthor(node.author),
      createdAt: typeof node.createdAt === "string" ? node.createdAt : "",
      bodyHTML: typeof node.bodyHTML === "string" ? node.bodyHTML : "",
    });
  }
  return { comments, hidden };
}

function toGitHubIssue(raw: Record<string, unknown>): GitHubIssue | null {
  if (typeof raw.state !== "string" || typeof raw.createdAt !== "string") {
    return null;
  }
  const { comments, hidden } = readComments(raw);
  return {
    state: raw.state,
    createdAt: raw.createdAt,
    author: readAuthor(raw.author),
    labels: readLabelNames(raw),
    bodyHTML: typeof raw.bodyHTML === "string" ? raw.bodyHTML : "",
    comments,
    hiddenCommentCount: hidden,
    totalCommentsCount:
      typeof raw.totalCommentsCount === "number"
        ? raw.totalCommentsCount
        : null,
  };
}

/**
 * GitHub's rendered issue HTML is already sanitized, but the extractor's output
 * is read by the Reader and saver as markup, so live script and event handlers
 * never leave it.
 */
function neutralizeBodyHtml(bodyHtml: string): string {
  if (!bodyHtml.trim()) return "";
  const doc = new DOMParser().parseFromString(bodyHtml, "text/html");
  doc.querySelectorAll(REMOVED_BODY_TAGS).forEach((el) => el.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    for (const attribute of Array.from(el.attributes)) {
      const name = attribute.name.toLowerCase();
      const unsafeUrl =
        URL_ATTRIBUTES.includes(name) && UNSAFE_SCHEME.test(attribute.value);
      if (name.startsWith("on") || unsafeUrl)
        el.removeAttribute(attribute.name);
    }
  });
  return doc.body.innerHTML;
}

function formatIssueDate(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? createdAt : date.toLocaleDateString();
}

function renderMetaParagraph(issue: GitHubIssue): string {
  const state = issue.state.toUpperCase() === "CLOSED" ? "Closed" : "Open";
  const login = issue.author?.login ?? "ghost";
  const parts = [
    state,
    `opened by @${login} on ${formatIssueDate(issue.createdAt)}`,
  ];
  if (issue.labels.length > 0) parts.push(`Labels: ${issue.labels.join(", ")}`);
  // Short enough to look like a teaser to the Reader's lead cleanup, which
  // would drop it beside a repeated description (#1500).
  return `<p ${KEEP_LEAD_ATTRIBUTE}>${escapeHtml(parts.join(" - "))}</p>`;
}

function renderComments(comments: GitHubIssueComment[]): string {
  if (comments.length === 0) return "";
  const rendered = comments.map((comment) => {
    const login = comment.author?.login ?? "ghost";
    const heading = `@${login} - ${formatIssueDate(comment.createdAt)}`;
    return `<h3>${escapeHtml(heading)}</h3>${neutralizeBodyHtml(comment.bodyHTML)}`;
  });
  return `<h2>Comments</h2>${rendered.join("<hr>")}`;
}

/** Names the comments the first page payload did not carry; empty when none are missing. */
function renderMissingCommentsFooter(
  issue: GitHubIssue,
  pageUrl: string,
): string {
  const total = issue.totalCommentsCount;
  const shown = issue.comments.length;
  if (total === null || shown >= total) return "";

  const hidden =
    issue.hiddenCommentCount > 0
      ? ` (${issue.hiddenCommentCount} hidden by GitHub)`
      : "";
  const url = new URL(pageUrl);
  const href = `${url.origin}${url.pathname}`;
  return `<p>Showing ${shown} of ${total} comments${hidden}. <a href="${escapeHtml(href)}">Open on GitHub</a> for the rest</p>`;
}

function renderComments(comments: GitHubIssueComment[]): string {
  if (comments.length === 0) return "";
  const rendered = comments.map((comment) => {
    const login = comment.author?.login ?? "ghost";
    const heading = `@${login} - ${formatIssueDate(comment.createdAt)}`;
    return `<h3>${escapeHtml(heading)}</h3>${neutralizeBodyHtml(comment.bodyHTML)}`;
  });
  return `<h2>Comments</h2>${rendered.join("<hr>")}`;
}

/** Names the comments the first page payload did not carry; empty when none are missing. */
function renderMissingCommentsFooter(
  issue: GitHubIssue,
  pageUrl: string,
): string {
  const total = issue.totalCommentsCount;
  const shown = issue.comments.length;
  if (total === null || shown >= total) return "";

  const hidden =
    issue.hiddenCommentCount > 0
      ? ` (${issue.hiddenCommentCount} hidden by GitHub)`
      : "";
  const url = new URL(pageUrl);
  const href = `${url.origin}${url.pathname}`;
  return `<p>Showing ${shown} of ${total} comments${hidden}. <a href="${escapeHtml(href)}">Open on GitHub</a> for the rest</p>`;
}

/**
 * Returns the issue as plain HTML (a meta paragraph, the body, then the
 * comments and a missing-comments footer), or `null`
 * when `pageUrl` is not an issue page or the page's embedded data is absent,
 * invalid or shaped unexpectedly.
 */
export function extractGitHubIssueContent(
  html: string,
  pageUrl: string,
): string | null {
  if (!isGitHubIssueUrl(pageUrl)) return null;
  const raw = readEmbeddedIssue(html);
  const issue = raw ? toGitHubIssue(raw) : null;
  if (!issue) return null;

  return (
    renderMetaParagraph(issue) +
    neutralizeBodyHtml(issue.bodyHTML) +
    renderComments(issue.comments) +
    renderMissingCommentsFooter(issue, pageUrl)
  );
}
