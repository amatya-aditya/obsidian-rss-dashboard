import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");

const ALLOWLIST_PREFIXES = ["test_files/"];

const TIMER_METHODS = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
];

function listTypeScriptFiles(dirPath, results = []) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      listTypeScriptFiles(fullPath, results);
    } else if (entry.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

function getProductionFiles() {
  const mainPath = join(ROOT_DIR, "main.ts");
  const srcDir = join(ROOT_DIR, "src");
  const files = [mainPath, ...listTypeScriptFiles(srcDir)];
  return files.map((filePath) => relative(ROOT_DIR, filePath).replace(/\\/g, "/"));
}

function isAllowlisted(filePath) {
  return ALLOWLIST_PREFIXES.some((prefix) => filePath.startsWith(prefix));
}

function parseRulesFromLine(line) {
  const findings = [];

  for (const method of TIMER_METHODS) {
    if (line.includes(`activeWindow.${method}`)) {
      findings.push({
        rule: "activeWindow-timer",
        message: `Use window.${method}() instead of activeWindow.${method}() for popout window compatibility.`,
      });
    }

    const barePattern = new RegExp(`(?<![.\\w])${method}\\s*\\(`);
    if (barePattern.test(line) && !line.includes(`window.${method}`)) {
      findings.push({
        rule: "bare-timer",
        message: `Use window.${method}() instead of bare ${method}() for popout window compatibility.`,
      });
    }
  }

  if (/\bglobalThis\b/.test(line) && !line.trim().startsWith("//")) {
    findings.push({
      rule: "globalThis",
      message: "Avoid globalThis; use window or activeWindow for popout window compatibility.",
    });
  }

  if (/\bdocument\./.test(line) && !line.includes("activeDocument")) {
    findings.push({
      rule: "document",
      message: "Use activeDocument instead of document for popout window compatibility.",
    });
  }

  return findings;
}

export function findPlatformCompatViolations(source, filePath = "unknown") {
  if (isAllowlisted(filePath)) {
    return [];
  }

  const lines = source.split(/\r?\n/);
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      continue;
    }

    for (const finding of parseRulesFromLine(line)) {
      violations.push({
        filePath,
        line: index + 1,
        text: trimmed,
        ...finding,
      });
    }
  }

  return violations;
}

function main() {
  const files = getProductionFiles();
  const violations = [];

  for (const filePath of files) {
    const absolutePath = join(ROOT_DIR, filePath);
    const source = readFileSync(absolutePath, "utf8");
    violations.push(...findPlatformCompatViolations(source, filePath));
  }

  if (violations.length > 0) {
    console.error(
      `Platform compatibility check failed: ${violations.length} violation(s).`,
    );
    for (const violation of violations) {
      console.error(
        `- ${violation.filePath}:${violation.line} [${violation.rule}] ${violation.message}`,
      );
      console.error(`  ${violation.text}`);
    }
    process.exit(1);
  }

  console.log(`Platform compatibility check passed (${files.length} file(s)).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
