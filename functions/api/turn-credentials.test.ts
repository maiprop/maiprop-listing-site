import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequest } from "./turn-credentials";

const ROOM_ID =
  "video:viewing:11111111-1111-4111-8111-111111111111";
const env = {
  SUPABASE_PROJECT_ID: "stagingref0000000000",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_staging",
  CLOUDFLARE_TURN_KEY_ID: "turn-key-id",
  CLOUDFLARE_TURN_API_TOKEN: "turn-api-token",
  MAIPROP_TURN_TTL_SECONDS: "21600",
};

function context(
  body: unknown = { roomId: ROOM_ID },
  overrides: {
    method?: string;
    authorization?: string | null;
    env?: Record<string, string | undefined>;
    signal?: AbortSignal;
  } = {},
) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const authorization = overrides.authorization === undefined
    ? "Bearer user-access-token"
    : overrides.authorization;
  if (authorization) headers.set("Authorization", authorization);
  return {
    request: new Request(
      "https://staging.portal.maiprop.co/api/turn-credentials",
      {
        method: overrides.method ?? "POST",
        headers,
        body: (overrides.method ?? "POST") === "POST"
          ? JSON.stringify(body)
          : undefined,
        signal: overrides.signal,
      },
    ),
    env: { ...env, ...overrides.env },
  } as never;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TURN credential Pages Function", () => {
  it("allows only authenticated POST requests for valid scoped rooms", async () => {
    const methodResponse = await onRequest(context(undefined, {
      method: "GET",
    }));
    const authResponse = await onRequest(context(undefined, {
      authorization: null,
    }));
    const roomResponse = await onRequest(context({
      roomId: "video:viewing:not-a-uuid",
    }));

    expect(methodResponse.status).toBe(405);
    expect(methodResponse.headers.get("Allow")).toBe("POST");
    expect(authResponse.status).toBe(401);
    expect(roomResponse.status).toBe(400);
  });

  it("does not call Cloudflare when Supabase denies room access", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => Response.json(false));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(context());

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/rest/v1/rpc/can_access_video_room",
    );
  });

  it("returns only short-lived ICE credentials after room authorization", async () => {
    const iceServers = [
      { urls: ["stun:stun.cloudflare.com:3478"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turns:turn.cloudflare.com:5349?transport=tcp",
        ],
        username: "expiring-username",
        credential: "expiring-credential",
      },
    ];
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(Response.json(
        { iceServers },
        { status: 201 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(body).toEqual({ iceServers, expiresIn: 21600 });
    expect(JSON.stringify(body)).not.toContain("turn-api-token");

    const [authorizationUrl, authorizationInit] = fetchMock.mock.calls[0];
    expect(String(authorizationUrl)).toContain(
      "/rest/v1/rpc/can_access_video_room",
    );
    expect(JSON.parse(String(authorizationInit?.body))).toEqual({
      p_topic: ROOM_ID,
    });
    expect(
      new Headers(authorizationInit?.headers).get("Authorization"),
    ).toBe("Bearer user-access-token");

    const [turnUrl, turnInit] = fetchMock.mock.calls[1];
    expect(String(turnUrl)).toContain(
      "/credentials/generate-ice-servers",
    );
    expect(JSON.parse(String(turnInit?.body))).toEqual({ ttl: 21600 });
    expect(new Headers(turnInit?.headers).get("Authorization")).toBe(
      "Bearer turn-api-token",
    );
  });

  it("fails closed for missing server secrets and invalid TURN payloads", async () => {
    const missingSecret = await onRequest(context(undefined, {
      env: { CLOUDFLARE_TURN_API_TOKEN: undefined },
    }));
    expect(missingSecret.status).toBe(503);

    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(Response.json(
        { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] },
        { status: 201 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const invalidPayload = await onRequest(context());
    expect(invalidPayload.status).toBe(502);
  });

  it("propagates an already-aborted client request to upstream calls", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Client disconnected", "AbortError"));
    let upstreamSignalWasAborted = false;
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      upstreamSignalWasAborted = init?.signal?.aborted === true;
      throw new DOMException("Client disconnected", "AbortError");
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequest(context(undefined, {
      signal: controller.signal,
    }));

    expect(response.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upstreamSignalWasAborted).toBe(true);
  });
});
