const VERSION_HEADING = /^## (\S+)(?: - .+)?$/;
const FEATURES_HEADING = /^### Features$/;
const ANY_SUBSECTION_HEADING = /^### /;
const BULLET_LINE = /^- (.+)$/;
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g;

/**
 * Whether CHANGELOG.md has a `## <version>` heading at all, independent of
 * whether that section has any Features. Lets a caller tell "no heading —
 * probably still says Unreleased" apart from "heading found, no Features".
 */
export function hasVersionHeading(changelog, version) {
  return changelog
    .split("\n")
    .some((line) => line.match(VERSION_HEADING)?.[1] === version);
}

/**
 * Extracts the "### Features" bullets for one version's section of
 * CHANGELOG.md, matched by exact version heading. Returns null if the
 * version has no heading, or its Features section is missing or empty.
 */
export function extractFeaturesForVersion(changelog, version) {
  const lines = changelog.split("\n");

  let versionSectionStart = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(VERSION_HEADING);
    if (match && match[1] === version) {
      versionSectionStart = i + 1;
      break;
    }
  }
  if (versionSectionStart === -1) {
    return null;
  }

  let versionSectionEnd = lines.length;
  for (let i = versionSectionStart; i < lines.length; i += 1) {
    if (VERSION_HEADING.test(lines[i])) {
      versionSectionEnd = i;
      break;
    }
  }

  let featuresStart = -1;
  for (let i = versionSectionStart; i < versionSectionEnd; i += 1) {
    if (FEATURES_HEADING.test(lines[i])) {
      featuresStart = i + 1;
      break;
    }
  }
  if (featuresStart === -1) {
    return null;
  }

  let featuresEnd = versionSectionEnd;
  for (let i = featuresStart; i < versionSectionEnd; i += 1) {
    if (ANY_SUBSECTION_HEADING.test(lines[i])) {
      featuresEnd = i;
      break;
    }
  }

  const bullets = [];
  for (let i = featuresStart; i < featuresEnd; i += 1) {
    const bulletMatch = lines[i].match(BULLET_LINE);
    if (bulletMatch) {
      bullets.push(bulletMatch[1].replace(MARKDOWN_LINK, "$1"));
    }
  }

  return bullets.length > 0 ? bullets : null;
}
