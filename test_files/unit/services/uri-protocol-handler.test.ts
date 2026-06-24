import { describe, it, expect, beforeEach } from "vitest";
import { UriProtocolHandler } from "../../../src/services/uri-protocol-handler";
import { ObsidianProtocolData } from "obsidian";
import { decodeUriFeedUrl, buildUriAddFeedTitle } from "../../../src/utils/uri-utils";

describe("UriProtocolHandler", () => {
  let handler: UriProtocolHandler;

  beforeEach(() => {
    handler = new UriProtocolHandler("obsidian-rss-dashboard");
  });

  describe("resolveRequestedUriAction", () => {
    it("resolves action from uriAction param", () => {
      const params: ObsidianProtocolData = {
        action: "some-other-action",
        uriAction: "add-feed"
      };
      expect(handler.resolveRequestedUriAction(params)).toBe("add-feed");
    });

    it("infers add-feed when action matches plugin id and url is present", () => {
      const params: ObsidianProtocolData = {
        action: "obsidian-rss-dashboard",
        url: "https://example.com/feed.xml"
      };
      expect(handler.resolveRequestedUriAction(params)).toBe("add-feed");
    });

    it("returns empty string if action matches plugin id but no url", () => {
      const params: ObsidianProtocolData = {
        action: "obsidian-rss-dashboard",
      };
      expect(handler.resolveRequestedUriAction(params)).toBe("");
    });
  });

  describe("decodeUriFeedUrl", () => {
    it("decodes a URL-encoded string", () => {
      expect(decodeUriFeedUrl("https%3A%2F%2Fexample.com%2Ffeed")).toBe("https://example.com/feed");
    });

    it("returns as-is if no encoding is present", () => {
      expect(decodeUriFeedUrl("https://example.com/feed")).toBe("https://example.com/feed");
    });

    it("throws an error if URL is malformed", () => {
      expect(() => decodeUriFeedUrl("%")).toThrow("Feed URL is malformed");
    });
    
    it("throws an error if URL is missing", () => {
      expect(() => decodeUriFeedUrl("   ")).toThrow("Missing required URL parameter");
    });
  });

  describe("buildUriAddFeedTitle", () => {
    it("extracts hostname from URL", () => {
      expect(buildUriAddFeedTitle("https://example.com/feed.xml")).toBe("example.com");
    });

    it("strips www. from hostname", () => {
      expect(buildUriAddFeedTitle("https://www.example.com/feed.xml")).toBe("example.com");
    });

    it("falls back to feedUrl if parsing fails", () => {
      expect(buildUriAddFeedTitle("not-a-valid-url")).toBe("not-a-valid-url");
    });
  });
});
