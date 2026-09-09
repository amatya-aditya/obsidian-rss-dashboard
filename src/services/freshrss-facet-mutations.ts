import type { Tag } from "../types/types";

/**
 * Pure capture/coalescing logic for FreshRSS pending facet mutations.
 *
 * A pending facet mutation records a user's absolute desired state for one
 * synchronizable article facet (`read`, `starred`, or one dynamic
 * `label:<normalized name>` facet per known FreshRSS label mapping) on one
 * opaque remote article. The sidecar keeps at most one current record per
 * (remoteArticleId, facet) pair: a newer local decision replaces the prior
 * record with a new operation ID rather than appending toggle history, and an
 * acknowledgment only removes a record when its operation ID still matches
 * the record currently on disk (so a delayed/stale acknowledgment for a
 * superseded operation can never discard a newer choice). Records for
 * different facets of the same article are entirely independent.
 *
 * Kept dependency-free and side-effect-free so it can be unit tested directly
 * and reused by both the local mutation-capture boundary (main.ts) and the
 * sync coordinator's flush/acknowledgment phase.
 */

/** Prefix for a dynamic mapped-label facet identifier: `label:<normalized name>`. */
export const FRESHRSS_LABEL_FACET_PREFIX = "label:";

/** A dynamic synchronizable facet for one known FreshRSS label mapping. */
export type FreshRssLabelFacet = `${typeof FRESHRSS_LABEL_FACET_PREFIX}${string}`;

/**
 * Every article facet the FreshRSS sync coordinator can flush and reconcile.
 * `read` and `starred` are the two fixed system-stream facets; a
 * `label:<normalized name>` facet is dynamic, created for each currently
 * known FreshRSS label mapping (see `freshrss-sidecar-repository.ts`'s
 * `FreshRssLabelMapping`). Widened from ticket 05's `"read" | "starred"` to
 * additionally admit label facets without changing the meaning or shape of
 * the two existing ones.
 */
export type FreshRssSynchronizableFacet = "read" | "starred" | FreshRssLabelFacet;

/** True when `facet` is a well-formed dynamic mapped-label facet identifier. */
export function isLabelFacet(facet: string): facet is FreshRssLabelFacet {
  return (
    facet.startsWith(FRESHRSS_LABEL_FACET_PREFIX) &&
    facet.length > FRESHRSS_LABEL_FACET_PREFIX.length
  );
}

/** True when `value` is a structurally valid `FreshRssSynchronizableFacet`. */
export function isSynchronizableFacet(
  value: unknown,
): value is FreshRssSynchronizableFacet {
  return (
    value === "read" || value === "starred" || (typeof value === "string" && isLabelFacet(value))
  );
}

/** Builds the dynamic facet identifier for one normalized label name. */
export function makeLabelFacet(normalizedLabelName: string): FreshRssLabelFacet {
  return `${FRESHRSS_LABEL_FACET_PREFIX}${normalizedLabelName}`;
}

/** Recovers the normalized label name from a dynamic label facet identifier. */
export function labelNameFromFacet(facet: FreshRssLabelFacet): string {
  return facet.slice(FRESHRSS_LABEL_FACET_PREFIX.length);
}

/**
 * Normalizes a FreshRSS label (or local tag) display name to the shared
 * lookup key used consistently by remote label discovery, local mutation
 * capture, and mapping lookup on reload: trim surrounding whitespace and
 * compare a locale-independent lower-case key. `String#toLowerCase` (not
 * `toLocaleLowerCase`) is used deliberately, since it applies the Unicode
 * default case mapping rather than a locale-sensitive one.
 */
export function normalizeFreshRssLabelName(name: string): string {
  return name.trim().toLowerCase();
}

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

/**
 * True when a pending record's most recent attempt ended in a terminal
 * error (HTTP 400/404/422, unknown binding, or an invalid label operation).
 * A terminal record is never dispatched automatically again -- see
 * `dispatchableFacetMutations` -- until an explicit user retry rearms it.
 */
export function isTerminalMutation(
  mutation: Pick<FreshRssPendingFacetMutation, "error">,
): boolean {
  return mutation.error?.category === "terminal";
}

/**
 * The subset of pending mutations a sync cycle may dispatch automatically:
 * every synchronizable-facet record EXCEPT one currently in a terminal error
 * state. A terminal record's desired state and error remain on file for
 * repair, but the cycle must never replay it on its own -- only an explicit
 * `rearmTerminalMutation` call (a deliberate user "Retry" action) makes it
 * dispatchable again.
 */
export function dispatchableFacetMutations(
  existing: readonly FreshRssPendingFacetMutation[],
): FreshRssPendingFacetMutation[] {
  return existing.filter(
    (mutation) => isSynchronizableFacet(mutation.facet) && !isTerminalMutation(mutation),
  );
}

/**
 * Explicit user "Retry" action: clears a terminal record's error so the
 * next cycle may dispatch it again, without discarding the desired state,
 * creation time, or attempt history. A no-op (returns `existing` unchanged)
 * when no record matches, or the matching record is not currently terminal.
 */
export function rearmTerminalMutation(
  existing: readonly FreshRssPendingFacetMutation[],
  target: { remoteArticleId: string; facet: FreshRssSynchronizableFacet },
): FreshRssPendingFacetMutation[] {
  let changed = false;
  const next = existing.map((mutation) => {
    if (!isSameRecordIdentity(mutation, target) || !isTerminalMutation(mutation)) {
      return mutation;
    }
    changed = true;
    return { ...mutation, error: null };
  });
  // `existing` is accepted as `readonly` purely to signal that this function
  // never mutates its input in place; when nothing actually changed, the
  // exact input reference is still a valid `FreshRssPendingFacetMutation[]`
  // at runtime (callers always pass a plain mutable array), so this is the
  // one deliberate boundary cast rather than a defensive copy that would
  // falsify the "returns `existing` unchanged" no-op guarantee above.
  return changed ? next : (existing as FreshRssPendingFacetMutation[]);
}

/**
 * Explicit user "Cancel" action: removes a pending record outright,
 * regardless of its current error state. Only ever called by a deliberate
 * user action -- never automatically, and never by retention or reconciliation.
 */
export function cancelPendingMutation(
  existing: readonly FreshRssPendingFacetMutation[],
  target: { remoteArticleId: string; facet: FreshRssSynchronizableFacet },
): FreshRssPendingFacetMutation[] {
  return existing.filter((mutation) => !isSameRecordIdentity(mutation, target));
}

/**
 * A local mapping from one normalized FreshRSS label name to the exact
 * opaque remote tag reference and kind reported by FreshRSS tag discovery.
 * `displayName` is the raw remote label text, kept only as a fallback name
 * for a locally-created tag the first time a mapped label is applied to an
 * article that has no matching local tag yet; it is never used to rename or
 * recolor an existing local tag; the dashboard's chosen display spelling and
 * color always remain local.
 */
export interface FreshRssLabelMapping {
  normalizedName: string;
  remoteTagId: string;
  kind: string;
  displayName: string;
}

/** One remote tag/label entry as reported by FreshRSS tag discovery. */
export interface FreshRssRemoteLabelLike {
  remoteTagId: string;
  displayName: string;
  kind: string;
}

/**
 * Rebuilds the current set of label mappings from a freshly discovered
 * remote tag/label list. Only entries whose `kind` is exactly `"label"` are
 * considered candidates (excludes the dedicated read/starred system streams
 * and FreshRSS category/folder entries, which are never exposed as dashboard
 * label tags). Two remote labels that normalize to the same name are a
 * mapping-name collision: neither is mapped this cycle (excluded from the
 * returned mappings and reported in `ambiguousNormalizedNames`) rather than
 * guessing which one should own the name, consistent with how an ambiguous
 * FreshRSS subscription/local-feed URL match is refused elsewhere.
 */
export function buildLabelMappings(
  remoteLabels: readonly FreshRssRemoteLabelLike[],
): { mappings: FreshRssLabelMapping[]; ambiguousNormalizedNames: string[] } {
  const byNormalizedName = new Map<string, FreshRssLabelMapping>();
  const ambiguous = new Set<string>();

  for (const remote of remoteLabels) {
    if (remote.kind !== "label") continue;
    const normalizedName = normalizeFreshRssLabelName(remote.displayName);
    if (!normalizedName) continue;

    const existing = byNormalizedName.get(normalizedName);
    if (existing && existing.remoteTagId !== remote.remoteTagId) {
      ambiguous.add(normalizedName);
      continue;
    }

    byNormalizedName.set(normalizedName, {
      normalizedName,
      remoteTagId: remote.remoteTagId,
      kind: remote.kind,
      displayName: remote.displayName,
    });
  }

  for (const normalizedName of ambiguous) {
    byNormalizedName.delete(normalizedName);
  }

  return {
    mappings: Array.from(byNormalizedName.values()),
    ambiguousNormalizedNames: Array.from(ambiguous),
  };
}

/** Fallback color for a dashboard tag auto-created from a mapped FreshRSS label. */
export const FRESHRSS_MAPPED_LABEL_FALLBACK_COLOR = "#95a5a6";

/**
 * Applies one mapped label's remote membership (`desired`) to an article's
 * local tags, matching by normalized name so the local tag's chosen display
 * spelling and color are preserved exactly when the tag already exists.
 * Creating a new local tag (membership newly added and no existing local tag
 * matches) prefers an already-known local tag definition of the same
 * normalized name (e.g. from `availableTags`) for its spelling/color, and
 * only falls back to the remote display name and a default color when this
 * dashboard has never seen that tag before. Never mutates the input array.
 */
export function applyLabelMembership(
  tags: readonly Tag[] | undefined,
  normalizedLabelName: string,
  desired: boolean,
  fallback: { availableTags: readonly Tag[] | undefined; remoteDisplayName: string },
): Tag[] {
  const nextTags = (tags ?? []).map((tag) => ({ ...tag }));
  const matchIndex = nextTags.findIndex(
    (tag) => normalizeFreshRssLabelName(tag.name) === normalizedLabelName,
  );

  if (desired) {
    if (matchIndex >= 0) return nextTags;
    const knownTag = (fallback.availableTags ?? []).find(
      (tag) => normalizeFreshRssLabelName(tag.name) === normalizedLabelName,
    );
    nextTags.push(
      knownTag
        ? { ...knownTag }
        : { name: fallback.remoteDisplayName, color: FRESHRSS_MAPPED_LABEL_FALLBACK_COLOR },
    );
    return nextTags;
  }

  if (matchIndex < 0) return nextTags;
  nextTags.splice(matchIndex, 1);
  return nextTags;
}
