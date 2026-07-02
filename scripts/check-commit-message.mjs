import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const ESLINT_BIN = join(
  dirname(require.resolve("eslint/package.json")),
  "bin",
  "eslint.js",
);

function parseArgs(argv) {
  const options = { range: undefined, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--range") {
      options.range = argv[i + 1];
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }
  return options;
}

function isLikelyTextFile(filePath) {
  return /\.(?:[cm]?[jt]sx?|[cm]?js|ts|tsx|jsx|mjs|cjs)$/.test(filePath);
}

const DISALLOWED_DIRECTIVE_RULES = new Set([
  "@typescript-eslint/no-explicit-any",
  "obsidianmd/ui/sentence-case",
  "@typescript-eslint/no-deprecated",
  "no-restricted-imports",
]);

function parseDirectiveRules(ruleList) {
  return ruleList
    .split(/[,\s]+/)
    .map((rule) => rule.replace(/,$/, "").trim())
    .filter(Boolean);
}

function extractDirectiveFromLine(trimmedLine) {
  const lineMatch = trimmedLine.match(
    /^\/\/\s*eslint-disable-(?:next-line|line)\s+(.+)$/,
  );
  if (lineMatch) {
    return { rules: parseDirectiveRules(lineMatch[1]), text: trimmedLine };
  }

  const blockMatch = trimmedLine.match(
    /^\/\*\s*eslint-disable(?:-next-line|-line)?\s+(.+?)\s*\*\/$/,
  );
  if (blockMatch) {
    return { rules: parseDirectiveRules(blockMatch[1]), text: trimmedLine };
  }

  return null;
}

export function findUndescribedDirectiveComments(source) {
  const lines = source.split(/\r?\n/);

  return lines.flatMap((line, index) => {
    const trimmedLine = line.trim();
    const directive = extractDirectiveFromLine(trimmedLine);
    if (!directive) {
      return [];
    }

    const hasDisallowedRule = directive.rules.some((rule) =>
      DISALLOWED_DIRECTIVE_RULES.has(rule),
    );
    if (!hasDisallowedRule) {
      return [];
    }

    const hasDescription = /--\s*\S/.test(trimmedLine);
    if (hasDescription) {
      return [];
    }

    return [{ line: index + 1, text: trimmedLine }];
  });
}

function getTrackedStagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  );
  return output
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getFilesForRange(range) {
  try {
    const output = execFileSync("git", ["diff", "--name-only", range], {
      encoding: "utf8",
    });
    return output
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch (err) {
    console.error(`Failed to list files for range '${range}': ${err.message}`);
    console.error(
      "Ensure the specified range exists (for example run 'git fetch origin' or use a local range). Falling back to staged files.",
    );
    return [];
  }
}

function unique(array) {
  return Array.from(new Set(array));
}

function printUsage() {
  console.log(
    "Usage: node scripts/check-commit-message.mjs [--range <git-range>]",
  );
}

function runESLintOnFiles(files) {
  if (files.length === 0) {
    console.log("No staged or changed JS/TS files to lint.");
    return 0;
  }

  const args = [ESLINT_BIN, "--max-warnings=0", "--no-warn-ignored", ...files];
  try {
    execFileSync(process.execPath, args, { cwd: ROOT_DIR, stdio: "inherit" });
    return 0;
  } catch (err) {
    const code = err?.status ?? 1;
    return code;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  let files = [];
  if (options.range) {
    files = getFilesForRange(options.range);
    if (files.length === 0) {
      files = getTrackedStagedFiles();
    }
  } else {
    files = getTrackedStagedFiles();
  }

  files = files.filter(isLikelyTextFile).map((f) => f.replace(/\\\\/g, "/"));
  files = unique(files);

  const exitCode = runESLintOnFiles(files);
  process.exit(exitCode);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
