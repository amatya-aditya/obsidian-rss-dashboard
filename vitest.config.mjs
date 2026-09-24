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
    include: ["test_files/unit/**/*.test.ts"],
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
