import { releaseLineOf } from "../release-notes";
import { compareVersions } from "./storage-deprecation-prompt";

export interface WhatsNewDecisionInput {
  currentVersion: string;
  lastShownVersion: string | undefined;
  hasNote: boolean;
}

export interface WhatsNewDecision {
  shouldShow: boolean;
  /**
   * The value `lastShownVersion` should become. It stays unchanged when only
   * the patch changed or when the running version is older, so nothing is
   * written for those cases.
   */
  nextLastShownVersion: string | undefined;
}

/**
 * Whether the What's New popup should open for this session, and what
 * `lastShownVersion` should become afterward. Keyed on the release line
 * (`major.minor`): a patch release never shows the popup and never writes,
 * while a release line with no note still advances the recorded version so
 * it is not re-evaluated every session.
 *
 * Fresh installs and settings loads that came back null or failed are handled
 * one layer up in `main.ts`, which skips this entirely — so this function has
 * no "first run" case to encode.
 */
export function decideWhatsNew({
  currentVersion,
  lastShownVersion,
  hasNote,
}: WhatsNewDecisionInput): WhatsNewDecision {
  const currentLine = releaseLineOf(currentVersion);
  const lastLine = lastShownVersion ? releaseLineOf(lastShownVersion) : null;

  if (currentLine === null) {
    return { shouldShow: false, nextLastShownVersion: lastShownVersion };
  }

  // A missing or malformed last-shown value counts as never shown: an
  // existing user updating into a release line with a note should see it.
  if (!lastShownVersion || lastLine === null) {
    return { shouldShow: hasNote, nextLastShownVersion: currentVersion };
  }

  if (compareVersions(currentLine, lastLine) <= 0) {
    return { shouldShow: false, nextLastShownVersion: lastShownVersion };
  }

  return {
    shouldShow: hasNote && compareVersions(currentVersion, lastShownVersion) >= 0,
    nextLastShownVersion: currentVersion,
  };
}
