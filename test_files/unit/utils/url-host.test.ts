import { describe, expect, it } from "vitest";
import { hostMatches } from "../../../src/utils/url-host";

describe("hostMatches", () => {
  it("matches the exact domain", () => {
    expect(hostMatches("https://example.com/a", "example.com")).toBe(true);
    expect(hostMatches("http://example.com", "example.com")).toBe(true);
  });

  it("matches a subdomain of the domain", () => {
    expect(hostMatches("https://www.example.com/a", "example.com")).toBe(true);
    expect(hostMatches("https://a.b.example.com/", "example.com")).toBe(true);
  });

  it("matches a domain that itself has subdomain labels", () => {
    expect(hostMatches("https://media.npr.org/x", "media.npr.org")).toBe(true);
    expect(hostMatches("https://cdn.media.npr.org/x", "media.npr.org")).toBe(
      true,
    );
    expect(hostMatches("https://npr.org/x", "media.npr.org")).toBe(false);
  });

  it("rejects a host that only ends with the domain text", () => {
    expect(hostMatches("https://notexample.com/", "example.com")).toBe(false);
    expect(hostMatches("https://other-example.com/", "example.com")).toBe(
      false,
    );
  });

  it("rejects a host that only starts with the domain text", () => {
    expect(hostMatches("https://example.com.other.test/", "example.com")).toBe(
      false,
    );
    expect(hostMatches("https://example.community/", "example.com")).toBe(
      false,
    );
  });

  it("rejects a domain that appears only in the path", () => {
    expect(hostMatches("https://other.test/example.com/a", "example.com")).toBe(
      false,
    );
  });

  it("rejects a domain that appears only in the query or fragment", () => {
    expect(
      hostMatches("https://other.test/?u=example.com", "example.com"),
    ).toBe(false);
    expect(hostMatches("https://other.test/#example.com", "example.com")).toBe(
      false,
    );
  });

  it("rejects a domain that appears only in the user info", () => {
    expect(hostMatches("https://example.com@other.test/", "example.com")).toBe(
      false,
    );
    expect(
      hostMatches("https://user:example.com@other.test/", "example.com"),
    ).toBe(false);
  });

  it("matches when the user info sits in front of the real host", () => {
    expect(hostMatches("https://user@example.com/", "example.com")).toBe(true);
  });

  it("returns false when the input does not parse as a URL", () => {
    expect(hostMatches("", "example.com")).toBe(false);
    expect(hostMatches("not a url", "example.com")).toBe(false);
    expect(hostMatches("example.com/path", "example.com")).toBe(false);
    expect(hostMatches("//example.com/path", "example.com")).toBe(false);
  });

  it("ignores letter case in the host and the domain", () => {
    expect(hostMatches("https://EXAMPLE.COM/a", "example.com")).toBe(true);
    expect(hostMatches("https://Www.Example.Com/a", "example.com")).toBe(true);
    expect(hostMatches("https://example.com/a", "EXAMPLE.com")).toBe(true);
  });

  it("matches a host written with a trailing dot", () => {
    expect(hostMatches("https://example.com./a", "example.com")).toBe(true);
    expect(hostMatches("https://www.example.com./a", "example.com")).toBe(true);
  });

  it("ignores the port", () => {
    expect(hostMatches("https://example.com:8443/a", "example.com")).toBe(true);
    expect(
      hostMatches("https://other.test:8443/example.com", "example.com"),
    ).toBe(false);
  });
});
