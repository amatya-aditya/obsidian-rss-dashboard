# P0-2: Article Saver Service Tests — Handoff Prompt

## Context

This is a continuation of the test coverage improvement plan for the obsidian-rss-dashboard plugin. P0-1 (plugin lifecycle tests) has been completed with 42 test cases.

## Task

Create test file for P0-2: Article Saver Service at `test_files/unit/services/article-saver.test.ts`

## Target File

`src/services/article-saver.ts`

## Current Coverage

0% — no existing tests

## Target Coverage

90%

## Why This Matters

Article saving is a core user workflow with data loss potential if broken.

---

## Scenarios to Cover

### 1. saveArticle()

```typescript
describe("saveArticle")
  ├── should generate markdown with template variables
  ├── should handle missing optional fields gracefully
  ├── should write file to correct vault path
  ├── should return TFile on success
  └── should throw on write failure
```

### 2. saveArticleWithFullContent()

```typescript
describe("saveArticleWithFullContent")
  ├── should fetch full article content
  ├── should apply custom template
  ├── should handle fetch timeout
  └── should handle invalid HTML gracefully
```

### 3. verifyAllSavedArticles()

```typescript
describe("verifyAllSavedArticles")
  ├── should mark unsaved articles that have files
  ├── should unmark saved articles with missing files
  └── should handle path conflicts
```

---

## Available Mocks

Use `test_files/stubs/obsidian.ts` which now includes:

- `MockDataVault` — File operations (create, read, delete, modify)
- `MockEvent` — Event system emulation
- `App.createMock()` — Factory for fresh instances
- `TFile`, `TFolder` — File system mocks

### Example Usage

```typescript
import { MockDataVault, TFile } from "../stubs/obsidian";

const vault = new MockDataVault();
const file = await vault.create("/path/to/article.md", "# Content");
```

---

## Test Structure

Create: `test_files/unit/services/article-saver.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockDataVault, App, TFile } from "../stubs/obsidian";

// Mock dependencies
vi.mock("../stubs/obsidian", async () => {
  const actual = await vi.importActual("../stubs/obsidian");
  return { ...actual };
});

describe("ArticleSaver", () => {
  let mockApp: App;
  let articleSaver: any;

  beforeEach(() => {
    mockApp = App.createMock();
    // Import the actual article-saver module
    // Note: May need to mock fetch for saveArticleWithFullContent
  });

  describe("saveArticle", () => {
    // Test cases here
  });

  // ... other describe blocks
});
```

---

## Est. New Tests

15-20 test cases

## Risk Level

**Critical** — data loss potential

---

## Reference Files

- Target: `src/services/article-saver.ts`
- Test location: `test_files/unit/services/article-saver.test.ts`
- Stubs: `test_files/stubs/obsidian.ts`
- Previous work: P0-1 in `test_files/unit/main/plugin-lifecycle.test.ts`
