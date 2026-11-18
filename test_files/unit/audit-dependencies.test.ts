import { describe, expect, it } from "vitest";
import { canAllowBeta6Audit } from "../../scripts/audit-dependencies.mjs";

const date = Date.parse("2026-11-17T00:00:00Z");
const exception = {
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high",
};

function report() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      picomatch: {
        name: "picomatch",
        severity: "high",
        nodes: ["node_modules/picomatch"],
        via: [exception],
      },
      vite: {
        name: "vite",
        severity: "high",
        nodes: ["node_modules/vite"],
        via: ["picomatch", "tooling"],
      },
      tooling: {
        name: "tooling",
        severity: "moderate",
        nodes: ["node_modules/tooling"],
        via: [
          {
            url: "https://example.org/moderate-advisory",
            severity: "moderate",
          },
        ],
      },
    },
    metadata: { vulnerabilities: { high: 2, critical: 0 } },
  };
}

const devLock = {
  packages: {
    "node_modules/picomatch": { dev: true },
    "node_modules/vite": { dev: true },
  },
};

describe("beta.6 development audit exception", () => {
  it("covers the advisory and findings derived from it alongside moderate findings", () => {
    expect(canAllowBeta6Audit(report(), devLock, date)).toBe(true);
  });

  it.each(["high", "critical"])(
    "keeps unrelated %s findings blocking",
    (severity) => {
      const audit = report();
      audit.vulnerabilities.tooling.severity = severity;
      audit.vulnerabilities.tooling.via[0].severity = severity;
      if (severity === "high") audit.metadata.vulnerabilities.high++;
      else audit.metadata.vulnerabilities.critical++;
      expect(canAllowBeta6Audit(audit, devLock, date)).toBe(false);
    },
  );

  it("rejects a different advisory on the same package", () => {
    const audit = report();
    audit.vulnerabilities.picomatch.via.push({
      url: "https://example.org/other-high-advisory",
      severity: "high",
    });
    expect(canAllowBeta6Audit(audit, devLock, date)).toBe(false);
  });

  it("requires every affected install to be dev-only", () => {
    const packages = {
      ...devLock.packages,
      "node_modules/vite": { dev: false },
    };
    expect(canAllowBeta6Audit(report(), { packages }, date)).toBe(false);
  });

  it("rejects an expired exception and audit errors", () => {
    expect(
      canAllowBeta6Audit(report(), devLock, Date.parse("2026-12-01T00:00:00Z")),
    ).toBe(false);
    expect(canAllowBeta6Audit({ ...report(), error: {} }, devLock, date)).toBe(
      false,
    );
    expect(canAllowBeta6Audit(null, devLock, date)).toBe(false);
  });
});
