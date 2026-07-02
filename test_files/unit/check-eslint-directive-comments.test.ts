import { describe, expect, it } from "vitest";
import { findUndescribedDirectiveComments } from "../../scripts/check-commit-message.mjs";
const sentenceCaseRule = "obsidianmd/ui/sentence-case";
const explicitAnyRule = "@typescript-eslint/no-explicit-any";

describe("findUndescribedDirectiveComments", () => {
  it("accepts directive comments that include a description for a disallowed rule", () => {
    const source = `
      new Notice(
        // eslint-disable-next-line ${sentenceCaseRule} -- Preserve the required URL casing.
        "Missing URI action. Use action=add-feed with a URL parameter.",
      );
    `;

    expect(findUndescribedDirectiveComments(source)).toEqual([]);
  });

  it("flags disallowed directive comments that omit a description", () => {
    const source = `
      new Notice(
        // eslint-disable-next-line ${sentenceCaseRule}
        "Missing URI action. Use action=add-feed with a URL parameter.",
      );
    `;

    expect(findUndescribedDirectiveComments(source)).toEqual([
      {
        line: 3,
        text: `// eslint-disable-next-line ${sentenceCaseRule}`,
      },
    ]);
  });

  it("flags other disallowed rules without descriptions", () => {
    const source = `
      const value: any = {};
      // eslint-disable-next-line ${explicitAnyRule}
      const other = value;
    `;

    expect(findUndescribedDirectiveComments(source)).toEqual([
      {
        line: 3,
        text: `// eslint-disable-next-line ${explicitAnyRule}`,
      },
    ]);
  });
});
