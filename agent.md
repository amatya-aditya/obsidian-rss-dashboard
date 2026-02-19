# AGENT.md

This file provides a concise navigation guide and essential rules for AI agents working on the **rss-dashboard** Obsidian plugin.

## Essential Rules (Non-Negotiable)

- **Conventional Commits**: Always use the Conventional Commits format for commit messages (e.g., `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- **TypeScript First**: This is a TypeScript project. Always edit `.ts` files in the `src/` directory, not the compiled `main.js`.
- **Obsidian API**: Refer to the `obsidian` library for API details.

## Project Structure Overview

- **`src/`**: TypeScript source files.
  - `main.ts`: Plugin entry point.
- **`styles.css`**: Plugin styles.
- **`manifest.json`**: Plugin metadata.
- **`main.js`**: Compiled output (do not edit directly).
- **`package.json`**: Project dependencies and scripts.

## Essential Commands

- **Development Build**: `npm run dev` (watches for changes).
- **Production Build**: `npm run build`.
- **Linting**: `npm run lint`.
