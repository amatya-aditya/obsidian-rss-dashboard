import type { FreshRssConnectionStatus } from "../types/types";
import type { FreshRssConnectionService } from "./freshrss-connection-service";
import type {
  FreshRssConnectionScopeActivationResult,
  FreshRssConnectionScopeRepository,
} from "./freshrss-connection-scope-repository";

export interface FreshRssSecretStorage {
  getSecret(reference: string): string | null;
  listSecrets(): string[];
}

export type FreshRssCapability =
  "available" | "capability-unavailable" | "storage-migration-required";

export function getFreshRssCapability(input: {
  apiAvailable: boolean;
  secretStorage: FreshRssSecretStorage | null;
  storageMode: string;
  metadataStorageMode: string;
  metadataStorageSchemaVersion: number;
}): FreshRssCapability {
  if (!input.apiAvailable || !input.secretStorage) {
    return "capability-unavailable";
  }

  try {
    if (!Array.isArray(input.secretStorage.listSecrets())) {
      return "capability-unavailable";
    }
  } catch {
    return "capability-unavailable";
  }

  return input.storageMode === "vault-shards-v2" &&
    input.metadataStorageMode === "vault-location" &&
    input.metadataStorageSchemaVersion >= 2
    ? "available"
    : "storage-migration-required";
}

export function getFreshRssSecretReferences(
  capability: FreshRssCapability,
  secretStorage: FreshRssSecretStorage | null,
): string[] {
  if (capability !== "available" || !secretStorage) return [];
  try {
    return secretStorage.listSecrets();
  } catch {
    return [];
  }
}

export async function testFreshRssConnection(input: {
  capability: FreshRssCapability;
  credentialReference: string;
  secretStorage: FreshRssSecretStorage | null;
  endpoint: string;
  connectionService: Pick<FreshRssConnectionService, "testConnection">;
  getScopeRepository(): Pick<FreshRssConnectionScopeRepository, "activate">;
  ensureSidecarFolder(): Promise<void>;
  setStatus(
    status: FreshRssConnectionStatus,
  ): Promise<FreshRssConnectionStatus>;
}): Promise<FreshRssConnectionStatus> {
  if (input.capability !== "available") {
    return input.setStatus(input.capability);
  }
  if (!input.credentialReference) {
    return input.setStatus("credentials-unconfigured");
  }

  let credentialBundle: string | null;
  try {
    credentialBundle =
      input.secretStorage?.getSecret(input.credentialReference) ?? null;
  } catch {
    return input.setStatus("capability-unavailable");
  }
  if (!credentialBundle) {
    return input.setStatus("credentials-unconfigured");
  }

  try {
    const result = await input.connectionService.testConnection({
      endpoint: input.endpoint,
      credentialBundle,
    });
    if (result.outcome !== "connected") {
      return input.setStatus(result.outcome);
    }

    await input.ensureSidecarFolder();
    const activation: FreshRssConnectionScopeActivationResult = await input
      .getScopeRepository()
      .activate(result.scope);
    return input.setStatus(
      activation.outcome === "activated" ? "connected" : "server-unavailable",
    );
  } catch {
    return input.setStatus("server-unavailable");
  }
}
