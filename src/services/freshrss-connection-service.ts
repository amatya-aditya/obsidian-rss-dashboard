import { isRecord, isRejectedStatus } from "./freshrss-type-guards";

export interface FreshRssHttpRequest {
  url: string;
  method: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
}

export interface FreshRssHttpResponse {
  status: number;
  text: string;
}

export interface FreshRssHttpClient {
  request(request: FreshRssHttpRequest): Promise<FreshRssHttpResponse>;
}

export interface FreshRssConnectionScope {
  endpoint: string;
  remoteUserId: string;
}

export type FreshRssConnectionTestResult =
  | { outcome: "connected"; scope: FreshRssConnectionScope }
  | { outcome: "credentials-rejected" }
  | { outcome: "server-unavailable" };

export interface FreshRssCredentialBundle {
  username: string;
  apiPassword: string;
}

export type FreshRssAuthenticationResult =
  | { outcome: "authenticated"; authToken: string }
  | { outcome: "credentials-rejected" }
  | { outcome: "server-unavailable" };

export function parseCredentialBundle(value: string): FreshRssCredentialBundle | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !isRecord(parsed) ||
      typeof parsed.username !== "string" ||
      !parsed.username.trim() ||
      typeof parsed.apiPassword !== "string" ||
      !parsed.apiPassword
    ) {
      return null;
    }

    return {
      username: parsed.username,
      apiPassword: parsed.apiPassword,
    };
  } catch {
    return null;
  }
}

function getAuthToken(responseText: string): string | null {
  const tokenLine = responseText
    .split(/\r?\n/)
    .find((line) => line.startsWith("Auth="));
  const token = tokenLine?.slice("Auth=".length).trim();
  return token || null;
}

function getRemoteUserId(responseText: string): string | null {
  try {
    const parsed: unknown = JSON.parse(responseText);
    if (!isRecord(parsed) || typeof parsed.userId !== "string") {
      return null;
    }

    return parsed.userId || null;
  } catch {
    return null;
  }
}

export function canonicalizeFreshRssEndpoint(input: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(input.trim());
  } catch {
    throw new Error("FreshRSS endpoint must be a valid URL.");
  }

  if (endpoint.protocol !== "https:") {
    throw new Error(
      "FreshRSS endpoint must use HTTPS. Your FreshRSS password is sent to " +
        "this address when connecting, so it cannot be sent over plain HTTP.",
    );
  }

  if (!endpoint.hostname) {
    throw new Error("FreshRSS endpoint must include a host.");
  }

  if (endpoint.username || endpoint.password) {
    throw new Error("FreshRSS endpoint must not include credentials.");
  }

  const path = endpoint.pathname.replace(/\/+$/, "");
  return `${endpoint.protocol}//${endpoint.host}${path}`;
}

/**
 * Performs the ClientLogin exchange and returns the resulting Google-Reader
 * session token. Shared by the connection test and the sync coordinator so
 * both authenticate through one code path.
 */
export async function authenticateFreshRss(
  httpClient: FreshRssHttpClient,
  endpoint: string,
  credentials: FreshRssCredentialBundle,
): Promise<FreshRssAuthenticationResult> {
  try {
    const login = await httpClient.request({
      url: `${endpoint}/accounts/ClientLogin`,
      method: "POST",
      body: `Email=${encodeURIComponent(credentials.username)}&Passwd=${encodeURIComponent(credentials.apiPassword)}`,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (isRejectedStatus(login.status)) {
      return { outcome: "credentials-rejected" };
    }

    const authToken = login.status === 200 ? getAuthToken(login.text) : null;
    if (!authToken) {
      return { outcome: "server-unavailable" };
    }

    return { outcome: "authenticated", authToken };
  } catch {
    return { outcome: "server-unavailable" };
  }
}

export class FreshRssConnectionService {
  constructor(private readonly httpClient: FreshRssHttpClient) {}

  public async testConnection(input: {
    endpoint: string;
    credentialBundle: string;
  }): Promise<FreshRssConnectionTestResult> {
    const credentials = parseCredentialBundle(input.credentialBundle);
    if (!credentials) {
      return { outcome: "credentials-rejected" };
    }

    let endpoint: string;
    try {
      endpoint = canonicalizeFreshRssEndpoint(input.endpoint);
    } catch {
      return { outcome: "server-unavailable" };
    }

    try {
      const authResult = await authenticateFreshRss(
        this.httpClient,
        endpoint,
        credentials,
      );
      if (authResult.outcome !== "authenticated") {
        return { outcome: authResult.outcome };
      }
      const authToken = authResult.authToken;

      const headers = { Authorization: `GoogleLogin auth=${authToken}` };
      const identity = await this.httpClient.request({
        url: `${endpoint}/reader/api/0/user-info?output=json`,
        method: "GET",
        headers,
      });
      if (isRejectedStatus(identity.status)) {
        return { outcome: "credentials-rejected" };
      }

      const remoteUserId =
        identity.status === 200 ? getRemoteUserId(identity.text) : null;
      if (!remoteUserId) {
        return { outcome: "server-unavailable" };
      }

      const token = await this.httpClient.request({
        url: `${endpoint}/reader/api/0/token`,
        method: "GET",
        headers,
      });
      if (isRejectedStatus(token.status)) {
        return { outcome: "credentials-rejected" };
      }
      if (token.status !== 200 || !token.text.trim()) {
        return { outcome: "server-unavailable" };
      }

      return {
        outcome: "connected",
        scope: { endpoint, remoteUserId },
      };
    } catch {
      return { outcome: "server-unavailable" };
    }
  }
}
