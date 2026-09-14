import { describe, expect, it } from "vitest";
import {
  findPlanStatusIssues,
  findStrayFiles,
  isLifecyclePlanFilename,
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
