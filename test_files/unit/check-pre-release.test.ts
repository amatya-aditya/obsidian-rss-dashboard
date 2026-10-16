import { describe, expect, it } from "vitest";
import {
  findCatalogParityIssues,
  isReleaseMode,
  findHostileFilenames,
  findMissingNoteIssue,
  findPlanningDocumentIssues,
  findReleaseNoteFilenameIssues,
  findNoteIssues,
  findStrayFiles,
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
    const files = [
      "src/utils/date.ts",
      "docs/planning/370-performance-program.md",
    ];

    expect(findStrayFiles(files)).toEqual([]);
  });
});

describe("findPlanningDocumentIssues", () => {
  const ISSUE_URL =
    "https://github.com/amatya-aditya/obsidian-rss-dashboard/issues/";

  it("accepts a supporting document that names its issues", () => {
    expect(
      findPlanningDocumentIssues([
        {
          filePath: "docs/planning/370-performance-program.md",
          source: `---\ncreated: 2026-09-24\nissues:\n  - ${ISSUE_URL}370\n---\n\n# Program\n`,
        },
      ]),
    ).toEqual([]);
  });

  it("flags a document that declares no issues", () => {
    const issues = findPlanningDocumentIssues([
      {
        filePath: "docs/planning/new-single-issue-document.md",
        source: "# Opt-In Cover Image Fallback Plan\n\nProse only.\n",
      },
    ]);

    expect(issues).toEqual([
      expect.objectContaining({
        filePath: "docs/planning/new-single-issue-document.md",
        reason: expect.stringContaining("`issues:`"),
      }),
    ]);
  });

  it("flags the retired status field, even when the document names issues", () => {
    const issues = findPlanningDocumentIssues([
      {
        filePath: "docs/planning/new-status-carrying-document.md",
        source: `---\nstatus: in-progress\nissues:\n  - ${ISSUE_URL}9999\n---\n`,
      },
    ]);

    expect(issues).toEqual([
      expect.objectContaining({
        filePath: "docs/planning/new-status-carrying-document.md",
        reason: expect.stringContaining("status:"),
      }),
    ]);
  });

  it("reads status only in frontmatter, never in prose", () => {
    expect(
      findPlanningDocumentIssues([
        {
          filePath: "docs/planning/370-performance-program.md",
          source: `---\nissues:\n  - ${ISSUE_URL}370\n---\n\nstatus: mentioned in prose\n`,
        },
      ]),
    ).toEqual([]);
  });

  it("accepts drafts, roadmaps, and the folder's own rule file", () => {
    expect(
      findPlanningDocumentIssues([
        {
          filePath: "docs/planning/draft-20260921-regex-search.md",
          source: "---\ncreated: 2026-09-21\n---\n",
        },
        {
          filePath: "docs/planning/public-roadmap.md",
          source: "# Public Roadmap\n",
        },
        {
          filePath: "docs/planning/README.md",
          source: "# Planning Documents\n",
        },
      ]),
    ).toEqual([]);
  });

  it("accepts a program directory whose README names its issues", () => {
    expect(
      findPlanningDocumentIssues([
        {
          filePath: "docs/planning/826-agent-testability-quick-wins/README.md",
          source: `---\nissues:\n  - ${ISSUE_URL}826\n---\n`,
        },
        {
          filePath: "docs/planning/826-agent-testability-quick-wins/spec.md",
          source: "# Spec\n",
        },
      ]),
    ).toEqual([]);
  });

  it("flags a program directory with no README", () => {
    const issues = findPlanningDocumentIssues([
      { filePath: "docs/planning/program/spec.md", source: "# Spec\n" },
    ]);

    expect(issues).toEqual([
      expect.objectContaining({ filePath: "docs/planning/program" }),
    ]);
  });

  it("flags a program README that names no issues", () => {
    const issues = findPlanningDocumentIssues([
      { filePath: "docs/planning/program/README.md", source: "# Program\n" },
      { filePath: "docs/planning/program/spec.md", source: "# Spec\n" },
    ]);

    expect(issues).toEqual([
      expect.objectContaining({ filePath: "docs/planning/program/README.md" }),
    ]);
  });

  it("lets a plan awaiting migration keep the retired convention's schema", () => {
    expect(
      findPlanningDocumentIssues([
        {
          filePath: "docs/planning/437-reader-image-log-noise.md",
          source: "---\nstatus: in-progress\nissue: ''\n---\n",
        },
      ]),
    ).toEqual([]);
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
        {
          fileName: "template.md",
          filePath: "src/release-notes/notes/template.md",
        },
        {
          fileName: "2.7.0-beta.1.md",
          filePath: "src/release-notes/notes/2.7.0-beta.1.md",
        },
        { fileName: "2.7.0.md", filePath: "src/release-notes/notes/2.7.0.md" },
        {
          fileName: "2.7.1.txt",
          filePath: "src/release-notes/notes/2.7.1.txt",
        },
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

describe("findHostileFilenames", () => {
  it("flags spaces, brackets, backticks, and em-dashes", () => {
    const issues = findHostileFilenames([
      "docs/archive/2.4.0 audit.md",
      "docs/archive/[TARGET_FILE.css] plan.md",
      "docs/archive/`modals.css` checklist.md",
      "docs/archive/controls.css — split plan.md",
    ]);

    expect(issues).toHaveLength(4);
    expect(issues[0].reason).toContain("a space");
  });

  it("does not flag ordinary kebab-case paths", () => {
    expect(
      findHostileFilenames([
        "docs/development/pre-release-checklist.md",
        "src/services/feed-parser.ts",
        "docs/archive/plans/v2.6.0/draft-20260816-thing.md",
      ]),
    ).toEqual([]);
  });

  it("reports the path, not just the filename", () => {
    const issues = findHostileFilenames(["docs/a/b/c d.md"]);

    expect(issues[0].filePath).toBe("docs/a/b/c d.md");
  });
});

describe("findCatalogParityIssues", () => {
  const catalog = [
    "- [A plan](plans/v2.6.0/a-plan.md)",
    "- [Another](plans/unreleased/b-plan.md)",
  ].join("\n");

  it("passes when every archived plan is listed", () => {
    expect(
      findCatalogParityIssues(catalog, [
        "docs/archive/plans/v2.6.0/a-plan.md",
        "docs/archive/plans/unreleased/b-plan.md",
      ]),
    ).toEqual([]);
  });

  it("flags an archived plan missing from the catalog", () => {
    const issues = findCatalogParityIssues(catalog, [
      "docs/archive/plans/v2.6.0/a-plan.md",
      "docs/archive/plans/v2.6.0/forgotten.md",
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0].filePath).toBe("docs/archive/plans/v2.6.0/forgotten.md");
  });

  it("exempts coordination roadmaps, which are living documents", () => {
    expect(
      findCatalogParityIssues(catalog, [
        "docs/archive/plans/v2.6.0/release-v2.6.0-roadmap.md",
        "docs/archive/plans/public-roadmap.md",
      ]),
    ).toEqual([]);
  });

  it("ignores external links in the catalog", () => {
    const withHttp = "- [Spec](https://example.com/a-plan.md)";

    expect(
      findCatalogParityIssues(withHttp, ["docs/archive/plans/v1/a-plan.md"]),
    ).toHaveLength(1);
  });
});

describe("isReleaseMode", () => {
  it("is off for an ordinary build", () => {
    expect(isReleaseMode([])).toBe(false);
    expect(isReleaseMode(["--verbose"])).toBe(false);
  });

  it("is on when the release workflow asks for it", () => {
    expect(isReleaseMode(["--release"])).toBe(true);
  });
});
