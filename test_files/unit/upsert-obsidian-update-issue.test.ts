import { describe, expect, it } from "vitest";

import {
  DEFAULT_LABEL,
  DEFAULT_TITLE,
  LABEL_COLOR,
  UpsertError,
  ensureLabel,
  parseArgs,
  planIssueUpsert,
  selectOpenIssueNumber,
  upsertIssue,
} from "../../scripts/upsert-obsidian-update-issue.mjs";

type GhResult = { status: number; stdout: string; stderr: string };

const ok = (stdout = ""): GhResult => ({ status: 0, stdout, stderr: "" });
const fail = (stderr = "boom"): GhResult => ({
  status: 1,
  stdout: "",
  stderr,
});

/** A `gh` stand-in that records every call and answers from `handler`. */
function fakeGh(handler: (args: string[]) => GhResult) {
  const calls: string[][] = [];
  const run = (args: string[]): GhResult => {
    calls.push(args);
    return handler(args);
  };
  return { run, calls };
}

/** Collects the lines `upsertIssue` logs, without a spy. */
function recordingLog() {
  const lines: string[] = [];
  return { log: (line: string) => lines.push(line), lines };
}

describe("upsert-obsidian-update-issue parseArgs", () => {
  it("defaults to the tracking label and stable title", () => {
    expect(parseArgs(["--report", "drift.md"])).toEqual({
      reportPath: "drift.md",
      label: DEFAULT_LABEL,
      title: DEFAULT_TITLE,
      help: false,
    });
  });

  it("reads every option, with and without an equals sign", () => {
    expect(
      parseArgs([
        "--report=drift.md",
        "--label",
        "my-label",
        "--title=My title",
      ]),
    ).toMatchObject({
      reportPath: "drift.md",
      label: "my-label",
      title: "My title",
    });
  });

  it("recognises help", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("rejects an unknown option and a missing value", () => {
    expect(() => parseArgs(["--nope"])).toThrow(UpsertError);
    expect(() => parseArgs(["--report"])).toThrow(UpsertError);
    expect(() => parseArgs(["--report", "--label", "x"])).toThrow(UpsertError);
  });
});

describe("upsert-obsidian-update-issue selectOpenIssueNumber", () => {
  it("reads the number of the open issue", () => {
    expect(selectOpenIssueNumber('[{"number":12}]')).toBe(12);
  });

  it("returns undefined when no issue is open", () => {
    expect(selectOpenIssueNumber("[]")).toBeUndefined();
  });

  it("throws on output that is not a JSON list of numbers", () => {
    expect(() => selectOpenIssueNumber("not json")).toThrow(UpsertError);
    expect(() => selectOpenIssueNumber('{"number":1}')).toThrow(UpsertError);
    expect(() => selectOpenIssueNumber('[{"title":"x"}]')).toThrow(UpsertError);
    expect(() => selectOpenIssueNumber('[{"number":0}]')).toThrow(UpsertError);
    expect(() => selectOpenIssueNumber('[{"number":"1"}]')).toThrow(
      UpsertError,
    );
  });
});

describe("upsert-obsidian-update-issue planIssueUpsert", () => {
  it("edits the open issue without renaming it", () => {
    expect(
      planIssueUpsert({
        number: 12,
        label: DEFAULT_LABEL,
        title: DEFAULT_TITLE,
        reportPath: "drift.md",
      }),
    ).toEqual({
      action: "update",
      args: ["issue", "edit", "12", "--body-file", "drift.md"],
    });
  });

  it("creates the issue with the label, stable title, and report body", () => {
    expect(
      planIssueUpsert({
        number: undefined,
        label: DEFAULT_LABEL,
        title: DEFAULT_TITLE,
        reportPath: "drift.md",
      }),
    ).toEqual({
      action: "create",
      args: [
        "issue",
        "create",
        "--label",
        DEFAULT_LABEL,
        "--title",
        DEFAULT_TITLE,
        "--body-file",
        "drift.md",
      ],
    });
  });
});

describe("upsert-obsidian-update-issue ensureLabel", () => {
  it("creates the label idempotently with force", () => {
    const { run, calls } = fakeGh(() => ok());

    ensureLabel(DEFAULT_LABEL, run, () => {});

    expect(calls).toEqual([
      [
        "label",
        "create",
        DEFAULT_LABEL,
        "--color",
        LABEL_COLOR,
        "--description",
        expect.any(String),
        "--force",
      ],
    ]);
  });

  it("throws when the label cannot be ensured", () => {
    const { run } = fakeGh(() => fail("no permission"));

    expect(() => ensureLabel(DEFAULT_LABEL, run, () => {})).toThrow(
      /no permission/,
    );
  });
});

describe("upsert-obsidian-update-issue upsertIssue", () => {
  it("creates one issue when none is open, and keeps the stable title", () => {
    const { run, calls } = fakeGh((args) =>
      args[1] === "list" ? ok("[]") : ok(),
    );
    const { log, lines } = recordingLog();

    const plan = upsertIssue({
      reportPath: "drift.md",
      run,
      log,
    });

    expect(plan.action).toBe("create");
    expect(calls.map((args) => args.slice(0, 2).join(" "))).toEqual([
      "label create",
      "issue list",
      "issue create",
    ]);
    expect(calls[2]).toContain(DEFAULT_TITLE);
    expect(calls[2]).toContain("--label");
    expect(lines).toContain("Created issue.");
  });

  it("updates the open issue instead of opening a second one", () => {
    const { run, calls } = fakeGh((args) =>
      args[1] === "list" ? ok('[{"number":42}]') : ok(),
    );
    const { log, lines } = recordingLog();

    const plan = upsertIssue({ reportPath: "drift.md", run, log });

    expect(plan.action).toBe("update");
    expect(calls[2]).toEqual([
      "issue",
      "edit",
      "42",
      "--body-file",
      "drift.md",
    ]);
    expect(lines).toContain("Updated issue #42.");
    expect(
      calls.some((args) => args[0] === "issue" && args[1] === "create"),
    ).toBe(false);
  });

  it("refuses to file anything when the issue list fails", () => {
    // The label step succeeds; the list step fails.
    const { run, calls } = fakeGh((args) =>
      args[1] === "list" ? fail("rate limited") : ok(),
    );

    expect(() => upsertIssue({ reportPath: "drift.md", run })).toThrow(
      /rate limited/,
    );
    expect(calls.map((args) => args[1])).toEqual(["create", "list"]);
  });

  it("throws when creating the issue fails", () => {
    const { run } = fakeGh((args) =>
      args[1] === "list" ? ok("[]") : fail("label not found"),
    );

    expect(() => upsertIssue({ reportPath: "drift.md", run })).toThrow(
      /label not found/,
    );
  });

  it("requires a report path", () => {
    expect(() => upsertIssue({ run: fakeGh(() => ok()).run })).toThrow(
      UpsertError,
    );
  });
});
