import { releaseLineOf } from "../release-notes";
import { compareVersions } from "./storage-deprecation-prompt";

export interface WhatsNewDecisionInput {
  currentVersion: string;
  lastShownVersion: string | undefined;
  hasNote: boolean;
  hasExactPatchNote: boolean;
}

export interface WhatsNewDecision {
  shouldShow: boolean;
  /**
   * The value `lastShownVersion` should become. An unnoted patch stays
   * unchanged so a later explicitly noted patch can still be shown.
   */
  nextLastShownVersion: string | undefined;
}

/**
 * Whether the What's New popup should open for this session, and what
 * `lastShownVersion` should become afterward. Major/minor releases use their
 * release-line note. A patch release shows only an explicitly authored exact
 * patch note, except that a user who skipped a release line still receives
 * that line's note when updating directly to a patch.
 *
 * Fresh installs and settings loads that came back null or failed are handled
 * one layer up in `main.ts`, which skips this entirely — so this function has
 * no "first run" case to encode.
 */
export function decideWhatsNew({
  currentVersion,
  lastShownVersion,
  hasNote,
  hasExactPatchNote,
}: WhatsNewDecisionInput): WhatsNewDecision {
  const currentLine = releaseLineOf(currentVersion);
  const lastLine = lastShownVersion ? releaseLineOf(lastShownVersion) : null;
  const patchMatch = /^(\d+)\.(\d+)\.(\d+)(?:-|$)/.exec(currentVersion);
  const currentIsPatch = patchMatch !== null && Number(patchMatch[3]) > 0;

  if (currentLine === null) {
    return { shouldShow: false, nextLastShownVersion: lastShownVersion };
  }

  // A missing or malformed last-shown value counts as never shown: an
  // existing user updating into a release line with a note should see it.
  if (!lastShownVersion || lastLine === null) {
    return {
      shouldShow: hasNote,
      nextLastShownVersion:
        hasNote || !currentIsPatch ? currentVersion : lastShownVersion,
    };
  }

  const lineComparison = compareVersions(currentLine, lastLine);
  if (lineComparison < 0) {
    return { shouldShow: false, nextLastShownVersion: lastShownVersion };
  }

  if (lineComparison === 0) {
    const exactPatchIsNewer =
      currentIsPatch &&
      hasExactPatchNote &&
      compareVersions(currentVersion, lastShownVersion) > 0;

    return {
      shouldShow: exactPatchIsNewer,
      nextLastShownVersion: exactPatchIsNewer
        ? currentVersion
        : lastShownVersion,
    };
  }

  return {
    shouldShow: hasNote,
    nextLastShownVersion:
      hasNote || !currentIsPatch ? currentVersion : lastShownVersion,
  };
}
