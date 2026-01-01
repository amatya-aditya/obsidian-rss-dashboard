// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig([
  {
    ignores: ["node_modules/**", "main.js", "*.mjs"],
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
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        ...globals.browser,
      },
    },

    rules: {
      // ============================================
      // DISABLED - Would require major refactoring
      // ============================================
      
    //   // Floating promises - very common in Obsidian plugins with event handlers
    //   "@typescript-eslint/no-floating-promises": "off",
      
    //   // Misused promises in callbacks - common pattern in Obsidian
    //   "@typescript-eslint/no-misused-promises": "off",
      
    //   // Unsafe any usage - would require extensive type fixes
    //   "@typescript-eslint/no-unsafe-assignment": "off",
    //   "@typescript-eslint/no-unsafe-member-access": "off",
    //   "@typescript-eslint/no-unsafe-call": "off",
    //   "@typescript-eslint/no-unsafe-argument": "off",
    //   "@typescript-eslint/no-unsafe-return": "off",
      
    //   // Unnecessary type assertions - minor issue
    //   "@typescript-eslint/no-unnecessary-type-assertion": "off",
      
    //   // Restrict template expressions - minor issue
    //   "@typescript-eslint/restrict-template-expressions": "off",
      
    //   // Await non-promise - can be intentional
    //   "@typescript-eslint/await-thenable": "off",
      
    //   // Unbound method - too strict for Obsidian patterns
    //   "@typescript-eslint/unbound-method": "off",
      
    //   // Base to string - minor issue
    //   "@typescript-eslint/no-base-to-string": "off",

    //   // ============================================
    //   // WARNINGS - Good to fix but not blocking
    //   // ============================================
      
    //   // Unused variables - prefix with _ to ignore
    //   "@typescript-eslint/no-unused-vars": ["warn", { 
    //     "argsIgnorePattern": "^_",
    //     "varsIgnorePattern": "^_",
    //     "caughtErrorsIgnorePattern": "^_"
    //   }],
      
    //   // Unused expressions
    //   "@typescript-eslint/no-unused-expressions": "warn",
      
    //   // Empty blocks (empty catch statements)
    //   "no-empty": ["warn", { "allowEmptyCatch": true }],
      
    //   // Case declarations - should wrap in blocks
    //   "no-case-declarations": "warn",
      
    //   // Useless escapes in regex
    //   "no-useless-escape": "warn",

    //   // ============================================
    //   // OBSIDIAN-SPECIFIC RULES - Keep as warnings
    //   // ============================================
      
    //   // UI sentence case - good practice but not critical
    //   "obsidianmd/ui/sentence-case": "warn",
      
    //   // Settings headings - good practice
    //   "obsidianmd/settings-tab/no-manual-html-headings": "warn",
      
    //   // Static styles - good practice
    //   "obsidianmd/no-static-styles-assignment": "warn",
      
    //   // Platform detection - good practice
    //   "obsidianmd/platform": "warn",
      
    //   // File manager trash - good practice
    //   "obsidianmd/prefer-file-manager-trash-file": "warn",
      
    //   // Dependency warnings - builtin-modules is part of standard Obsidian template
    //   "depend/ban-dependencies": "off",
    },
  },
]);
