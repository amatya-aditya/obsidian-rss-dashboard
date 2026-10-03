// Obsidian's global DOM helpers (`createDiv`, `addClass`, `win`, and so on) come
// from the real `obsidian.d.ts`, so tests are type-checked against the same
// declarations as production code (#362). The runtime versions are installed
// by `unit/test-dom-polyfills.ts`.
import type {} from "obsidian-api";
