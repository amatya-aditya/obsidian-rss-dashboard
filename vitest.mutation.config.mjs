// Vitest config for the opt-in mutation run (`npm run test:mutation`).
//
// It reuses the repository's real `vitest.config.mjs` (same two projects, same
// source-based shared/isolated split, same `obsidian` stub alias and jsdom
// setup) but narrows each project's `include` to the test files that cover the
// two mutated pipelines, so the mutation dry run and per-mutant runs stay
// bounded. It is not used by `npm run test:unit` or any CI gate; see the
// "Mutation testing" section of
// docs/development/test_coverage/testing-guide.md.
import base from "./vitest.config.mjs";

const MUTATION_TEST_FILES = new Set([
  "test_files/unit/main/feed-refresh-pipeline.test.ts",
  "test_files/unit/main/feed-refresh.characterization.test.ts",
  "test_files/unit/main/feed-operation.characterization.test.ts",
  "test_files/unit/services/feed-refresh-scheduler.test.ts",
  "test_files/unit/services/feed-refresh-scheduler-pending.test.ts",
  "test_files/unit/services/feed-operation-tracker.test.ts",
  "test_files/unit/services/article-saver.test.ts",
  "test_files/unit/services/article-saver.characterization.test.ts",
]);

const projects = base.test.projects
  .map((project) => ({
    ...project,
    test: {
      ...project.test,
      include: (project.test.include ?? []).filter((file) =>
        MUTATION_TEST_FILES.has(file),
      ),
    },
  }))
  .filter((project) => project.test.include.length > 0);

const missing = [...MUTATION_TEST_FILES].filter(
  (file) => !projects.some((project) => project.test.include.includes(file)),
);

if (missing.length > 0) {
  throw new Error(
    `Mutation spike config did not resolve these test files: ${missing.join(", ")}`,
  );
}

export default {
  ...base,
  test: {
    ...base.test,
    projects,
  },
};
