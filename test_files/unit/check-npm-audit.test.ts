import { describe, expect, it } from "vitest";
import { findNpmAuditIssues } from "../../scripts/check-npm-audit.mjs";

const exception = {
  id: "GHSA-fc5q-39xc-vjpf",
  package: "picomatch",
  expires: "2026-12-02",
  reason: "No patched npm release is available yet.",
};

const activeDate = new Date("2026-11-18T12:00:00.000Z");

describe("findNpmAuditIssues", () => {
  it("accepts a high advisory only through its active exact exception", () => {
    const audit = {
      vulnerabilities: {
        picomatch: {
          severity: "high",
          via: [
            {
              name: "picomatch",
              severity: "high",
              url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
            },
          ],
        },
        vite: { severity: "high", via: ["picomatch"] },
      },
    };

    expect(findNpmAuditIssues(audit, [exception], activeDate)).toEqual([]);
  });

  it("fails any unrelated high advisory even when the exception is active", () => {
    const audit = {
      vulnerabilities: {
        picomatch: {
          severity: "high",
          via: [
            {
              name: "picomatch",
              severity: "high",
              url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
            },
          ],
        },
        vite: { severity: "high", via: ["picomatch"] },
        other: {
          severity: "high",
          via: [
            {
              name: "other",
              severity: "high",
              url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
            },
          ],
        },
      },
    };

    expect(findNpmAuditIssues(audit, [exception], activeDate)).toEqual([
      "other: GHSA-AAAA-BBBB-CCCC",
    ]);
  });

  it("fails an expired exception", () => {
    expect(
      findNpmAuditIssues(
        { vulnerabilities: {} },
        [exception],
        new Date("2026-12-03"),
      ),
    ).toEqual([
      "Expired npm audit exception GHSA-FC5Q-39XC-VJPF (expired 2026-12-02)",
    ]);
  });

  it("fails if the exception no longer matches a present advisory", () => {
    expect(
      findNpmAuditIssues({ vulnerabilities: {} }, [exception], activeDate),
    ).toEqual([
      "Stale npm audit exception GHSA-FC5Q-39XC-VJPF; remove it after the advisory is resolved",
    ]);
  });
});
