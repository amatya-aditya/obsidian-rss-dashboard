import { describe, expect, it } from "vitest";
import {
  classifyFindings,
  findAdrIssues,
  findArchivedPlanFrontmatterIssues,
  findDocsAuditIssues,
  findNamingIssues,
  findOrphanDocuments,
  findStrayMarkdown,
  isExcludedPath,
  parseNameStatus,
  renderReport,
  runRules,
} from "../../scripts/check-docs-audit.mjs";

type Finding = {
  rule: string;
  filePath: string;
  reason: string;
  severity?: string;
};

const ADR_INDEX_HEADER = [
  "| ADR | Decision | Status | Summary |",
  "| --- | --- | --- | --- |",
];

function adrSource({
  status = "accepted",
  date = "2026-10-01",
  extra = "",
}: { status?: string; date?: string; extra?: string } = {}) {
  return [
    "# ADR 0040: Example decision",
    "",
    "## Status",
    "",
    status,
    "",
    "## Date",
    "",
    date,
    "",
    "## Context and problem",
    "",
    "Why the decision mattered.",
    "",
    "## Decision",
    "",
    "We will do the thing.",
    "",
    "## Consequences",
    "",
    "Benefits and costs.",
    extra,
  ].join("\n");
}

function indexRow(number: string, status: string) {
  return `| [${number}](${number}-example-decision.md) | Example | ${status} | Summary |`;
}

describe("parseNameStatus", () => {
  it("reads added, modified, and deleted paths", () => {
    expect(
      parseNameStatus(
        "A\tdocs/adr/0040-new.md\nM\tdocs/README.md\nD\tdocs/old.md\n",
      ),
    ).toEqual([
      { status: "A", filePath: "docs/adr/0040-new.md" },
      { status: "M", filePath: "docs/README.md" },
      { status: "D", filePath: "docs/old.md" },
    ]);
  });

  it("keeps the new path and similarity for a rename", () => {
    expect(
      parseNameStatus("R092\tdocs/plans/a.md\tdocs/archive/plans/a.md\n"),
    ).toEqual([
      {
        status: "R",
        filePath: "docs/archive/plans/a.md",
        oldPath: "docs/plans/a.md",
        similarity: 92,
      },
    ]);
  });

  it("drops release notes and the changelog from the audit", () => {
    expect(
      parseNameStatus(
        "M\tCHANGELOG.md\nA\tdocs/releases/2.8.0.md\nA\tsrc/release-notes/notes/2.8.md\nM\tdocs/README.md\n",
      ),
    ).toEqual([{ status: "M", filePath: "docs/README.md" }]);
  });
});

describe("isExcludedPath", () => {
  it("excludes changelog, release summaries, and What's New notes", () => {
    expect(isExcludedPath("CHANGELOG.md")).toBe(true);
    expect(isExcludedPath("docs/releases/announcements/x.md")).toBe(true);
    expect(isExcludedPath("src/release-notes/notes/2.8.md")).toBe(true);
    expect(isExcludedPath("docs/adr/0001-x.md")).toBe(false);
  });
});

describe("findAdrIssues", () => {
  it("passes a complete ADR listed in the index with a matching status", () => {
    const issues = findAdrIssues(
      [
        {
          filePath: "docs/adr/0040-example-decision.md",
          source: adrSource(),
        },
      ],
      [...ADR_INDEX_HEADER, indexRow("0040", "accepted")].join("\n"),
    );

    expect(issues).toEqual([]);
  });

  it("flags an ADR whose index row is missing", () => {
    const issues = findAdrIssues(
      [
        {
          filePath: "docs/adr/0040-example-decision.md",
          source: adrSource(),
        },
      ],
      ADR_INDEX_HEADER.join("\n"),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        rule: "adr-index",
        filePath: "docs/adr/0040-example-decision.md",
      }),
    ]);
  });

  it("flags an index status that disagrees with the file", () => {
    const issues = findAdrIssues(
      [
        {
          filePath: "docs/adr/0040-example-decision.md",
          source: adrSource({ status: "proposed" }),
        },
      ],
      [...ADR_INDEX_HEADER, indexRow("0040", "accepted")].join("\n"),
    );

    expect(issues).toEqual([
      expect.objectContaining({
        rule: "adr-index",
        reason: expect.stringContaining('"accepted"'),
      }),
    ]);
  });

  it("flags a status outside the policy's five values", () => {
    const issues = findAdrIssues(
      [
        {
          filePath: "docs/adr/0040-example-decision.md",
          source: adrSource({ status: "maybe" }),
        },
      ],
      [...ADR_INDEX_HEADER, indexRow("0040", "maybe")].join("\n"),
    );

    expect(issues.map((issue: Finding) => issue.rule)).toContain("adr-status");
  });

  it("flags a superseded ADR that does not link its replacement", () => {
    const issues = findAdrIssues(
      [
        {
          filePath: "docs/adr/0040-example-decision.md",
          source: adrSource({ status: "superseded" }),
        },
      ],
      [...ADR_INDEX_HEADER, indexRow("0040", "superseded")].join("\n"),
    );

    expect(issues.map((issue: Finding) => issue.rule)).toContain(
      "adr-superseded-link",
    );
  });

  it("accepts a superseded ADR that links its replacement", () => {
    const source = adrSource({ status: "superseded" }).replace(
      "superseded\n",
      "superseded by [ADR 0041](0041-new-decision.md)\n",
    );
    const issues = findAdrIssues(
      [{ filePath: "docs/adr/0040-example-decision.md", source }],
      [...ADR_INDEX_HEADER, indexRow("0040", "superseded")].join("\n"),
    );

    expect(issues).toEqual([]);
  });

  it("flags a missing required section", () => {
    const source = adrSource().replace("## Consequences", "## Outcome");
    const issues = findAdrIssues(
      [{ filePath: "docs/adr/0040-example-decision.md", source }],
      [...ADR_INDEX_HEADER, indexRow("0040", "accepted")].join("\n"),
    );

    expect(issues.map((issue: Finding) => issue.rule)).toContain(
      "adr-sections",
    );
  });

  it("flags two files sharing one ADR number", () => {
    const issues = findAdrIssues(
      [
        { filePath: "docs/adr/0040-first.md", source: adrSource() },
        { filePath: "docs/adr/0040-second.md", source: adrSource() },
      ],
      [...ADR_INDEX_HEADER, indexRow("0040", "accepted")].join("\n"),
    );

    expect(issues.map((issue: Finding) => issue.rule)).toContain(
      "adr-duplicate-id",
    );
  });

  it("flags an ADR filename without a number", () => {
    const issues = findAdrIssues(
      [{ filePath: "docs/adr/example.md", source: adrSource() }],
      ADR_INDEX_HEADER.join("\n"),
    );

    expect(issues.map((issue: Finding) => issue.rule)).toContain(
      "adr-filename",
    );
  });

  it("skips the policy, template, and index files", () => {
    const issues = findAdrIssues(
      [
        { filePath: "docs/adr/POLICY.md", source: "# Policy" },
        { filePath: "docs/adr/ADR-TEMPLATE.md", source: "# Template" },
        { filePath: "docs/adr/README.md", source: "# Index" },
      ],
      ADR_INDEX_HEADER.join("\n"),
    );

    expect(issues).toEqual([]);
  });
});

describe("findStrayMarkdown", () => {
  it("accepts markdown in each documented home", () => {
    expect(
      findStrayMarkdown([
        "README.md",
        "docs/user/syncing.md",
        ".agents/skills/pr/SKILL.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        "test_files/fixture-vault/welcome.md",
        "src/styles/README.md",
      ]),
    ).toEqual([]);
  });

  it("flags markdown at the root or in a source folder", () => {
    const issues = findStrayMarkdown(["notes.md", "src/utils/scratch.md"]);

    expect(issues.map((issue: Finding) => issue.filePath)).toEqual([
      "notes.md",
      "src/utils/scratch.md",
    ]);
  });
});

describe("findNamingIssues", () => {
  it("accepts kebab-case, version-prefixed, and conventional names", () => {
    expect(
      findNamingIssues([
        "docs/user/tags-primer.md",
        "docs/archive/investigations/2026/2.4.1-errors.md",
        "docs/adr/POLICY.md",
        ".github/ISSUE_TEMPLATE/bug_report.md",
      ]),
    ).toEqual([]);
  });

  it("flags underscores and spaces in a filename", () => {
    const issues = findNamingIssues([
      "docs/archive/2.4.0_audit_remediation_plan.md",
      "docs/my notes.md",
    ]);

    expect(issues.map((issue: Finding) => issue.filePath)).toEqual([
      "docs/archive/2.4.0_audit_remediation_plan.md",
      "docs/my notes.md",
    ]);
  });
});

describe("findOrphanDocuments", () => {
  it("does not warn about a document another file links to", () => {
    const orphans = findOrphanDocuments([
      {
        filePath: "README.md",
        source: "[Syncing](docs/user/syncing.md)",
      },
      { filePath: "docs/user/syncing.md", source: "# Syncing" },
    ]);

    expect(orphans.map((orphan: Finding) => orphan.filePath)).toEqual([]);
  });

  it("warns about an unlinked document under docs/", () => {
    const orphans = findOrphanDocuments([
      { filePath: "docs/index-page.md", source: "# Home" },
      { filePath: "docs/user/forgotten.md", source: "# Forgotten" },
    ]);

    expect(orphans.map((orphan: Finding) => orphan.filePath)).toEqual([
      "docs/index-page.md",
      "docs/user/forgotten.md",
    ]);
  });

  it("ignores READMEs and archived documents", () => {
    const orphans = findOrphanDocuments([
      { filePath: "docs/user/README.md", source: "# Index" },
      { filePath: "docs/archive/plans/v1/old.md", source: "# Old" },
    ]);

    expect(orphans).toEqual([]);
  });
});

describe("findArchivedPlanFrontmatterIssues", () => {
  it("accepts an archived plan with a frontmatter block", () => {
    expect(
      findArchivedPlanFrontmatterIssues([
        {
          filePath: "docs/archive/plans/v2.7.0/262-pre-release-checklist.md",
          source: "---\nstatus: implemented\n---\n\n# Plan\n",
        },
      ]),
    ).toEqual([]);
  });

  it("flags an archived plan without one", () => {
    const issues = findArchivedPlanFrontmatterIssues([
      {
        filePath: "docs/archive/plans/v2.7.0/249-01-add-jsdoc.md",
        source: "# Plan\n",
      },
    ]);

    expect(issues.map((issue: Finding) => issue.rule)).toEqual([
      "archive-frontmatter",
    ]);
  });
});

describe("classifyFindings", () => {
  const findings = [
    { rule: "naming", filePath: "docs/new.md", reason: "x" },
    { rule: "naming", filePath: "docs/old.md", reason: "x" },
    { rule: "orphan", filePath: "docs/new.md", reason: "x" },
  ];

  it("fails a break in a changed document and warns for an orphan", () => {
    const classified = classifyFindings(findings, new Set(["docs/new.md"]));

    expect(
      classified.map((finding: Finding) => [
        finding.filePath,
        finding.severity,
      ]),
    ).toEqual([
      ["docs/new.md", "fail"],
      ["docs/old.md", "historical"],
      ["docs/new.md", "warn"],
    ]);
  });
});

describe("runRules and findDocsAuditIssues", () => {
  it("gates only on failing findings, not historical ones", () => {
    const audit = {
      findings: runRules(
        [
          { filePath: "docs/old.md", source: "# Old" },
          { filePath: "docs/new.md", source: "# New" },
        ],
        new Set(["docs/new.md"]),
      ).filter((finding: Finding) => finding.rule !== "orphan"),
    };

    expect(findDocsAuditIssues(audit)).toEqual([]);
  });

  it("reports a failing finding as a release-gate item", () => {
    const audit = {
      findings: [
        {
          rule: "naming",
          filePath: "docs/my notes.md",
          reason: "filename must be lowercase kebab-case",
          severity: "fail",
        },
      ],
    };

    expect(findDocsAuditIssues(audit)).toEqual([
      {
        filePath: "docs/my notes.md",
        reason: "docs audit (naming): filename must be lowercase kebab-case",
      },
    ]);
  });
});

describe("renderReport", () => {
  it("lists the diff sections and the finding counts", () => {
    const report = renderReport({
      base: "origin/master",
      head: "HEAD",
      documentCount: 2,
      diff: [
        { status: "A", filePath: "docs/a.md" },
        { status: "R", filePath: "docs/b.md", oldPath: "docs/old-b.md" },
      ],
      findings: [],
    });

    expect(report).toContain("Documents checked: 2. Fail: 0.");
    expect(report).toContain("### New (1)");
    expect(report).toContain("| `docs/b.md` | `docs/old-b.md` |");
    expect(report).toContain("### Deleted\n\nNone.");
  });
});
