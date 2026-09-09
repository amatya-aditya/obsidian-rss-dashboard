/**
 * Pure capture/coalescing logic for FreshRSS pending facet mutations.
 *
 * A pending facet mutation records a user's absolute desired state for one
 * synchronizable article facet (currently only `read`) on one opaque remote
 * article. The sidecar keeps at most one current record per
 * (remoteArticleId, facet) pair: a newer local decision replaces the prior
 * record with a new operation ID rather than appending toggle history, and an
 * acknowledgment only removes a record when its operation ID still matches
 * the record currently on disk (so a delayed/stale acknowledgment for a
 * superseded operation can never discard a newer choice).
 *
 * Kept dependency-free and side-effect-free so it can be unit tested directly
 * and reused by both the local mutation-capture boundary (main.ts) and the
 * sync coordinator's flush/acknowledgment phase.
 */

export type FreshRssSynchronizableFacet = "read";

export interface FreshRssMutationError {
  category: "auth-rejected" | "terminal" | "unavailable";
  message: string;
}

export interface FreshRssPendingFacetMutation {
  operationId: string;
  remoteArticleId: string;
  facet: FreshRssSynchronizableFacet;
  desiredState: boolean;
  createdAtMs: number;
  lastAttemptAtMs: number | null;
  attemptCount: number;
  error: FreshRssMutationError | null;
}

function defaultCreateOperationId(): string {
  const randomUuid = window.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSameRecordIdentity(
  mutation: FreshRssPendingFacetMutation,
  target: { remoteArticleId: string; facet: FreshRssSynchronizableFacet },
): boolean {
  return (
    mutation.remoteArticleId === target.remoteArticleId &&
    mutation.facet === target.facet
  );
}

/**
 * Records (or replaces) the current pending mutation for one remote article
 * facet with a fresh operation ID and absolute desired state. Any prior
 * pending record for the same (remoteArticleId, facet) identity is discarded
 * rather than kept as history.
 */
export function captureFacetMutation(
  existing: readonly FreshRssPendingFacetMutation[],
  input: {
    remoteArticleId: string;
    facet: FreshRssSynchronizableFacet;
    desiredState: boolean;
    nowMs: number;
    createOperationId?: () => string;
  },
): FreshRssPendingFacetMutation[] {
  const next = existing.filter((mutation) => !isSameRecordIdentity(mutation, input));
  next.push({
    operationId: (input.createOperationId ?? defaultCreateOperationId)(),
    remoteArticleId: input.remoteArticleId,
    facet: input.facet,
    desiredState: input.desiredState,
    createdAtMs: input.nowMs,
    lastAttemptAtMs: null,
    attemptCount: 0,
    error: null,
  });
  return next;
}

/**
 * Removes a pending record only when the acknowledgment's operation ID still
 * matches the record currently on file for that (remoteArticleId, facet)
 * identity. A stale/delayed acknowledgment for a superseded operation ID is a
 * no-op: the newer pending record it does not match stays authoritative.
 */
export function removeAcknowledgedMutation(
  existing: readonly FreshRssPendingFacetMutation[],
  ack: {
    remoteArticleId: string;
    facet: FreshRssSynchronizableFacet;
    operationId: string;
  },
): FreshRssPendingFacetMutation[] {
  return existing.filter(
    (mutation) =>
      !(
        isSameRecordIdentity(mutation, ack) &&
        mutation.operationId === ack.operationId
      ),
  );
}

/**
 * Records a failed dispatch attempt (network/server unavailable, or a
 * terminal rejection such as HTTP 400/404/422) against the current record for
 * that operation, without discarding the desired state. Only mutates the
 * record whose operation ID still matches; a superseded record is untouched.
 */
export function markMutationAttemptFailed(
  existing: readonly FreshRssPendingFacetMutation[],
  target: {
    remoteArticleId: string;
    facet: FreshRssSynchronizableFacet;
    operationId: string;
  },
  nowMs: number,
  error: FreshRssMutationError | null,
): FreshRssPendingFacetMutation[] {
  return existing.map((mutation) => {
    if (!isSameRecordIdentity(mutation, target) || mutation.operationId !== target.operationId) {
      return mutation;
    }
    return {
      ...mutation,
      attemptCount: mutation.attemptCount + 1,
      lastAttemptAtMs: nowMs,
      error,
    };
  });
}

/** Finds the current pending record, if any, for one remote article facet. */
export function findPendingFacetMutation(
  existing: readonly FreshRssPendingFacetMutation[],
  target: { remoteArticleId: string; facet: FreshRssSynchronizableFacet },
): FreshRssPendingFacetMutation | null {
  return existing.find((mutation) => isSameRecordIdentity(mutation, target)) ?? null;
}
