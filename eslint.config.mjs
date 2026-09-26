// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

const TITLE_TOOLTIP_MESSAGE =
  "Use setTooltip(el, text) from 'obsidian' instead of a title attribute. Obsidian draws its tooltip from aria-label, so title shows a second, browser-drawn popup.";

export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "main.js",
      "*.mjs",
      "scripts/**/*.js",
      ".kilo/**",
      ".claude/**",
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
    // These scripts run only in Node during repository maintenance and are
    // never bundled into the mobile plugin runtime.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        console: "readonly",
        process: "readonly",
      },
    },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
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
        {
          selector: "TSAsExpression > TSAnyKeyword",
          message:
            "Avoid 'as any' casts. Use a specific type, 'as unknown as T', or '@ts-expect-error' with a comment.",
        },
        // Tooltips: Obsidian draws its tooltip from aria-label (which is all
        // setTooltip() sets), so a title attribute adds a second popup.
        {
          selector:
            "CallExpression[callee.property.name=/^(setAttr|setAttribute)$/][arguments.0.value='title']",
          message: TITLE_TOOLTIP_MESSAGE,
        },
        {
          selector:
            "Property[key.name='attr'] > ObjectExpression > Property:matches([key.name='title'], [key.value='title'])",
          message: TITLE_TOOLTIP_MESSAGE,
        },
        {
          selector:
            "CallExpression[callee.property.name=/^create(El|Div|Span)$/] > ObjectExpression > Property[key.name='title']",
          message: TITLE_TOOLTIP_MESSAGE,
        },
        {
          selector:
            "AssignmentExpression[left.property.name='title']:matches([left.object.name=/(El|Button|Btn|Icon|Badge|Chip|Tag|Toggle)$/], [left.object.property.name=/(El|Button|Btn|Icon|Badge|Chip|Tag|Toggle)$/])",
          message: TITLE_TOOLTIP_MESSAGE,
        },
        {
          selector:
            "ObjectExpression:has(> Property[key.value='aria-label']):has(> Property[key.name='title'])",
          message: TITLE_TOOLTIP_MESSAGE,
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
          brands: ["Obsidian", "Inoreader", "RSS Dashboard"],
          allowAutoFix: true,
        },
      ],
      // Tests intentionally use jsdom/native DOM, Node fixtures, and same-window
      // assertions. Production code remains covered by these Obsidian rules.
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/prefer-instanceof": "off",
      "obsidianmd/prefer-window-timers": "off",
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
      "no-restricted-globals": [
        "error",
        {
          name: "document",
          message:
            "Use 'activeDocument' instead of 'document' for popout window compatibility.",
        },
      ],
      "obsidianmd/ui/sentence-case": [
        "error",
        {
          acronyms: ["OPML", "XML", "API", "CORS", "URI", "URL", "RSS", "JSON"],
          brands: ["Obsidian", "Inoreader"],
          ignoreRegex: [
            "^\\d+(?:\\.\\d+)?x$",
            "^\\d+ (?:day|days|week|weeks|month|months|year|years|item|items|minute|minutes|hour|hours)$",
            "^https?://",
          ],
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
      "no-case-declarations": "warn",
      "no-useless-escape": "warn",
      "obsidianmd/settings-tab/no-manual-html-headings": "warn",
      "obsidianmd/no-static-styles-assignment": "error",
      "obsidianmd/platform": "error",
      "obsidianmd/prefer-create-el": "error",
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
  {
    // Architecture guardrails (#253, #436). Existing violations are recorded
    // in eslint-suppressions.json; new ones fail the build. Prune it with
    // `npx eslint . --prune-suppressions` after a refactor removes one.
    files: ["main.ts", "src/**/*.ts"],
    rules: {
      "max-lines-per-function": [
        "error",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      complexity: ["error", 20],
    },
  },
  {
    files: ["src/settings/settings-tab.ts"],
    rules: {
      // Obsidian 1.8.7 through 1.12.x need this imperative renderer and its
      // refresh bridge. Keep deprecation checking enabled outside this file.
      "@typescript-eslint/no-deprecated": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
]);
