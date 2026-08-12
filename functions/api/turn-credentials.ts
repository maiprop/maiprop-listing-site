import {
  getSupabaseRuntime,
  type SeoEnv,
} from "../_seo";

type TurnCredentialsEnv = SeoEnv & {
  CLOUDFLARE_TURN_KEY_ID?: string;
  CLOUDFLARE_TURN_API_TOKEN?: string;
  MAIPROP_TURN_TTL_SECONDS?: string;
};

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOM_RE = /^video:(viewing|consultation|professional):(.+)$/;
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;
const MAX_TTL_SECONDS = 24 * 60 * 60;
const UPSTREAM_TIMEOUT_MS = 3_500;

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cross-Origin-Resource-Policy": "same-origin",
      Vary: "Authorization",
      ...extraHeaders,
    },
  });
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(\S{1,4096})$/i);
  return match?.[1] ?? null;
}

function validRoomId(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 96) return false;
  const match = value.match(ROOM_RE);
  return Boolean(match && UUID_RE.test(match[2]));
}

function turnTtlSeconds(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isSafeInteger(parsed)) return DEFAULT_TTL_SECONDS;
  return Math.max(300, Math.min(MAX_TTL_SECONDS, parsed));
}

function validIceServer(value: unknown): value is IceServer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const server = value as Record<string, unknown>;
  const urls = typeof server.urls === "string"
    ? [server.urls]
    : Array.isArray(server.urls) &&
        server.urls.every((url) => typeof url === "string")
      ? server.urls
      : [];
  return (
    urls.length > 0 &&
    urls.every((url) => /^(stun|turn|turns):/i.test(url)) &&
    (server.username === undefined || typeof server.username === "string") &&
    (server.credential === undefined || typeof server.credential === "string")
  );
}

function validIceServers(value: unknown): value is IceServer[] {
  if (!Array.isArray(value) || value.length < 2) return false;
  if (!value.every(validIceServer)) return false;
  return value.some((server) => {
    const urls = typeof server.urls === "string" ? [server.urls] : server.urls;
    return (
      urls.some((url) => /^turns?:/i.test(url)) &&
      typeof server.username === "string" &&
      server.username.length > 0 &&
      typeof server.credential === "string" &&
      server.credential.length > 0
    );
  });
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  parentSignal: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) {
    abort();
  } else {
    parentSignal.addEventListener("abort", abort, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort(new DOMException("TURN request timed out", "TimeoutError")),
    UPSTREAM_TIMEOUT_MS,
  );
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal.removeEventListener("abort", abort);
  }
}

async function authorizedForRoom(
  env: TurnCredentialsEnv,
  token: string,
  roomId: string,
  signal: AbortSignal,
): Promise<boolean> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) throw new Error("supabase_runtime_missing");
  const response = await fetchWithTimeout(
    new URL("/rest/v1/rpc/can_access_video_room", runtime.url),
    {
      method: "POST",
      headers: {
        apikey: runtime.key,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_topic: roomId }),
    },
    signal,
  );
  if (!response.ok) return false;
  return await response.json() === true;
}

async function readRoomId(request: Request): Promise<string | null> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    const body = await request.json() as { roomId?: unknown };
    return validRoomId(body.roomId) ? body.roomId : null;
  } catch {
    return null;
  }
}

export const onRequest: PagesFunction<TurnCredentialsEnv> = async (context) => {
  if (context.request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed" },
      405,
      { Allow: "POST" },
    );
  }

  const token = bearerToken(context.request);
  if (!token) return jsonResponse({ error: "Authentication required" }, 401);

  const roomId = await readRoomId(context.request);
  if (!roomId) return jsonResponse({ error: "Invalid video room" }, 400);

  const keyId = context.env.CLOUDFLARE_TURN_KEY_ID?.trim() ?? "";
  const apiToken = context.env.CLOUDFLARE_TURN_API_TOKEN?.trim() ?? "";
  if (!KEY_ID_RE.test(keyId) || !apiToken) {
    return jsonResponse({ error: "TURN service is unavailable" }, 503);
  }

  try {
    if (
      !await authorizedForRoom(
        context.env,
        token,
        roomId,
        context.request.signal,
      )
    ) {
      return jsonResponse({ error: "Video room access denied" }, 403);
    }

    const ttl = turnTtlSeconds(context.env.MAIPROP_TURN_TTL_SECONDS);
    const turnResponse = await fetchWithTimeout(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}` +
        "/credentials/generate-ice-servers",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl }),
      },
      context.request.signal,
    );
    if (turnResponse.status !== 201) {
      return jsonResponse({ error: "TURN service is unavailable" }, 502);
    }
    const payload = await turnResponse.json() as { iceServers?: unknown };
    if (!validIceServers(payload.iceServers)) {
      return jsonResponse({ error: "TURN service returned invalid credentials" }, 502);
    }
    return jsonResponse({
      iceServers: payload.iceServers,
      expiresIn: ttl,
    });
  } catch (error) {
    const errorName =
      error &&
        typeof error === "object" &&
        "name" in error &&
        typeof error.name === "string"
        ? error.name
        : "";
    if (
      (
        errorName === "TimeoutError" ||
        errorName === "AbortError"
      )
    ) {
      return jsonResponse({ error: "TURN service timed out" }, 504);
    }
    if (error instanceof Error && error.message === "supabase_runtime_missing") {
      return jsonResponse({ error: "Authentication service is unavailable" }, 503);
    }
    return jsonResponse({ error: "TURN service is unavailable" }, 502);
  }
};
