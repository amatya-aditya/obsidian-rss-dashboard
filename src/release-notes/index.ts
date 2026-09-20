import noteFor27 from "./notes/2.7.md";

export interface ReleaseNoteCatalog {
  releaseLine: Readonly<Record<string, string>>;
  exactVersion: Readonly<Record<string, string>>;
}

/**
 * Curated What's New notes. Notes are explicitly imported so esbuild embeds
 * them into the bundle; only images stay remote. Add each note to the matching
 * catalog when adding a release-line or exact patch note.
 */
const RELEASE_LINE_NOTES: Readonly<Record<string, string>> = {
  "2.7": noteFor27,
};

const EXACT_VERSION_NOTES: Readonly<Record<string, string>> = {};

const RELEASE_NOTE_CATALOG: ReleaseNoteCatalog = {
  releaseLine: RELEASE_LINE_NOTES,
  exactVersion: EXACT_VERSION_NOTES,
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

function nonEmptyNote(note: string | undefined): string | null {
  // An empty note would render an empty popup, so treat it as no note.
  return note && note.trim().length > 0 ? note : null;
}

export function getReleaseNote(
  releaseLine: string,
  releaseLineNotes: Readonly<Record<string, string>> = RELEASE_LINE_NOTES,
): string | null {
  return nonEmptyNote(releaseLineNotes[releaseLine]);
}

export function getReleaseNoteForVersion(
  version: string,
  catalog: ReleaseNoteCatalog = RELEASE_NOTE_CATALOG,
): string | null {
  const normalizedVersion = version.trim();
  const exactNote = nonEmptyNote(catalog.exactVersion[normalizedVersion]);
  if (exactNote) {
    return exactNote;
  }

  const releaseLine = releaseLineOf(version);
  return releaseLine ? getReleaseNote(releaseLine, catalog.releaseLine) : null;
}

export function hasExactReleaseNoteForVersion(
  version: string,
  catalog: ReleaseNoteCatalog = RELEASE_NOTE_CATALOG,
): boolean {
  return nonEmptyNote(catalog.exactVersion[version.trim()]) !== null;
}
