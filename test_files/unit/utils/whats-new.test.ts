import { describe, expect, it } from "vitest";
import { decideWhatsNew } from "../../../src/utils/whats-new";

interface Case {
  name: string;
  currentVersion: string;
  lastShownVersion: string | undefined;
  hasNote: boolean;
  shouldShow: boolean;
  nextLastShownVersion: string | undefined;
}

const CASES: Case[] = [
  {
    name: "shows for an existing user who has never been shown a note",
    currentVersion: "2.7.0",
    lastShownVersion: undefined,
    hasNote: true,
    shouldShow: true,
    nextLastShownVersion: "2.7.0",
  },
  {
    name: "shows when the release line advanced",
    currentVersion: "2.7.0",
    lastShownVersion: "2.6.5",
    hasNote: true,
    shouldShow: true,
    nextLastShownVersion: "2.7.0",
  },
  {
    name: "does not show, or write, for a patch-only change",
    currentVersion: "2.7.1",
    lastShownVersion: "2.7.0",
    hasNote: true,
    shouldShow: false,
    nextLastShownVersion: "2.7.0",
  },
  {
    name: "shows the skipped release line's note when a user jumps straight to a patch",
    currentVersion: "2.7.1",
    lastShownVersion: "2.6.0",
    hasNote: true,
    shouldShow: true,
    nextLastShownVersion: "2.7.1",
  },
  {
    name: "shows for the next minor release",
    currentVersion: "2.8.0",
    lastShownVersion: "2.7.1",
    hasNote: true,
    shouldShow: true,
    nextLastShownVersion: "2.8.0",
  },
  {
    name: "does not show, or write, on a downgrade to an older release line",
    currentVersion: "2.7.5",
    lastShownVersion: "2.8.0",
    hasNote: true,
    shouldShow: false,
    nextLastShownVersion: "2.8.0",
  },
  {
    name: "does not show, or write, on a downgrade within the same release line",
    currentVersion: "2.7.1",
    lastShownVersion: "2.7.5",
    hasNote: true,
    shouldShow: false,
    nextLastShownVersion: "2.7.5",
  },
  {
    name: "treats a malformed last-shown value as never shown",
    currentVersion: "2.7.0",
    lastShownVersion: "banana",
    hasNote: true,
    shouldShow: true,
    nextLastShownVersion: "2.7.0",
  },
  {
    name: "does not show for a release line with no note, but advances the recorded version",
    currentVersion: "2.7.0",
    lastShownVersion: "2.6.0",
    hasNote: false,
    shouldShow: false,
    nextLastShownVersion: "2.7.0",
  },
  {
    name: "does not show a note-less release to a user who has never seen one",
    currentVersion: "2.8.0",
    lastShownVersion: undefined,
    hasNote: false,
    shouldShow: false,
    nextLastShownVersion: "2.8.0",
  },
  {
    name: "shows for a prerelease of an advanced release line",
    currentVersion: "2.7.0-beta.1",
    lastShownVersion: "2.6.0",
    hasNote: true,
    shouldShow: true,
    nextLastShownVersion: "2.7.0-beta.1",
  },
  {
    name: "does nothing when the running version is unreadable",
    currentVersion: "not-a-version",
    lastShownVersion: "2.6.0",
    hasNote: true,
    shouldShow: false,
    nextLastShownVersion: "2.6.0",
  },
];

describe("decideWhatsNew", () => {
  it.each(CASES)("$name", (testCase) => {
    expect(
      decideWhatsNew({
        currentVersion: testCase.currentVersion,
        lastShownVersion: testCase.lastShownVersion,
        hasNote: testCase.hasNote,
      }),
    ).toEqual({
      shouldShow: testCase.shouldShow,
      nextLastShownVersion: testCase.nextLastShownVersion,
    });
  });
});
