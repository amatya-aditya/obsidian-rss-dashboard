import { defineConfig } from "vitest/config";
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The plugin bundles curated What's New notes with esbuild's `text` loader.
// Vitest needs the same `.md`-as-string behavior to import them.
const markdownAsText = {
  name: "markdown-as-text",
  enforce: "pre",
  transform(_code, id) {
    if (!id.endsWith(".md")) {
      return null;
    }
    return {
      code: `export default ${JSON.stringify(fs.readFileSync(id, "utf8"))};`,
      map: null,
    };
  },
};

// Building a fresh jsdom and module graph for every test file is most of the
// suite's run time. Files that touch no shared state can reuse one per worker
// (`isolate: false`) and run several times faster. A file that replaces
// modules, stubs globals, or fakes timers would leak into the next file in the
// worker, so those keep a fresh environment. Sorting is by file content, so a
// new test that adds a mock moves to the isolated project by itself.
const SHARES_STATE = new RegExp(
  [
    String.raw`vi\.(mock|doMock|stubGlobal|stubEnv|useFakeTimers|resetModules|importActual)`,
    String.raw`vi\.spyOn\((globalThis|global|window|document|navigator|Date|Math|JSON)\b`,
    String.raw`globalThis\.`,
    String.raw`\(global as`,
    String.raw`window\.[A-Za-z_]+ ?=[^=]`,
  ].join("|"),
);
// Files that still leak state when shared; fix the leak, then remove the entry.
const ALWAYS_ISOLATED = [
  "test_files/stubs/obsidian.contract.test.ts",
  "test_files/unit/modals/import-opml-modal.test.ts",
];

function listTestFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "fixtures" ? [] : listTestFiles(full);
    return entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

const testFiles = ["test_files/unit", "test_files/stubs"]
  .flatMap((dir) => listTestFiles(path.join(__dirname, dir)))
  .map((file) => path.relative(__dirname, file).split(path.sep).join("/"));
const sharedFiles = testFiles.filter(
  (file) =>
    !ALWAYS_ISOLATED.includes(file) &&
    !SHARES_STATE.test(fs.readFileSync(path.join(__dirname, file), "utf8")),
);
const isolatedFiles = testFiles.filter((file) => !sharedFiles.includes(file));

export default defineConfig({
  plugins: [markdownAsText],
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "test_files/stubs/obsidian.ts"),
      // Map any import of 'main' to the TypeScript source file
      // This explicitly handles the relative import path used in plugin-lifecycle.test.ts
      "../../../main": path.resolve(__dirname, "main.ts"),
      "../main": path.resolve(__dirname, "main.ts"),
      "./main": path.resolve(__dirname, "main.ts"),
      "/main": path.resolve(__dirname, "main.ts"),
      main: path.resolve(__dirname, "main.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "shared-environment",
          setupFiles: ["test_files/unit/vitest.shared-environment.setup.ts"],
          include: sharedFiles,
          isolate: false,
        },
      },
      {
        extends: true,
        test: { name: "isolated-environment", include: isolatedFiles },
      },
    ],
    globals: true,
    environment: "jsdom",
    setupFiles: ["test_files/unit/vitest.setup.ts"],
    cache: false,
    // Worker threads start faster than the default child processes; each test
    // file still gets a fresh module graph and jsdom.
    pool: "threads",
    coverage: {
      provider: "v8",
      reporter: [
        "text",
        "text-summary",
        "html",
        "json",
        "json-summary",
        "lcov",
      ],
      reportsDirectory: "coverage",
      clean: true,
      cleanOnRerun: true,
      include: ["src/**/*.ts", "main.ts"],
      exclude: ["src/types/**", "src/styles/**", "src/**/*.d.ts"],
      thresholds: {
        lines: 55,
        branches: 45,
        functions: 50,
      },
    },
  },
});
