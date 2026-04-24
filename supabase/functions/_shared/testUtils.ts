/**
 * Shared test utilities for edge function handler tests.
 *
 * Pattern: before importing the function module, call `captureHandler()` to
 * intercept Deno.serve. After the import, call `restoreServe()` and use the
 * returned handler in Deno.test blocks.
 *
 * Usage:
 *   import { captureHandler, restoreServe, req, jsonBody } from "../_shared/testUtils.ts";
 *   const { handler, restore } = await captureHandler(new URL("./index.ts", import.meta.url), { LOVABLE_API_KEY: "k" });
 *   Deno.test("OPTIONS → 200", async () => {
 *     const res = await handler(req("OPTIONS"));
 *     assertEquals(res.status, 200);
 *   });
 */

export interface HandlerCapture {
  handler: (req: Request) => Promise<Response>;
  restore: () => void;
}

/**
 * Patches Deno.serve + Deno.env, dynamically imports the module, then returns
 * the captured handler and a restore function.
 */
export async function captureHandler(
  moduleSpecifier: URL | string,
  envOverrides: Record<string, string> = {},
): Promise<HandlerCapture> {
  let captured: ((req: Request) => Promise<Response>) | null = null;

  const origServe = Deno.serve;
  // @ts-expect-error test override
  Deno.serve = (h: unknown) => { captured = h as typeof captured; return {} as Deno.HttpServer; };

  // Inject test env vars via the official Deno.env.set API (works on all Deno
  // 2.x builds, including Proxy-backed Deno.env). Intentionally NOT cleaned up
  // in restore() — Deno.test callbacks run after module init, so vars must stay
  // set for the lifetime of the test file.
  const testEnv: Record<string, string> = {
    SUPABASE_URL: "http://localhost:54321",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    LOVABLE_API_KEY: "test-lovable-key",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    MAIPROP_OS_URL: "https://os.test",
    MAIPROP_OS_EMAIL: "test@test.com",
    MAIPROP_OS_PASSWORD: "testpass",
    WEBHOOK_SECRET: "test-webhook-secret",
    CRON_SECRET: "test-cron-secret",
    ...envOverrides,
  };
  for (const [k, v] of Object.entries(testEnv)) {
    Deno.env.set(k, v);
  }

  // Deno 2.x import() only accepts string; convert URL to its href first.
  const specifier = typeof moduleSpecifier === "string" ? moduleSpecifier : moduleSpecifier.href;
  await import(specifier);

  Deno.serve = origServe;

  if (!captured) throw new Error(`Deno.serve was not called by ${moduleSpecifier}`);

  return { handler: captured, restore: () => {} };
}

/** Build a Request to the edge function URL. */
export function req(
  method = "POST",
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://functions.supabase.co/fn", {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": "1.2.3.4",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Build an authenticated request with a fake Bearer token. */
export function authedReq(
  method = "POST",
  body?: unknown,
  headers: Record<string, string> = {},
): Request {
  return req(method, body, { authorization: "Bearer fake-token", ...headers });
}

/** Parse JSON body from a Response. */
export async function jsonBody(res: Response): Promise<unknown> {
  return res.json();
}
