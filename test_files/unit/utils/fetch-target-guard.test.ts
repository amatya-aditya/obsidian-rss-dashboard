// A linked PDF or other non-page file must not reach DOMParser and Readability:
// parsing the decoded file froze Obsidian (#1766).
import { describe, expect, it } from "vitest";
import {
  isNonPageContentType,
  isNonPageUrl,
} from "../../../src/utils/fetch-target-guard";

describe("isNonPageUrl (#1766)", () => {
  it.each([
    "https://example.com/papers/how-to-lie-with-statistics.pdf",
    "https://example.com/files/archive.ZIP",
    "https://example.com/pic.jpeg?w=1200",
    "https://example.com/talk.mp4#t=30",
    "https://example.com/slides.pptx",
  ])("skips a link whose path ends in a file extension: %s", (url) => {
    expect(isNonPageUrl(url)).toBe(true);
  });

  it.each([
    "https://example.com/posts/one",
    "https://example.com/posts/one.html",
    "https://example.com/blog/v1.2/release-notes",
    "https://arxiv.org/pdf/1234.5678",
    "https://example.com/?file=report.pdf",
    "not a url",
  ])("leaves a page-like link to the response check: %s", (url) => {
    expect(isNonPageUrl(url)).toBe(false);
  });
});

describe("isNonPageContentType (#1766)", () => {
  it.each([
    "application/pdf",
    "application/octet-stream",
    "application/zip",
    "image/png",
    "video/mp4",
    "text/plain; charset=utf-8",
    "application/json",
    "application/xml",
  ])("rejects a declared type that is not a web page: %s", (type) => {
    expect(isNonPageContentType(type)).toBe(true);
  });

  it.each([
    "text/html",
    "text/html; charset=ISO-8859-1",
    "TEXT/HTML",
    "application/xhtml+xml; charset=utf-8",
  ])("allows an HTML or XHTML page: %s", (type) => {
    expect(isNonPageContentType(type)).toBe(false);
  });

  it("allows a response that declares no type", () => {
    expect(isNonPageContentType(undefined)).toBe(false);
    expect(isNonPageContentType("")).toBe(false);
  });
});
