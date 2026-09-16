import { describe, expect, it } from "vitest";
import {
  extractFeaturesForVersion,
  hasVersionHeading,
} from "../../../scripts/lib/changelog-features.mjs";

const CHANGELOG = `# Changelog

## Unreleased

### Features

- Should never be picked up when asking for a released version.

## 2.7.0 - September 1, 2026

### Features

- Add a What's New popup shown after updates ([GH Issue #288](https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/288)).
- Add a "What's new" link to the About settings tab.

### Fixes

- Fix a crash in the reader view.

### Development and compliance

- Refactor the storage service.

## 2.6.0 - August 24, 2026

### Features

- An older feature that must not leak into the 2.7.0 result.

## 2.7.10 - October 1, 2026

### Features

- A higher patch version that must not match a lookup for 2.7.0.

## 2.5.0 - July 11, 2026

### Fixes

- A patch release with no Features section at all.
`;

describe("extractFeaturesForVersion", () => {
  it("extracts only the Features bullets for the exact version heading", () => {
    const result = extractFeaturesForVersion(CHANGELOG, "2.7.0");

    expect(result).toEqual([
      'Add a What\'s New popup shown after updates (GH Issue #288).',
      'Add a "What\'s new" link to the About settings tab.',
    ]);
  });

  it("strips markdown links down to their text", () => {
    const result = extractFeaturesForVersion(CHANGELOG, "2.7.0");

    expect(result?.[0]).not.toContain("[");
    expect(result?.[0]).not.toContain("(https://");
    expect(result?.[0]).toContain("GH Issue #288");
  });

  it("does not include bullets from Fixes or Development and compliance", () => {
    const result = extractFeaturesForVersion(CHANGELOG, "2.7.0");

    expect(result?.join(" ")).not.toContain("crash in the reader view");
    expect(result?.join(" ")).not.toContain("Refactor the storage service");
  });

  it("stops at the next version heading and never bleeds across releases", () => {
    const result = extractFeaturesForVersion(CHANGELOG, "2.7.0");

    expect(result?.join(" ")).not.toContain("older feature");
  });

  it("matches the version exactly, not as a prefix", () => {
    const result = extractFeaturesForVersion(CHANGELOG, "2.7.0");

    expect(result?.join(" ")).not.toContain("higher patch version");
  });

  it("returns null when no heading matches the requested version", () => {
    expect(extractFeaturesForVersion(CHANGELOG, "9.9.9")).toBeNull();
  });

  it("returns null when the matched version has no Features section", () => {
    expect(extractFeaturesForVersion(CHANGELOG, "2.5.0")).toBeNull();
  });
});

describe("hasVersionHeading", () => {
  it("is true for a version with a heading, even with no Features", () => {
    expect(hasVersionHeading(CHANGELOG, "2.5.0")).toBe(true);
  });

  it("is false when no heading matches the version at all", () => {
    expect(hasVersionHeading(CHANGELOG, "9.9.9")).toBe(false);
  });
});
