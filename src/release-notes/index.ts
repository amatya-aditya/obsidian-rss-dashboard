import noteFor27 from "./notes/2.7.md";

/**
 * Curated What's New notes, keyed by release line (`major.minor`). The
 * markdown is embedded into the bundle at build time, so the popup renders
 * offline; only images stay remote. Add a note here when a release line ships
 * — the pre-release check requires one for every major/minor release.
 */
const RELEASE_NOTES: Readonly<Record<string, string>> = {
  "2.7": noteFor27,
};

const RELEASE_LINE_PATTERN = /^(\d+)\.(\d+)(?:\.|$)/;

/**
 * The `major.minor` release line a version belongs to, or null when the
 * string is not a version we can read. Prerelease suffixes (for example
 * `2.7.0-beta.1`) count as their release line.
 */
export function releaseLineOf(version: string): string | null {
  const match = RELEASE_LINE_PATTERN.exec(version.trim());
  return match ? `${match[1]}.${match[2]}` : null;
}

export function getReleaseNote(releaseLine: string): string | null {
  const note = RELEASE_NOTES[releaseLine];
  // An empty note would render an empty popup, so treat it as no note.
  return note && note.trim().length > 0 ? note : null;
}

export function getReleaseNoteForVersion(version: string): string | null {
  const releaseLine = releaseLineOf(version);
  return releaseLine ? getReleaseNote(releaseLine) : null;
}
