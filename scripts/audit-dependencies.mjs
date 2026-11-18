import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const advisoryUrl = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
const expires = Date.parse("2026-12-01T00:00:00Z");
const severities = new Set(["info", "low", "moderate", "high", "critical"]);

function isBlocking(severity) {
  return severity === "high" || severity === "critical";
}

function expandCauses(causes, vulnerabilities) {
  const affected = new Set(causes);
  let previousSize;
  do {
    previousSize = affected.size;
    for (const [name, finding] of Object.entries(vulnerabilities)) {
      if (finding.via.some((cause) => affected.has(cause))) affected.add(name);
    }
  } while (affected.size > previousSize);
  return affected;
}

/**
 * npm lists both advisories and dependency-derived findings. Keep unrelated
 * high and critical causes blocking even when a dependency also has this one.
 */
export function canAllowBeta6Audit(report, lockfile, now = Date.now()) {
  if (!Number.isFinite(now) || now >= expires || report?.error) return false;

  const { vulnerabilities, metadata, auditReportVersion } = report ?? {};
  if (
    auditReportVersion !== 2 ||
    !vulnerabilities ||
    typeof vulnerabilities !== "object"
  )
    return false;

  const entries = Object.entries(vulnerabilities);
  const allowed = new Set();
  const blocked = new Set();
  let high = 0;
  let critical = 0;

  for (const [name, finding] of entries) {
    if (
      !finding ||
      finding.name !== name ||
      !severities.has(finding.severity) ||
      !Array.isArray(finding.via) ||
      !finding.via.length ||
      !Array.isArray(finding.nodes) ||
      !finding.nodes.length
    )
      return false;
    if (finding.severity === "high") high++;
    if (finding.severity === "critical") critical++;

    for (const cause of finding.via) {
      if (typeof cause === "string") {
        if (!Object.hasOwn(vulnerabilities, cause)) return false;
        continue;
      }
      if (
        !cause ||
        !severities.has(cause.severity) ||
        typeof cause.url !== "string"
      )
        return false;
      if (!isBlocking(cause.severity)) continue;

      const devOnly = finding.nodes.every(
        (node) => lockfile?.packages?.[node]?.dev === true,
      );
      if (
        name === "picomatch" &&
        finding.severity === "high" &&
        cause.severity === "high" &&
        cause.url === advisoryUrl &&
        devOnly
      ) {
        allowed.add(name);
      } else {
        blocked.add(name);
      }
    }
  }

  if (
    !allowed.size ||
    metadata?.vulnerabilities?.high !== high ||
    metadata?.vulnerabilities?.critical !== critical
  )
    return false;

  const allowedNames = expandCauses(allowed, vulnerabilities);
  const blockedNames = expandCauses(blocked, vulnerabilities);
  return entries.every(
    ([name, finding]) =>
      !isBlocking(finding.severity) ||
      (finding.severity === "high" &&
        allowedNames.has(name) &&
        !blockedNames.has(name) &&
        finding.nodes.every(
          (node) => lockfile?.packages?.[node]?.dev === true,
        )),
  );
}

export function runFullDependencyAudit({ allowBeta6Exception = false } = {}) {
  const result = spawnSync("npm", ["audit", "--audit-level=high", "--json"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) console.error(result.error.message);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);

  if (!result.error && !result.signal && result.status === 0) return 0;

  if (
    allowBeta6Exception &&
    !result.error &&
    !result.signal &&
    result.status === 1
  ) {
    try {
      const report = JSON.parse(result.stdout);
      const lockfile = JSON.parse(
        readFileSync(join(root, "package-lock.json"), "utf8"),
      );
      if (canAllowBeta6Audit(report, lockfile)) {
        console.warn(
          "Temporary beta.6 audit exception applied to dev-only GHSA-fc5q-39xc-vjpf (expires 2026-12-01 UTC).",
        );
        return 0;
      }
    } catch (error) {
      console.error(
        `Unable to evaluate the beta.6 audit exception: ${error.message}`,
      );
    }
  }
  return 1;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  process.exitCode = runFullDependencyAudit({
    allowBeta6Exception:
      process.env.RSS_DASHBOARD_BETA6_AUDIT_EXCEPTION === "true",
  });
}
