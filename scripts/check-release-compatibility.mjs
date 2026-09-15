import { readFileSync } from "node:fs";

export const MINIMUM_SUPPORTED_APP_VERSION = "1.8.7";

function compareVersions(left, right) {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function comparePluginVersions(left, right) {
  const [leftVersion, leftPrerelease] = left.split("-", 2);
  const [rightVersion, rightPrerelease] = right.split("-", 2);
  const versionDifference = compareVersions(leftVersion, rightVersion);

  if (versionDifference !== 0) {
    return versionDifference;
  }
  if (leftPrerelease === undefined) {
    return rightPrerelease === undefined ? 0 : 1;
  }
  if (rightPrerelease === undefined) {
    return -1;
  }
  return leftPrerelease.localeCompare(rightPrerelease, undefined, { numeric: true });
}

export function findReleaseCompatibilityViolations(manifest, versions) {
  const violations = [];

  if (compareVersions(manifest.minAppVersion, MINIMUM_SUPPORTED_APP_VERSION) < 0) {
    violations.push({
      rule: "manifest-support-floor",
      version: manifest.version,
      message: `manifest.json must require Obsidian ${MINIMUM_SUPPORTED_APP_VERSION} or later.`,
    });
  }

  for (const [version, minAppVersion] of Object.entries(versions)) {
    if (compareVersions(minAppVersion, MINIMUM_SUPPORTED_APP_VERSION) < 0) {
      violations.push({
        rule: "minimum-support-floor",
        version,
        message: `versions.json entry ${version} must require Obsidian ${MINIMUM_SUPPORTED_APP_VERSION} or later.`,
      });
    }
  }

  if (versions[manifest.version] !== manifest.minAppVersion) {
    violations.push({
      rule: "current-release-mapping",
      version: manifest.version,
      message: "The current manifest version must have a matching versions.json entry.",
    });
  }

  const latestVersion = Object.keys(versions).toSorted(comparePluginVersions).at(-1);
  if (latestVersion !== manifest.version) {
    violations.push({
      rule: "current-release-version",
      version: manifest.version,
      message: `manifest.json version must match the latest versions.json entry (${latestVersion ?? "none"}).`,
    });
  }

  return violations;
}

function readJson(fileName) {
  return JSON.parse(readFileSync(fileName, "utf8"));
}

if (process.argv[1]?.endsWith("check-release-compatibility.mjs")) {
  const violations = findReleaseCompatibilityViolations(
    readJson("manifest.json"),
    readJson("versions.json"),
  );

  if (violations.length > 0) {
    for (const violation of violations) {
      console.error(`${violation.rule}: ${violation.message}`);
    }
    process.exitCode = 1;
  } else {
    console.log("Release compatibility metadata check passed.");
  }
}
