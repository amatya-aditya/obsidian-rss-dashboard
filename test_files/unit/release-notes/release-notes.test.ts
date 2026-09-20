import { describe, expect, it } from "vitest";
import {
  getReleaseNote,
  getReleaseNoteForVersion,
  releaseLineOf,
} from "../../../src/release-notes";

describe("releaseLineOf", () => {
  it("reads the major.minor line from a full version", () => {
    expect(releaseLineOf("2.7.0")).toBe("2.7");
  });

  it("counts a prerelease as its release line", () => {
    expect(releaseLineOf("2.7.0-beta.1")).toBe("2.7");
  });

  it("returns null for a value that is not a version", () => {
    expect(releaseLineOf("not-a-version")).toBeNull();
    expect(releaseLineOf("")).toBeNull();
  });
});

describe("getReleaseNoteForVersion", () => {
  it("resolves a patch release to its release line's note", () => {
    const note = getReleaseNoteForVersion("2.7.1");

    expect(note).toBe(getReleaseNote("2.7"));
    expect(note?.trim().length).toBeGreaterThan(0);
  });

  it("returns null when the release line has no note", () => {
    expect(getReleaseNoteForVersion("2.8.0")).toBeNull();
  });
});
