import { describe, expect, it } from "vitest";
import {
  findChangelogHeadingIssue,
  findPrematureBumpIssue,
  findPublicReleaseNotesIssue,
  findUnarchivedPlanIssues,
  findUnreleasedLeftoverIssue,
  findWorkingTreeIssue,
  isValidTargetVersion,
} from "../../scripts/check-release-ready.mjs";

describe("isValidTargetVersion", () => {
  it("accepts a plain release and a prerelease", () => {
    expect(isValidTargetVersion("2.7.0")).toBe(true);
    expect(isValidTargetVersion("2.7.1")).toBe(true);
    expect(isValidTargetVersion("2.7.0-beta.1")).toBe(true);
  });

  it("rejects anything that is not a full version", () => {
    expect(isValidTargetVersion("")).toBe(false);
    expect(isValidTargetVersion("2.7")).toBe(false);
    expect(isValidTargetVersion("v2.7.0")).toBe(false);
    expect(isValidTargetVersion("latest")).toBe(false);
  });
});

describe("findChangelogHeadingIssue", () => {
  it("passes once the release heading exists", () => {
    const changelog = "## 2.7.0 - September 22, 2026\n\n### Features\n\n- Thing\n";

    expect(findChangelogHeadingIssue(changelog, "2.7.0")).toBeNull();
  });

  it("accepts the bracketed heading style used by older entries", () => {
    const changelog = "## [2.4.0-beta.1] - June 5, 2026\n";

    expect(findChangelogHeadingIssue(changelog, "2.4.0-beta.1")).toBeNull();
  });

  it("flags a changelog still headed Unreleased", () => {
    const changelog = "## Unreleased\n\n### Features\n\n- Thing\n";

    expect(findChangelogHeadingIssue(changelog, "2.7.0")).toMatchObject({
      filePath: "CHANGELOG.md",
    });
  });

  it("does not match a different version's heading", () => {
    const changelog = "## 2.6.0 - August 24, 2026\n";

    expect(findChangelogHeadingIssue(changelog, "2.7.0")).not.toBeNull();
  });
});

describe("findUnreleasedLeftoverIssue", () => {
  it("passes when no Unreleased section remains", () => {
    const changelog = "## 2.7.0 - September 22, 2026\n\n- Thing\n";

    expect(findUnreleasedLeftoverIssue(changelog)).toBeNull();
  });

  it("passes when the Unreleased section holds only empty sub-headings", () => {
    const changelog =
      "## Unreleased\n\n### Features\n\n### Bug Fixes\n\n## 2.7.0 - September 22, 2026\n\n- Thing\n";

    expect(findUnreleasedLeftoverIssue(changelog)).toBeNull();
  });

  it("flags entries left under Unreleased above a release heading", () => {
    const changelog =
      "## Unreleased\n\n### Features\n\n- Forgotten entry\n\n## 2.7.0 - September 22, 2026\n";

    expect(findUnreleasedLeftoverIssue(changelog)).toMatchObject({
      filePath: "CHANGELOG.md",
    });
  });

  it("flags entries when Unreleased is the final section", () => {
    const changelog = "## Unreleased\n\n- Forgotten entry\n";

    expect(findUnreleasedLeftoverIssue(changelog)).not.toBeNull();
  });
});

describe("findPublicReleaseNotesIssue", () => {
  it("passes when the version has a public summary", () => {
    expect(
      findPublicReleaseNotesIssue("2.7.0", ["2.6.0.md", "2.7.0.md"]),
    ).toBeNull();
  });

  it("flags a missing public summary", () => {
    expect(findPublicReleaseNotesIssue("2.7.0", ["2.6.0.md"])).toMatchObject({
      filePath: "docs/releases/2.7.0.md",
    });
  });
});

describe("findPrematureBumpIssue", () => {
  it("passes when the target version is not yet listed", () => {
    expect(
      findPrematureBumpIssue("2.7.0", { "2.5.0": "1.8.7", "2.6.0": "1.8.7" }),
    ).toBeNull();
  });

  it("flags a target version already written into versions.json", () => {
    expect(
      findPrematureBumpIssue("2.7.0", { "2.6.0": "1.8.7", "2.7.0": "1.8.7" }),
    ).toMatchObject({ filePath: "versions.json" });
  });
});

describe("findUnarchivedPlanIssues", () => {
  it("returns nothing when no plans await archiving", () => {
    expect(findUnarchivedPlanIssues([], "2.7.0")).toEqual([]);
  });

  it("flags each plan still sitting under unreleased", () => {
    const issues = findUnarchivedPlanIssues(
      [
        "docs/archive/plans/unreleased/315-shard-state-gc.md",
        "docs/archive/plans/unreleased/331-decouple-star-from-tags.md",
      ],
      "2.7.0",
    );

    expect(issues).toHaveLength(2);
    expect(issues[0].filePath).toBe(
      "docs/archive/plans/unreleased/315-shard-state-gc.md",
    );
    expect(issues[0].reason).toContain("docs/archive/plans/v2.7.0/");
  });

  it("flags a plan nested in its own ticket folder", () => {
    const nested =
      "docs/archive/plans/unreleased/254-export-bundle-hierarchy/tickets/01-build.md";
    const issues = findUnarchivedPlanIssues([nested], "2.7.0");

    expect(issues[0].filePath).toBe(nested);
  });
});

describe("findWorkingTreeIssue", () => {
  it("passes on a clean tree", () => {
    expect(findWorkingTreeIssue("")).toBeNull();
    expect(findWorkingTreeIssue("\n")).toBeNull();
  });

  it("flags uncommitted and untracked paths", () => {
    const issue = findWorkingTreeIssue(" M manifest.json\n?? scratch.md\n");

    expect(issue).not.toBeNull();
    expect(issue?.reason).toContain("2 uncommitted");
  });
});
