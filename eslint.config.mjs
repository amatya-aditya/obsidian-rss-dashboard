// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "main.js",
      "*.mjs",
      "scripts/**/*.js",
      "scripts/**/*.mjs",
      ".kilo/**",
      ".tmp-*",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    // Disable dependency ban for package.json - builtin-modules is part of standard Obsidian template
    files: ["package.json"],
    rules: {
      "depend/ban-dependencies": "off",
    },
  },
  {
    files: ["scripts/check-platform-compat.mjs", "scripts/check-css-important.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "fs",
              message:
                "Direct fs module usage is prohibited. Use vault.read/vault.modify or browser File APIs.",
            },
            {
              name: "path",
              message:
                "Direct path module usage is prohibited. Use Obsidian adapter paths or TFile/TFolder APIs.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='createElement'][arguments.0.value='script']",
          message:
            "Dynamic <script> element creation is prohibited per Obsidian compliance standards.",
        },
      ],
    },
  },
  {
    files: ["test_files/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./test_files/tsconfig.json" },
      globals: {
        ...globals.browser,
        activeWindow: "readonly",
        activeDocument: "readonly",
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          acronyms: ["OPML", "XML", "API", "CORS", "URI", "URL", "RSS"],
          brands: ["Obsidian"],
          allowAutoFix: true,
        },
      ],
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    files: ["**/*.ts"],
    ignores: ["test_files/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        ...globals.browser,
        activeWindow: "readonly",
        activeDocument: "readonly",
      },
    },

    rules: {
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          acronyms: ["OPML", "XML", "API", "CORS", "URI", "URL", "RSS", "JSON"],
          brands: ["Obsidian"],
          allowAutoFix: true,
        },
      ],

      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/unbound-method": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-case-declarations": "warn",
      "no-useless-escape": "warn",
      "obsidianmd/settings-tab/no-manual-html-headings": "warn",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/platform": "error",
      "obsidianmd/prefer-file-manager-trash-file": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
