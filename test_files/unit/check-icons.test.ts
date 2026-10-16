import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { execPath } from "node:process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { renderIconMarkup } from "../stubs/lucide-icons";
import {
  ICON_SINK_NAMES,
  iconIdsIn,
  isIconCarried,
  mayNameIcon,
  parseArgs,
  readIconStub,
  runIconCheck,
  scanIconStub,
} from "../../scripts/check-icons.mjs";

/**
 * Covers `scripts/check-icons.mjs`, the `check:icons` gate. The gate itself
 * scans every file under `src/`, which is deliberately *not* run from here: a
 * src-wide AST scan inside a unit test races Vitest's per-test timeout under
 * full-suite load (issue #1104; it was moved to a check script for exactly that
 * reason). These tests exercise the scan over small fixtures instead, and only
 * the CLI test pays for a process spawn.
 */

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, "..", "..");
const SCRIPT_PATH = join(ROOT_DIR, "scripts", "check-icons.mjs");
const REAL_STUB_PATH = join(ROOT_DIR, "test_files", "stubs", "lucide-icons.ts");

/** A stub shaped like the real one, carrying `lucide-play` and a `folder` alias. */
const STUB_FIXTURE = `const ICON_BODIES: Readonly<Record<string, string>> = {
  "lucide-play": "<path d=\\"M1 1\\"></path>",
};

const ICON_ALIASES: Readonly<Record<string, string>> = {
  folder: "lucide-play",
};

export function renderIconMarkup(iconName: string): string {
  const id = ICON_ALIASES[iconName] ?? \`lucide-\${iconName}\`;
  return ICON_BODIES[id] === undefined ? "" : "markup";
}
`;

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

type Tree = { srcDir: string; stubPath: string };

/** Writes a throwaway tree with one stub and one source file per entry. */
function makeTree(sources: Record<string, string>, stub = STUB_FIXTURE): Tree {
  const root = mkdtempSync(join(tmpdir(), "rss-dashboard-icons-"));
  temporaryDirectories.push(root);
  const srcDir = join(root, "src");
  mkdirSync(srcDir);
  for (const [name, text] of Object.entries(sources)) {
    writeFileSync(join(srcDir, name), text);
  }
  const stubPath = join(root, "lucide-icons.ts");
  writeFileSync(stubPath, stub);
  return { srcDir, stubPath };
}

/** Collector for the `log`/`error` sinks `runIconCheck` takes. */
function collector(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line) };
}

describe("icon-id prefilter", () => {
  // Sources the AST scan names an icon id in, paired with the id it must find.
  // The prefilter must accept every one: a false negative here would silently
  // drop a file from the guard without failing it (#1104).
  const NAMED: ReadonlyArray<readonly [string, string]> = [
    ['setIcon(el, "play");', "play"],
    ['el.setIcon("play");', "play"],
    ['addRibbonIcon("play", "Play");', "play"],
    ['createSelector(el, "play");', "play"],
    ['makeButton(el, "play");', "play"],
    ['createNewTagsActionButton(a, b, "play");', "play"],
    ['createHeaderNavButton(a, b, c, d, "play");', "play"],
    ['const o = { icon: "play" };', "play"],
    ['const o = { lucideIcon: "play" };', "play"],
    ['const FOO_ICONS = { a: "play" };', "play"],
  ];

  it("keeps a file whose text names an icon through any sink", () => {
    for (const [source, id] of NAMED) {
      expect(mayNameIcon(source)).toBe(true);
      expect(iconIdsIn(source)).toContain(id);
    }
  });

  it("skips a file whose text names no icon sink", () => {
    expect(mayNameIcon("const total = items.length;")).toBe(false);
  });

  it("keeps the prefilter in step with the sink vocabulary", () => {
    for (const name of ICON_SINK_NAMES) {
      expect(mayNameIcon(name)).toBe(true);
    }
  });
});

describe("the icon stub the scan reads", () => {
  it("resolves every name exactly as renderIconMarkup does", () => {
    const stubSource = readFileSync(REAL_STUB_PATH, "utf8");
    const stub = readIconStub(stubSource);

    // Every id the stub carries, reached under its own name...
    const names = new Set<string>();
    for (const id of stub.bodies) {
      names.add(id);
      if (id.startsWith("lucide-")) names.add(id.slice("lucide-".length));
    }
    // ...and under every alias name and alias target.
    for (const [name, id] of stub.aliases) {
      names.add(name);
      names.add(id);
    }
    // Plus names Obsidian 1.14.4 does not carry, and unknown ones.
    for (const name of ["play", "youtube", "minus-vertical", "not-an-icon"]) {
      names.add(name);
    }

    for (const name of names) {
      expect(isIconCarried(name, stub)).toBe(renderIconMarkup(name) !== "");
    }
  });

  it("carries the alias names the contract records", () => {
    const stub = readIconStub(readFileSync(REAL_STUB_PATH, "utf8"));

    expect(isIconCarried("folder", stub)).toBe(true);
    expect(isIconCarried("trash", stub)).toBe(true);
    expect(isIconCarried("link", stub)).toBe(true);
  });
});

describe("scanIconStub", () => {
  it("reports an id the stub does not carry, with the file that names it", () => {
    const tree = makeTree({
      "toolbar.ts": 'setIcon(el, "play");\n',
      "other.ts": 'makeButton(el, "not-carried");\n',
    });

    const { missing } = scanIconStub(tree);

    expect(missing.map(({ id }: { id: string }) => id)).toEqual([
      "not-carried",
    ]);
    expect(missing[0].file).toBe(join(tree.srcDir, "other.ts"));
  });

  it("reports nothing when the stub carries every id, aliases included", () => {
    const tree = makeTree({
      "toolbar.ts": 'setIcon(el, "play");\nsetIcon(el, "folder");\n',
    });

    expect(scanIconStub(tree).missing).toEqual([]);
  });

  it("fails loudly when the stub names no icon bodies at all", () => {
    const tree = makeTree(
      { "toolbar.ts": 'setIcon(el, "play");\n' },
      "const RENAMED = {};\n",
    );

    expect(scanIconStub(tree).missing).toHaveLength(1);
  });
});

describe("runIconCheck", () => {
  it("returns 1 and names the offending file and id", () => {
    const tree = makeTree({ "other.ts": 'makeButton(el, "not-carried");\n' });
    const errors = collector();
    const logs = collector();

    const code = runIconCheck({
      ...tree,
      log: logs.write,
      error: errors.write,
    });

    expect(code).toBe(1);
    expect(errors.lines.join("\n")).toContain('other.ts: "not-carried"');
    expect(logs.lines).toEqual([]);
  });

  it("returns 0 and reports how many ids it checked", () => {
    const tree = makeTree({ "toolbar.ts": 'setIcon(el, "play");\n' });
    const errors = collector();
    const logs = collector();

    const code = runIconCheck({
      ...tree,
      log: logs.write,
      error: errors.write,
    });

    expect(code).toBe(0);
    expect(logs.lines.join("\n")).toContain("Icon stub check passed");
    expect(errors.lines).toEqual([]);
  });
});

describe("parseArgs", () => {
  it("defaults to the repository src directory and icon stub", () => {
    const options = parseArgs([]);

    expect(options.srcDir.replace(/\\/g, "/")).toMatch(/\/src$/);
    expect(options.stubPath.replace(/\\/g, "/")).toMatch(
      /\/test_files\/stubs\/lucide-icons\.ts$/,
    );
    expect(options.help).toBe(false);
  });

  it("accepts --src, --stub and --help, and rejects an unknown option", () => {
    const options = parseArgs(["--src", "some/dir", "--stub=some/file.ts"]);

    expect(options.srcDir).toBe(resolve("some/dir"));
    expect(options.stubPath).toBe(resolve("some/file.ts"));
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown option/);
  });
});

describe("check:icons CLI", () => {
  // One spawn only: it is the case the build and pre-commit gates depend on
  // (a non-zero exit), and a second spawn costs another ~1.5 s under load for
  // a green path `runIconCheck` already covers above.
  //
  // The explicit budget is a complement to that, not the fix: the work here is
  // fixed (spawn Node, import `typescript`, scan a two-file fixture) and does
  // not grow with the repo, but it is CPU-bound startup that stretches with
  // suite-wide load -- 583 ms idle, 1659 ms under `--coverage` on a 16-core
  // machine. The default 5000 ms would leave only ~3x headroom for a cost the
  // test cannot control, which is how #1104 started.
  it(
    "exits non-zero and names the offending file and id",
    { timeout: 30_000 },
    () => {
      const tree = makeTree({ "other.ts": 'makeButton(el, "not-carried");\n' });

      const result = spawnSync(
        execPath,
        [SCRIPT_PATH, "--src", tree.srcDir, "--stub", tree.stubPath],
        { encoding: "utf8" },
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('other.ts: "not-carried"');
    },
  );
});
