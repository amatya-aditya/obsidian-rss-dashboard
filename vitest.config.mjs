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
      // Also handle simpler relative path patterns
      "../main": path.resolve(__dirname, "main.ts"),
      "./main": path.resolve(__dirname, "main.ts"),
      // As fallback, match any path ending in /main
      "/main": path.resolve(__dirname, "main.ts"),
      main: path.resolve(__dirname, "main.ts"),
    },
  },
  test: {
    include: ["test_files/unit/**/*.test.ts"],
    globals: true,
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/types/**", "src/styles/**", "src/**/*.d.ts"],
      thresholds: {
        lines: 40,
        branches: 30,
        functions: 50,
      },
    },
  },
});
