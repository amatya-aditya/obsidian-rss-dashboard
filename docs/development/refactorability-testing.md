# Refactorability Testing Guide

This document provides guidelines for measuring and improving code refactorability in the RSS Dashboard plugin, with specific considerations for Obsidian plugins.

## Current Project State

### Test Coverage

- **Framework:** Vitest with jsdom environment
- **Test Count:** 61 tests (all passing)
- **Coverage Areas:** Feed parsing, encoding detection, URL redirection, YouTube integration

### Codebase Overview

- **Total Classes:** 30+ exported classes
- **Module Structure:** Components, Services, Views, Modals, Utils
- **Build Output:** Single `main.js` (required by Obsidian)

---

## Industry Standards

### ISO/IEC 25010 Maintainability Metrics

| Metric            | Description               | Target      |
| ----------------- | ------------------------- | ----------- |
| **Analysability** | Ease of diagnosing issues | Score > 0.8 |
| **Modifiability** | Ease of making changes    | Score > 0.8 |
| **Testability**   | Ease of verifying changes | Score > 0.8 |

### SonarQube Rating Thresholds

| Rating | Cognitive Complexity | Cyclomatic Complexity | Duplication |
| ------ | -------------------- | --------------------- | ----------- |
| **A**  | 0-15                 | 1-10                  | 0-3%        |
| **B**  | 16-30                | 11-20                 | 3-5%        |
| **C**  | 31-60                | 21-40                 | 5-10%       |
| **D**  | 60+                  | 40+                   | 10%+        |

---

## Obsidian Plugin Considerations

### Architectural Constraints

1. **Single Entry Point:** Obsidian requires `main.js` as the sole entry point
   - All source code is bundled into one file
   - This differs from typical web apps with multiple entry points
2. **Global API Access:** Limited to Obsidian's exposed APIs
   - Cannot use ES modules in production
   - Must use bundled code approach

3. **Build Output Requirements:**
   - `main.js` - Bundled plugin code
   - `manifest.json` - Plugin metadata
   - `styles.css` - Plugin stylesheets

### Recommended File Sizes

| File Type           | Max LOC | Rationale          |
| ------------------- | ------- | ------------------ |
| **main.ts (entry)** | 300-500 | Orchestration only |
| **Components**      | 300-400 | UI logic           |
| **Services**        | 400-600 | Business logic     |
| **Views**           | 400-600 | View controllers   |
| **Utils**           | 200-300 | Pure functions     |
| **Modals**          | 300-500 | Dialog logic       |

### Current File Analysis

Largest source files requiring attention:

| File                               | Approx. LOC | Issue                                |
| ---------------------------------- | ----------- | ------------------------------------ |
| `src/components/sidebar.ts`        | ~2000+      | Multiple responsibilities            |
| `src/components/article-list.ts`   | ~2500+      | Large UI component                   |
| `src/modals/feed-manager-modal.ts` | ~1500+      | Modal with many features             |
| `src/services/feed-parser.ts`      | ~2900+      | Core service (complex but necessary) |
| `src/views/dashboard-view.ts`      | ~2000+      | Main view                            |
| `src/settings/settings-tab.ts`     | ~2500+      | Settings management                  |

---

## Available Testing Tools

### ESLint Configuration

The project uses ESLint with TypeScript support. Recommended rules for refactorability:

```javascript
// Recommended additions to eslint.config.mjs
{
  rules: {
    "max-len": ["warn", { "code": 100, "comments": 120 }],
    "max-lines-per-function": ["warn", { "max": 25, "skipBlankLines": true }],
    "max-depth": ["warn", 4],
    "complexity": ["warn", 12],
    "no-magic-numbers": ["warn", { "ignore": [-1, 0, 1, 2] }],
  }
}
```

### Recommended NPM Packages

```bash
# Complexity analysis
npm install --save-dev ts-complexity

# Dependency analysis
npm install --save-dev dependency-cruiser

# Circular dependency detection
npm install --save-dev madge
```

---

## Refactorability Score Calculation

### Formula

```
Refactorability Score = (Size Score × 0.25) + (Complexity Score × 0.35) + (Coupling Score × 0.25) + (Test Coverage × 0.15)
```

### Component Scores

| Score Range | Rating         | Action                 |
| ----------- | -------------- | ---------------------- |
| **80-100**  | A - Excellent  | Maintain               |
| **65-79**   | B - Good       | Minor improvements     |
| **50-64**   | C - Needs Work | Plan refactoring       |
| **35-49**   | D - Concerning | Prioritize refactoring |
| **0-34**    | E - Critical   | Immediate action       |

### Metrics Collection

Create a script to track metrics:

```typescript
// scripts/refactorability-metrics.ts
interface FileMetrics {
  path: string;
  linesOfCode: number;
  functionCount: number;
  maxComplexity: number;
  avgComplexity: number;
  exportCount: number;
  testCoverage: number;
  score: number;
}

function calculateScore(metrics: FileMetrics): number {
  const sizeScore = Math.max(0, 100 - metrics.linesOfCode / 10);
  const complexityScore = Math.max(0, 100 - metrics.maxComplexity * 3);
  const exportScore = Math.max(0, 100 - metrics.exportCount * 2);
  const testScore = metrics.testCoverage;

  return (
    sizeScore * 0.25 +
    complexityScore * 0.35 +
    exportScore * 0.25 +
    testScore * 0.15
  );
}
```

---

## Recommendations

### Immediate Actions

1. **Add ESLint complexity rules** to catch issues early
2. **Create refactorability test** to track file scores over time
3. **Increase test coverage** for services (currently minimal)

### Short-Term Goals

1. **Split large components:**
   - `sidebar.ts` → Extract sidebar-search, sidebar-tags, sidebar-filters
   - `feed-manager-modal.ts` → Split add/edit/delete into separate handlers

2. **Improve test coverage:**
   - Services: MediaService, HighlightService, ArticleSaver
   - Utils: validation, tag-utils, settings-migration

3. **Add complexity monitoring** in CI pipeline

### Long-Term Architecture

```
src/
├── components/           # UI components (split further)
│   ├── sidebar/         # Each component in own directory
│   ├── article-list/
│   └── modals/
├── services/            # Business logic (test coverage priority)
├── views/               # View controllers
├── hooks/               # Custom hooks (if needed)
├── types/               # TypeScript definitions
└── utils/               # Helper functions (group by concern)
```

---

## CI Integration

### GitHub Actions Example

```yaml
name: Code Quality
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Run ESLint
        run: npm run lint

      - name: Run Tests
        run: npm run test:unit

      - name: Check Complexity
        run: |
          npx ts-complexity --threshold 12
          npx depcruise src/ --output-type err
```

---

## Contributing Guidelines

When contributing new code:

1. **Keep functions under 25 lines**
2. **Limit exports per file to 10 or fewer**
3. **Add tests for new services**
4. **Run `npm run lint` before committing**
5. **Check complexity scores for new files**

### Code Review Checklist

- [ ] No function exceeds 25 lines
- [ ] No file exceeds 400 lines
- [ ] Cyclomatic complexity under 12
- [ ] Tests added for new logic
- [ ] No duplicate code (extract to utils)
- [ ] ESLint passes without warnings

---

## References

- [ISO/IEC 25010:2011](https://www.iso.org/standard/35733.html) - Software product quality requirements
- [SonarQube Metrics](https://docs.sonarqube.org/latest/user-guide/metric-definitions/)
- [ESLint Complexity Rules](https://eslint.org/docs/rules/complexity)
- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Index)

---

_Last Updated: 2026-03-21_
