import type { RssDashboardSettings } from "../types/types";
import type { ArticleStateChange } from "../utils/article-update";
import type {
  FreshRssConnectionScopeRepository,
  FreshRssPendingFacetMutation,
} from "./freshrss-connection-scope-repository";

function createOperationId(): string {
  return (
    window.crypto?.randomUUID?.() ??
    `freshrss-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  );
}

let pendingSidecarMutation: Promise<unknown> = Promise.resolve();

/** Serializes sidecar read-modify-write operations across repository instances. */
export function withFreshRssSidecarMutationLock<T>(
  mutation: () => Promise<T>,
): Promise<T> {
  const next = pendingSidecarMutation.then(mutation);
  pendingSidecarMutation = next.catch(() => undefined);
  return next;
}

/** Persists bound local article-state choices in the active FreshRSS scope. */
export function queueFreshRssArticleStateChanges(input: {
  settings: RssDashboardSettings;
  changes: readonly ArticleStateChange[];
  sidecarRepository: Pick<
    FreshRssConnectionScopeRepository,
    "readActiveScope" | "read" | "write"
  >;
}): Promise<void> {
  return withFreshRssSidecarMutationLock(() =>
    persistFreshRssArticleStateChanges(input),
  );
}

async function persistFreshRssArticleStateChanges(input: {
  settings: RssDashboardSettings;
  changes: readonly ArticleStateChange[];
  sidecarRepository: Pick<
    FreshRssConnectionScopeRepository,
    "readActiveScope" | "read" | "write"
  >;
}): Promise<void> {
  if (input.changes.length === 0) {
    return;
  }

  const scope = await input.sidecarRepository.readActiveScope();
  if (!scope || scope.endpoint !== input.settings.freshRss.endpoint) return;

  const sidecar = await input.sidecarRepository.read(scope);
  if (!sidecar) return;

  const pending = [...sidecar.pendingFacetMutations];
  const updates: FreshRssPendingFacetMutation[] = [];
  for (const change of input.changes) {
    const feed = input.settings.feeds.find(
      (candidate) => candidate.url === change.feedUrl,
    );
    if (!feed?.feedId) continue;
    const articleBinding = sidecar.articleBindings.find(
      (binding) =>
        binding.feedId === feed.feedId && binding.guid === change.guid,
    );
    if (!articleBinding) continue;
    for (const facet of ["read", "starred"] as const) {
      const desiredState = change.changes[facet];
      if (typeof desiredState !== "boolean") continue;
      updates.push({
        operationId: createOperationId(),
        remoteArticleId: articleBinding.remoteArticleId,
        facet,
        desiredState,
        createdAtMs: Date.now(),
        attemptCount: 0,
        lastError: null,
      });
    }
    if (change.changes.tags !== undefined) {
      updates.push({
        operationId: createOperationId(),
        remoteArticleId: articleBinding.remoteArticleId,
        facet: "labels",
        desiredState: normalizeLabelNames(
          change.changes.tags.map((tag) => tag.name),
        ),
        createdAtMs: Date.now(),
        attemptCount: 0,
        lastError: null,
      });
    }
  }
  if (updates.length === 0) return;

  for (const update of updates) {
    const existingIndex = pending.findIndex(
      (candidate) =>
        isFreshRssPendingFacetMutation(candidate) &&
        candidate.facet === update.facet &&
        candidate.remoteArticleId === update.remoteArticleId,
    );
    if (existingIndex === -1) pending.push(update);
    else pending[existingIndex] = update;
  }

  await input.sidecarRepository.write({
    ...sidecar,
    pendingFacetMutations: pending,
  });
}

export function isFreshRssPendingFacetMutation(
  value: unknown,
): value is FreshRssPendingFacetMutation {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const validBase =
    typeof record.operationId === "string" &&
    Boolean(record.operationId) &&
    typeof record.remoteArticleId === "string" &&
    Boolean(record.remoteArticleId) &&
    typeof record.createdAtMs === "number" &&
    Number.isFinite(record.createdAtMs) &&
    typeof record.attemptCount === "number" &&
    Number.isFinite(record.attemptCount) &&
    (record.lastError === null || typeof record.lastError === "string") &&
    (record.retryDisposition === undefined ||
      record.retryDisposition === "automatic" ||
      record.retryDisposition === "manual");
  if (!validBase) return false;
  if (record.facet === "read" || record.facet === "starred") {
    return typeof record.desiredState === "boolean";
  }
  return (
    record.facet === "labels" &&
    Array.isArray(record.desiredState) &&
    record.desiredState.every(
      (label) => typeof label === "string" && Boolean(label.trim()),
    )
  );
}

function normalizeLabelNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    const key = trimmed.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}
