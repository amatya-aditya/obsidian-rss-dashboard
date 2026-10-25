import type { RssDashboardSettings } from "../types/types";
import type { ArticleStateChange } from "../utils/article-update";
import type {
  FreshRssConnectionScopeRepository,
  FreshRssPendingReadMutation,
} from "./freshrss-connection-scope-repository";

function createOperationId(): string {
  return (
    window.crypto?.randomUUID?.() ??
    `freshrss-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  );
}

/** Persists a bound local read choice in the active FreshRSS scope. */
export async function queueFreshRssReadStateChanges(input: {
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
  const updates: FreshRssPendingReadMutation[] = [];
  for (const change of input.changes) {
    if (typeof change.changes.read !== "boolean") continue;
    const feed = input.settings.feeds.find(
      (candidate) => candidate.url === change.feedUrl,
    );
    if (!feed?.feedId) continue;
    const articleBinding = sidecar.articleBindings.find(
      (binding) =>
        binding.feedId === feed.feedId && binding.guid === change.guid,
    );
    if (!articleBinding) continue;
    updates.push({
      operationId: createOperationId(),
      remoteArticleId: articleBinding.remoteArticleId,
      facet: "read",
      desiredState: change.changes.read,
      createdAtMs: Date.now(),
      attemptCount: 0,
      lastError: null,
    });
  }
  if (updates.length === 0) return;

  for (const update of updates) {
    const existingIndex = pending.findIndex(
      (candidate) =>
        isFreshRssPendingReadMutation(candidate) &&
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

export function isFreshRssPendingReadMutation(
  value: unknown,
): value is FreshRssPendingReadMutation {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.operationId === "string" &&
    Boolean(record.operationId) &&
    typeof record.remoteArticleId === "string" &&
    Boolean(record.remoteArticleId) &&
    record.facet === "read" &&
    typeof record.desiredState === "boolean" &&
    typeof record.createdAtMs === "number" &&
    Number.isFinite(record.createdAtMs) &&
    typeof record.attemptCount === "number" &&
    Number.isFinite(record.attemptCount) &&
    (record.lastError === null || typeof record.lastError === "string")
  );
}
