// The user-facing result of a manual cover-image fetch (#1314): a stored image
// is its own feedback, so only a failure produces copy.
import { describe, expect, it } from "vitest";
import { coverImageFailureNotice } from "../../../src/services/cover-image-notice";

describe("coverImageFailureNotice", () => {
  it("says nothing when an image was stored", () => {
    expect(
      coverImageFailureNotice({
        status: "found",
        url: "https://cdn.example.com/hero.jpg",
      }),
    ).toBeNull();
  });

  it("says nothing when no request was made", () => {
    expect(coverImageFailureNotice({ status: "skipped", url: "" })).toBeNull();
  });

  it("names a page that carries no cover image", () => {
    expect(coverImageFailureNotice({ status: "none", url: "" })).toBe(
      "No cover image found on that page.",
    );
  });

  it("names a restricted page", () => {
    expect(coverImageFailureNotice({ status: "restricted", url: "" })).toBe(
      "That page is restricted, so no cover image was read.",
    );
  });

  it("tells a timeout apart from an unreachable page", () => {
    expect(
      coverImageFailureNotice({
        status: "failed",
        url: "",
        reason: "timeout",
      }),
    ).toBe("The article page timed out, so no cover image was read.");
    expect(
      coverImageFailureNotice({
        status: "failed",
        url: "",
        reason: "network",
      }),
    ).toBe("Could not reach the article page, so no cover image was read.");
  });

  it("names a page that refused the request", () => {
    expect(
      coverImageFailureNotice({ status: "failed", url: "", reason: "blocked" }),
    ).toBe("The site refused the request, so no cover image was read.");
  });
});
