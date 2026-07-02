import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = join(import.meta.dirname, "..");
const STYLES_DIR = join(ROOT_DIR, "src", "styles");

function listCssFiles(dirPath, results = []) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      listCssFiles(fullPath, results);
    } else if (entry.toLowerCase().endsWith(".css")) {
      results.push(fullPath);
    }
  }
  return results;
}

export function findImportantWithoutAuditComment(source, filePath = "unknown") {
  const lines = source.split(/\r?\n/);
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/:\s*[^;{}]*!important/i.test(line)) {
      continue;
    }

    if (/audit-ok\s*:/.test(line)) {
      continue;
    }

    violations.push({
      filePath,
      line: index + 1,
      text: line.trim(),
    });
  }

  return violations;
}

function main() {
  const cssFiles = listCssFiles(STYLES_DIR);

  const violations = [];

  for (const absolutePath of cssFiles) {
    const filePath = relative(ROOT_DIR, absolutePath).replace(/\\/g, "/");
    const source = readFileSync(absolutePath, "utf8");
    violations.push(...findImportantWithoutAuditComment(source, filePath));
  }

  if (violations.length > 0) {
    console.error(
      `CSS !important check failed: ${violations.length} declaration(s) missing an audit-ok comment.`,
    );
    for (const violation of violations) {
      console.error(`- ${violation.filePath}:${violation.line} ${violation.text}`);
    }
    process.exit(1);
  }

  console.log(`CSS !important check passed (${cssFiles.length} file(s)).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
