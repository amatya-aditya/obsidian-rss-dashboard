import { describe, expect, it } from "vitest";
import {
  FreshRssConnectionService,
  canonicalizeFreshRssEndpoint,
  type FreshRssHttpClient,
} from "../../../src/services/freshrss-connection-service";

function createHttpClient(
  responses: Array<{ status: number; text: string }>,
): FreshRssHttpClient {
  return {
    request: async () => {
      const response = responses.shift();
      if (!response) {
        throw new Error("Unexpected FreshRSS request");
      }
      return response;
    },
  };
}

describe("FreshRSS connection service", () => {
  it("canonicalizes a deployment endpoint without retaining URL credentials or transport-only parts", () => {
    expect(
      canonicalizeFreshRssEndpoint(
        "HTTPS://Reader.Example.test:443/freshrss/api/greader.php/?ignored=value#fragment",
      ),
    ).toBe("https://reader.example.test/freshrss/api/greader.php");

    expect(() =>
      canonicalizeFreshRssEndpoint(
        "https://user:password@reader.example.test/api/greader.php",
      ),
    ).toThrow("must not include credentials");
    expect(() =>
      canonicalizeFreshRssEndpoint(
        "http://reader.example.test/api/greader.php",
      ),
    ).toThrow("must use HTTPS");
    expect(() =>
      canonicalizeFreshRssEndpoint(
        "http://reader.example.test/api/greader.php",
      ),
    ).toThrow("password is sent to this address");
  });

  it("proves login, identity, and modification-token readiness without persisting authentication values", async () => {
    const requests: Array<{ url: string; body?: string; headers?: Record<string, string> }> = [];
    const client: FreshRssHttpClient = {
      request: async (request) => {
        requests.push(request);
        if (request.url.endsWith("/accounts/ClientLogin")) {
          return { status: 200, text: "SID=opaque-session\nAuth=opaque-session" };
        }
        if (request.url.includes("/user-info")) {
          return { status: 200, text: '{"userId":"opaque-user"}' };
        }
        return { status: 200, text: "opaque-modification-token" };
      },
    };
    const service = new FreshRssConnectionService(client);

    const result = await service.testConnection({
      endpoint: "https://reader.example.test/api/greader.php",
      credentialBundle: '{"username":"test-user","apiPassword":"test-password"}',
    });

    expect(result).toEqual({
      outcome: "connected",
      scope: {
        endpoint: "https://reader.example.test/api/greader.php",
        remoteUserId: "opaque-user",
      },
    });
    expect(requests).toHaveLength(3);
    expect(requests[0].body).toBe("Email=test-user&Passwd=test-password");
    expect(requests.slice(1).every((request) =>
      request.headers?.Authorization === "GoogleLogin auth=opaque-session",
    )).toBe(true);
  });

  it("reports rejected credentials without attempting authenticated probes", async () => {
    const client = createHttpClient([{ status: 403, text: "forbidden" }]);
    const service = new FreshRssConnectionService(client);

    await expect(
      service.testConnection({
        endpoint: "https://reader.example.test/api/greader.php",
        credentialBundle: '{"username":"test-user","apiPassword":"test-password"}',
      }),
    ).resolves.toEqual({ outcome: "credentials-rejected" });
  });
});
