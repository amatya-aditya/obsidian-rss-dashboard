export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** HTTP statuses that mean FreshRSS rejected the request's credentials/auth token. */
export function isRejectedStatus(status: number): boolean {
  return status === 401 || status === 403;
}
