/**
 * Shared test utilities for edge function handler tests.
 *
 * Pattern: before importing the function module, call `captureHandler()` to
 * intercept Deno.serve. After the import, call `restoreServe()` and use the
 * returned handler in Deno.test blocks.
 *
 * Usage:
 *   import { captureHandler, restoreServe, req, jsonBody } from "../_shared/testUtils.ts";
 *   const { handler, restore } = await captureHandler("./index.ts", { OPENAI_API_KEY: "k" });
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
  moduleSpecifier: string,
  envOverrides: Record<string, string> = {},
): Promise<HandlerCapture> {
  let captured: ((req: Request) => Promise<Response>) | null = null;

  const denoForTest = Deno as typeof Deno & { serve: typeof Deno.serve };
  const envForTest = Deno.env as typeof Deno.env & { get: typeof Deno.env.get };
  const origServe = Deno.serve;
  denoForTest.serve = ((h: unknown) => {
    captured = h as typeof captured;
    return {} as Deno.HttpServer<Deno.NetAddr>;
  }) as typeof Deno.serve;

  const origEnvGet = Deno.env.get.bind(Deno.env);
  const defaultEnv: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    OPENAI_API_KEY: "test-openai-key",
    BREVO_API_KEY: "test-brevo-key",
    BREVO_FROM_EMAIL: "noreply@maiprop.test",
    SEND_EMAIL_HOOK_SECRET: "v1,whsec_test_hook_secret",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    MAIPROP_OS_URL: "https://os.test",
    MAIPROP_OS_EMAIL: "test@test.com",
    MAIPROP_OS_PASSWORD: "testpass",
    WEBHOOK_SECRET: "test-webhook-secret",
    CRON_SECRET: "test-cron-secret",
    ...envOverrides,
  };
  envForTest.get = (k: string) => defaultEnv[k] ?? origEnvGet(k);

  await import(moduleSpecifier);

  denoForTest.serve = origServe;

  function restore() {
    envForTest.get = origEnvGet;
  }

  if (!captured) throw new Error(`Deno.serve was not called by ${moduleSpecifier}`);

  return { handler: captured, restore };
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
