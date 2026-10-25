import { describe, expect, it, vi } from "vitest";
import {
  canonicalizeFreshRssEndpoint,
  FreshRssConnectionService,
  parseCredentialBundle,
  type FreshRssHttpClient,
} from "../../../src/services/freshrss-connection-service";

describe("FreshRSS connection credentials", () => {
  it("parses only a complete credential bundle", () => {
    expect(
      parseCredentialBundle(
        JSON.stringify({ username: "reader", apiPassword: "secret" }),
      ),
    ).toEqual({ username: "reader", apiPassword: "secret" });
    expect(parseCredentialBundle("not-json")).toBeNull();
    expect(parseCredentialBundle('{"username":"reader"}')).toBeNull();
  });

  it("canonicalizes an HTTPS endpoint and rejects embedded credentials or HTTP", () => {
    expect(
      canonicalizeFreshRssEndpoint(
        " https://reader.example.test/api/greader.php/ ",
      ),
    ).toBe("https://reader.example.test/api/greader.php");
    expect(() =>
      canonicalizeFreshRssEndpoint("http://reader.example.test/greader.php"),
    ).toThrow(/HTTPS/);
    expect(() =>
      canonicalizeFreshRssEndpoint(
        "https://reader:password@example.test/greader.php",
      ),
    ).toThrow(/credentials/);
  });

  it("tests login, identity, and write authorization without changing server state", async () => {
    const request = vi
      .fn<FreshRssHttpClient["request"]>()
      .mockResolvedValueOnce({ status: 200, text: "Auth=session-value" })
      .mockResolvedValueOnce({ status: 200, text: '{"userId":"remote-user"}' })
      .mockResolvedValueOnce({ status: 200, text: "write-token" });
    const service = new FreshRssConnectionService({ request });

    await expect(
      service.testConnection({
        endpoint: "https://reader.example.test/api/greader.php",
        credentialBundle: JSON.stringify({
          username: "reader",
          apiPassword: "secret-value",
        }),
      }),
    ).resolves.toEqual({
      outcome: "connected",
      scope: {
        endpoint: "https://reader.example.test/api/greader.php",
        remoteUserId: "remote-user",
      },
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        url: "https://reader.example.test/api/greader.php/accounts/ClientLogin",
        method: "POST",
        body: "Email=reader&Passwd=secret-value",
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        url: "https://reader.example.test/api/greader.php/reader/api/0/user-info?output=json",
        method: "GET",
        headers: { Authorization: "GoogleLogin auth=session-value" },
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        url: "https://reader.example.test/api/greader.php/reader/api/0/token",
        method: "GET",
      }),
    );
  });

  it("does not send an invalid bundle to the server", async () => {
    const request = vi.fn<FreshRssHttpClient["request"]>();
    const service = new FreshRssConnectionService({ request });

    await expect(
      service.testConnection({
        endpoint: "https://reader.example.test/greader.php",
        credentialBundle: "{}",
      }),
    ).resolves.toEqual({ outcome: "credentials-rejected" });
    expect(request).not.toHaveBeenCalled();
  });

  it("reports rejected credentials and transport failures without exposing response data", async () => {
    const rejected = new FreshRssConnectionService({
      request: vi.fn<FreshRssHttpClient["request"]>().mockResolvedValue({
        status: 401,
        text: "private error text",
      }),
    });
    await expect(
      rejected.testConnection({
        endpoint: "https://reader.example.test/greader.php",
        credentialBundle: '{"username":"reader","apiPassword":"secret"}',
      }),
    ).resolves.toEqual({ outcome: "credentials-rejected" });

    const unavailable = new FreshRssConnectionService({
      request: vi
        .fn<FreshRssHttpClient["request"]>()
        .mockRejectedValue(new Error("private network detail")),
    });
    await expect(
      unavailable.testConnection({
        endpoint: "https://reader.example.test/greader.php",
        credentialBundle: '{"username":"reader","apiPassword":"secret"}',
      }),
    ).resolves.toEqual({ outcome: "server-unavailable" });
  });
});
