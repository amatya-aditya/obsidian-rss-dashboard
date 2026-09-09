/**
 * Minimal, independent Google-Reader-API client used only by the live
 * FreshRSS Docker contract runner (`run-contract.mjs`).
 *
 * This is deliberately NOT a reuse of `src/services/freshrss-sync-client.ts`
 * / `src/services/freshrss-connection-service.ts`. The whole point of a
 * Docker contract is to check the plugin's protocol assumptions against a
 * real server independently — reusing the plugin's own request-building
 * code here would let a shared bug in both silently agree with itself. Field
 * names below intentionally mirror what the plugin's TypeScript client
 * expects (see that file's parse* helpers), so any mismatch this client
 * finds against a real pinned FreshRSS server is a genuine reconciliation
 * finding, not just a copy of the same assumption.
 *
 * Every function issues exactly one HTTP request via the global `fetch`
 * (Node's built-in implementation) and returns a small, explicit result
 * shape. None of these throw on a non-2xx response; callers decide what
 * "not ready" vs. "fatal" means for their scenario.
 */

/**
 * @param {{ baseUrl: string, username: string, password: string }} args
 * @returns {Promise<{ ok: true, authToken: string } | { ok: false, status: number, body: string }>}
 */
export async function clientLogin({ baseUrl, username, password }) {
  const response = await fetch(`${baseUrl}/accounts/ClientLogin`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `Email=${encodeURIComponent(username)}&Passwd=${encodeURIComponent(password)}`,
  });
  const text = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, body: text };
  }
  const authLine = text.split(/\r?\n/).find((line) => line.startsWith("Auth="));
  const authToken = authLine?.slice("Auth=".length).trim();
  if (!authToken) {
    return { ok: false, status: response.status, body: text };
  }
  return { ok: true, authToken };
}

function authHeaders(authToken) {
  return { Authorization: `GoogleLogin auth=${authToken}` };
}

/** @param {{ baseUrl: string, authToken: string }} args */
export async function readOnlyProbe({ baseUrl, authToken }) {
  const response = await fetch(`${baseUrl}/reader/api/0/user-info?output=json`, {
    headers: authHeaders(authToken),
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const parsed = await response.json();
  if (typeof parsed?.userId !== "string" || !parsed.userId) {
    return { ok: false, status: response.status };
  }
  return { ok: true, userId: parsed.userId };
}

/** @param {{ baseUrl: string, authToken: string }} args */
export async function modificationTokenProbe({ baseUrl, authToken }) {
  const response = await fetch(`${baseUrl}/reader/api/0/token`, {
    headers: authHeaders(authToken),
  });
  const text = (await response.text()).trim();
  if (!response.ok || !text) {
    return { ok: false, status: response.status };
  }
  return { ok: true, token: text };
}

/** @param {{ baseUrl: string, authToken: string }} args */
export async function listSubscriptions({ baseUrl, authToken }) {
  const response = await fetch(`${baseUrl}/reader/api/0/subscription/list?output=json`, {
    headers: authHeaders(authToken),
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const parsed = await response.json();
  if (!Array.isArray(parsed?.subscriptions)) {
    return { ok: false, status: response.status };
  }
  return { ok: true, subscriptions: parsed.subscriptions };
}

/** @param {{ baseUrl: string, authToken: string }} args */
export async function listTags({ baseUrl, authToken }) {
  const response = await fetch(`${baseUrl}/reader/api/0/tag/list?output=json`, {
    headers: authHeaders(authToken),
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const parsed = await response.json();
  if (!Array.isArray(parsed?.tags)) {
    return { ok: false, status: response.status };
  }
  return { ok: true, tags: parsed.tags };
}

/**
 * @param {{ baseUrl: string, authToken: string, streamId: string, n: number, continuation?: string | null }} args
 */
export async function listItemIds({ baseUrl, authToken, streamId, n, continuation }) {
  const continuationParam = continuation ? `&c=${encodeURIComponent(continuation)}` : "";
  const response = await fetch(
    `${baseUrl}/reader/api/0/stream/items/ids?output=json&n=${n}&s=${encodeURIComponent(streamId)}${continuationParam}`,
    { headers: authHeaders(authToken) },
  );
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const parsed = await response.json();
  if (!Array.isArray(parsed?.itemRefs)) {
    return { ok: false, status: response.status };
  }
  return {
    ok: true,
    itemRefs: parsed.itemRefs.map((entry) => entry.id),
    continuation: typeof parsed.continuation === "string" ? parsed.continuation : null,
  };
}

/** @param {{ baseUrl: string, authToken: string, itemIds: string[] }} args */
export async function getItemContents({ baseUrl, authToken, itemIds }) {
  if (itemIds.length === 0) {
    return { ok: true, items: [] };
  }
  const body = ["output=json", ...itemIds.map((id) => `i=${encodeURIComponent(id)}`)].join("&");
  const response = await fetch(`${baseUrl}/reader/api/0/stream/items/contents`, {
    method: "POST",
    headers: { ...authHeaders(authToken), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    return { ok: false, status: response.status };
  }
  const parsed = await response.json();
  if (!Array.isArray(parsed?.items)) {
    return { ok: false, status: response.status };
  }
  return { ok: true, items: parsed.items };
}

/**
 * Dispatches one edit-tag mutation. Only a 200 response whose body is
 * exactly `OK` counts as acknowledged — this mirrors the plugin's own
 * acknowledgment rule and is exactly what this contract scenario exists to
 * confirm against a real server.
 *
 * @param {{ baseUrl: string, authToken: string, modificationToken: string, itemIds: string[], action: "add" | "remove", streamId: string }} args
 */
export async function editTag({ baseUrl, authToken, modificationToken, itemIds, action, streamId }) {
  const tagParam = action === "add" ? "a" : "r";
  const body = [
    "output=json",
    `T=${encodeURIComponent(modificationToken)}`,
    ...itemIds.map((id) => `i=${encodeURIComponent(id)}`),
    `${tagParam}=${encodeURIComponent(streamId)}`,
  ].join("&");
  const response = await fetch(`${baseUrl}/reader/api/0/edit-tag`, {
    method: "POST",
    headers: { ...authHeaders(authToken), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = (await response.text()).trim();
  return { ok: response.ok && text === "OK", status: response.status, body: text };
}
