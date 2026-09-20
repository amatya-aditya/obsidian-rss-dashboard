import { describe, expect, it } from "vitest";
import {
  findMissingNoteIssue,
  findReleaseNoteFilenameIssues,
  findNoteIssues,
  findPlanStatusIssues,
  findStrayFiles,
  isLifecyclePlanFilename,
  isMajorMinorRelease,
  releaseLineOf,
} from "../../scripts/check-pre-release.mjs";

describe("findStrayFiles", () => {
  it("flags backup, editor-swap, and OS cruft files", () => {
    const files = [
      "scripts/check-commit-message.mjs.bak",
      "src/utils/date.ts.orig",
      "src/utils/.date.ts.swp",
      "notes.md~",
      ".DS_Store",
      "Thumbs.db",
    ];

    expect(findStrayFiles(files)).toEqual(files);
  });

  it("does not flag ordinary tracked files", () => {
    const files = ["src/utils/date.ts", "docs/plans/262-pre-release-checklist.md"];

    expect(findStrayFiles(files)).toEqual([]);
  });
});

describe("isLifecyclePlanFilename", () => {
  it("matches issue-numbered plan filenames", () => {
    expect(isLifecyclePlanFilename("262-pre-release-checklist.md")).toBe(true);
  });

  it("matches dated draft plan filenames", () => {
    expect(isLifecyclePlanFilename("draft-20260914-some-idea.md")).toBe(true);
  });

  it("does not match non-lifecycle documents like roadmaps", () => {
    expect(isLifecyclePlanFilename("public-roadmap.md")).toBe(false);
    expect(isLifecyclePlanFilename("release-vnext-roadmap.md")).toBe(false);
  });
});

describe("findPlanStatusIssues", () => {
  it("flags a lifecycle plan with no frontmatter status", () => {
    const planFiles = [
      {
        fileName: "300-missing-status.md",
        filePath: "docs/plans/300-missing-status.md",
        source: "# No frontmatter here\n",
      },
    ];

    expect(findPlanStatusIssues(planFiles)).toEqual([
      expect.objectContaining({
        filePath: "docs/plans/300-missing-status.md",
        reason: expect.stringContaining("missing"),
      }),
    ]);
  });

  it("flags a status that belongs in the archive instead of docs/plans", () => {
    const planFiles = [
      {
        fileName: "301-should-be-archived.md",
        filePath: "docs/plans/301-should-be-archived.md",
        source: "---\nstatus: implemented\n---\n",
      },
    ];

    expect(findPlanStatusIssues(planFiles)).toEqual([
      expect.objectContaining({
        filePath: "docs/plans/301-should-be-archived.md",
        reason: expect.stringContaining("implemented"),
      }),
    ]);
  });

  it("accepts every valid active-plan status", () => {
    const planFiles = ["idea", "proposed", "accepted", "blocked", "in-progress"].map(
      (status, index) => ({
        fileName: `${400 + index}-ok.md`,
        filePath: `docs/plans/${400 + index}-ok.md`,
        source: `---\nstatus: ${status}\n---\n`,
      }),
    );

    expect(findPlanStatusIssues(planFiles)).toEqual([]);
  });

  it("skips non-lifecycle documents such as the public roadmap", () => {
    const planFiles = [
      {
        fileName: "public-roadmap.md",
        filePath: "docs/plans/public-roadmap.md",
        source: "# Public Roadmap\n\nNo frontmatter, and that's fine.\n",
      },
    ];

    expect(findPlanStatusIssues(planFiles)).toEqual([]);
  });
});

describe("releaseLineOf", () => {
  it("reads the major.minor line from a full version", () => {
    expect(releaseLineOf("2.7.0")).toBe("2.7");
  });

  it("returns null for a value that is not a version", () => {
    expect(releaseLineOf("banana")).toBeNull();
  });
});

describe("isMajorMinorRelease", () => {
  it("is true when the patch part is zero", () => {
    expect(isMajorMinorRelease("2.7.0")).toBe(true);
    expect(isMajorMinorRelease("2.7.0-beta.1")).toBe(true);
  });

  it("is false for a patch release", () => {
    expect(isMajorMinorRelease("2.7.1")).toBe(false);
  });
});

describe("findNoteIssues", () => {
  it("accepts a note with a heading and an HTTPS image with alt text", () => {
    const noteFiles = [
      {
        fileName: "2.7.md",
        filePath: "src/release-notes/notes/2.7.md",
        source:
          "# RSS Dashboard 2.7.0\n\n![A screenshot](https://example.com/shot.png)\n",
      },
    ];

    expect(findNoteIssues(noteFiles)).toEqual([]);
  });

  it("flags a note with no top-level heading", () => {
    const noteFiles = [
      {
        fileName: "2.7.md",
        filePath: "src/release-notes/notes/2.7.md",
        source: "Just some prose.\n",
      },
    ];

    expect(findNoteIssues(noteFiles)).toEqual([
      expect.objectContaining({ reason: expect.stringContaining("heading") }),
    ]);
  });

  it("flags a non-HTTPS image URL", () => {
    const noteFiles = [
      {
        fileName: "2.7.md",
        filePath: "src/release-notes/notes/2.7.md",
        source: "# Note\n\n![A screenshot](http://example.com/shot.png)\n",
      },
    ];

    expect(findNoteIssues(noteFiles)).toEqual([
      expect.objectContaining({ reason: expect.stringContaining("HTTPS") }),
    ]);
  });

  it("flags an image with no alt text", () => {
    const noteFiles = [
      {
        fileName: "2.7.md",
        filePath: "src/release-notes/notes/2.7.md",
        source: "# Note\n\n![](https://example.com/shot.png)\n",
      },
    ];

    expect(findNoteIssues(noteFiles)).toEqual([
      expect.objectContaining({ reason: expect.stringContaining("alt text") }),
    ]);
  });
});

describe("findReleaseNoteFilenameIssues", () => {
  it("accepts release-line and exact patch note names", () => {
    expect(
      findReleaseNoteFilenameIssues([
        { fileName: "2.7.md", filePath: "src/release-notes/notes/2.7.md" },
        { fileName: "2.7.1.md", filePath: "src/release-notes/notes/2.7.1.md" },
      ]),
    ).toEqual([]);
  });

  it("rejects templates, prerelease names, and non-markdown files", () => {
    expect(
      findReleaseNoteFilenameIssues([
        { fileName: "template.md", filePath: "src/release-notes/notes/template.md" },
        {
          fileName: "2.7.0-beta.1.md",
          filePath: "src/release-notes/notes/2.7.0-beta.1.md",
        },
        { fileName: "2.7.0.md", filePath: "src/release-notes/notes/2.7.0.md" },
        { fileName: "2.7.1.txt", filePath: "src/release-notes/notes/2.7.1.txt" },
      ]),
    ).toHaveLength(4);
  });
});

describe("findMissingNoteIssue", () => {
  it("requires a note for a major/minor release", () => {
    expect(findMissingNoteIssue("2.7.0", ["2.7.md"])).toBeNull();
    expect(findMissingNoteIssue("2.8.0", ["2.7.md"])).toEqual(
      expect.objectContaining({ reason: expect.stringContaining("2.8") }),
    );
  });

  it("does not require a note for a patch release", () => {
    expect(findMissingNoteIssue("2.7.1", [])).toBeNull();
  });
});
