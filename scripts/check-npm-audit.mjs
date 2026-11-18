import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT_DIR = join(import.meta.dirname, "..");
const EXCEPTIONS_PATH = join(ROOT_DIR, "scripts", "npm-audit-exceptions.json");
const AUDIT_LEVELS = new Set(["high", "critical"]);

function advisoryId(advisory) {
  if (typeof advisory?.url !== "string") {
    return null;
  }

  return /GHSA-[\w-]+/i.exec(advisory.url)?.[0]?.toUpperCase() ?? null;
}

function collectHighAdvisories(
  packageName,
  vulnerabilities,
  visiting = new Set(),
) {
  if (visiting.has(packageName)) {
    return new Set();
  }

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) {
    return new Set();
  }

  const nextVisiting = new Set(visiting).add(packageName);
  const advisories = new Set();
  for (const via of vulnerability.via ?? []) {
    if (typeof via === "string") {
      for (const id of collectHighAdvisories(
        via,
        vulnerabilities,
        nextVisiting,
      )) {
        advisories.add(id);
      }
      continue;
    }

    if (AUDIT_LEVELS.has(via.severity)) {
      advisories.add(advisoryId(via) ?? `unknown:${via.name ?? packageName}`);
    }

    if (typeof via.name === "string") {
      for (const id of collectHighAdvisories(
        via.name,
        vulnerabilities,
        nextVisiting,
      )) {
        advisories.add(id);
      }
    }
  }

  return advisories;
}

/** Return high/critical audit findings that are not covered by a current exception. */
export function findNpmAuditIssues(audit, exceptions, now = new Date()) {
  const vulnerabilities = audit?.vulnerabilities ?? {};
  const exceptionsById = new Map();
  const issues = [];
  const matchedExceptions = new Set();

  for (const exception of exceptions ?? []) {
    const id = String(exception.id ?? "").toUpperCase();
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(exception.expires)
      ? new Date(`${exception.expires}T23:59:59.999Z`)
      : null;

    if (
      !id ||
      !exception.package ||
      !exception.reason ||
      !expiry ||
      Number.isNaN(expiry.valueOf())
    ) {
      issues.push(`Invalid npm audit exception: ${JSON.stringify(exception)}`);
      continue;
    }

    if (now > expiry) {
      issues.push(
        `Expired npm audit exception ${id} (expired ${exception.expires})`,
      );
      continue;
    }

    exceptionsById.set(id, exception);
  }

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (!AUDIT_LEVELS.has(vulnerability.severity)) {
      continue;
    }

    const ids = collectHighAdvisories(packageName, vulnerabilities);
    if (ids.size === 0) {
      issues.push(
        `${packageName} has a high or critical finding without an advisory ID`,
      );
      continue;
    }

    const unexceptedIds = [];
    for (const id of ids) {
      const exception = exceptionsById.get(id);
      if (!exception) {
        unexceptedIds.push(id);
        continue;
      }

      if (
        id === String(exception.id).toUpperCase() &&
        packageName === exception.package
      ) {
        matchedExceptions.add(id);
      }
    }

    if (unexceptedIds.length > 0) {
      issues.push(`${packageName}: ${unexceptedIds.join(", ")}`);
    }
  }

  for (const id of exceptionsById.keys()) {
    if (!matchedExceptions.has(id)) {
      issues.push(
        `Stale npm audit exception ${id}; remove it after the advisory is resolved`,
      );
    }
  }

  return issues;
}

function main() {
  const npmCli = process.env.npm_execpath;
  const auditArgs = ["audit", "--audit-level=high", "--json"];
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...auditArgs], {
        cwd: ROOT_DIR,
        encoding: "utf8",
      })
    : spawnSync("npm", auditArgs, {
        cwd: ROOT_DIR,
        encoding: "utf8",
        shell: process.platform === "win32",
      });

  let audit;
  try {
    audit = JSON.parse(result.stdout ?? "");
  } catch {
    console.error("npm audit did not return a parseable JSON report.");
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    process.exit(1);
  }

  if (result.error || (result.status !== 0 && result.status !== 1)) {
    console.error(
      `npm audit could not complete (exit ${result.status ?? "unknown"}).`,
    );
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    process.exit(1);
  }

  const exceptions = JSON.parse(
    readFileSync(EXCEPTIONS_PATH, "utf8"),
  ).exceptions;
  const issues = findNpmAuditIssues(audit, exceptions);
  const counts = audit.metadata?.vulnerabilities ?? {};
  console.log(
    `npm audit: ${counts.total ?? "unknown"} vulnerabilities ` +
      `(${counts.moderate ?? 0} moderate, ${counts.high ?? 0} high, ${counts.critical ?? 0} critical).`,
  );

  if (issues.length > 0) {
    console.error("Unaccepted high or critical npm audit findings:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  for (const exception of exceptions) {
    console.log(
      `Accepted ${exception.id} for ${exception.package} through ${exception.expires}: ${exception.reason}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
