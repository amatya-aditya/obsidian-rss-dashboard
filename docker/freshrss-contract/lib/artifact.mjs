/**
 * Builds the sanitized CI artifact for a FreshRSS Docker contract run.
 *
 * Per the ticket's acceptance criteria, the artifact must record the image
 * tag/digest, the reported FreshRSS version/build, which API paths were
 * exercised, readiness, and per-scenario results — and must never contain a
 * credential, auth header, session token, or modification token. This
 * module is the single choke point that assembles that JSON, so the
 * redaction rule only needs to be correct in one place.
 */

const FORBIDDEN_KEY_PATTERN = /(password|passwd|secret|token|auth|session|cookie)/i;

/**
 * Recursively asserts that no key in `value` holds a *string* that looks
 * like it could be a credential/session/token value. A key merely
 * describing that such a probe ran (e.g. the boolean readiness flag
 * `modificationTokenProbe: true`) is fine and is not flagged — only an
 * actual string value under a secret-shaped key is refused, since that is
 * the concrete leak this guards against. Throws instead of silently
 * dropping fields, so a future contributor who accidentally adds a real
 * secret string to the artifact gets a loud failure instead of quiet
 * redaction.
 */
export function assertNoSecretShapedKeys(value, pathPrefix = "artifact") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretShapedKeys(entry, `${pathPrefix}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEY_PATTERN.test(key) && typeof entry === "string") {
        throw new Error(
          `Refusing to build FreshRSS contract artifact: "${pathPrefix}.${key}" is a string under a credential/session/token-shaped key.`,
        );
      }
      assertNoSecretShapedKeys(entry, `${pathPrefix}.${key}`);
    }
  }
}

/**
 * @param {{
 *   image: { reference: string, tag: string, digest: string },
 *   freshRssVersion: string | null,
 *   readiness: { reachable: boolean, clientLogin: boolean, readProbe: boolean, modificationTokenProbe: boolean, fixtureDataObserved: boolean },
 *   exercisedApiPaths: string[],
 *   scenarios: Array<{ name: string, passed: boolean, detail?: string }>,
 *   startedAt: string,
 *   finishedAt: string,
 *   findings?: string[],
 * }} input
 */
export function buildContractArtifact(input) {
  const artifact = {
    schemaVersion: 1,
    image: {
      reference: input.image.reference,
      tag: input.image.tag,
      digest: input.image.digest,
    },
    freshRssVersion: input.freshRssVersion,
    readiness: { ...input.readiness },
    exercisedApiPaths: [...input.exercisedApiPaths].sort(),
    scenarios: input.scenarios.map((scenario) => ({ ...scenario })),
    // Ticket 12: non-blocking, human-readable notes about a real, observed
    // discrepancy between this harness's finding and a mocked-corpus or
    // production-code assumption (e.g. a response field the mocked tests
    // assume exists but the pinned server never sends). These never affect
    // `overallPassed` -- a finding is not a scenario failure, it is
    // information a follow-up ticket needs. Always present (defaults to
    // `[]`) so the artifact shape is stable across runs.
    findings: [...(input.findings ?? [])],
    overallPassed: input.readiness.reachable
      && input.readiness.clientLogin
      && input.readiness.readProbe
      && input.readiness.modificationTokenProbe
      && input.readiness.fixtureDataObserved
      && input.scenarios.every((scenario) => scenario.passed),
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };

  assertNoSecretShapedKeys(artifact);
  return artifact;
}
