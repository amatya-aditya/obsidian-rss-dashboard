import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.resolve(__dirname, "test_files/stubs/obsidian.ts"),
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
