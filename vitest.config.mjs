import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
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
        lines: 40,
        branches: 33,
        functions: 34,
      },
    },
  },
});
