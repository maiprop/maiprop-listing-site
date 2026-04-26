/**
 * Shared test utilities for edge function handler tests.
 *
 * Pattern: before importing the function module, call `captureHandler()` to
 * intercept Deno.serve. After the import, call `restoreServe()` and use the
 * returned handler in Deno.test blocks.
 *
 * Usage (note: pass `import.meta.url` so relative specifiers resolve against
 * the *caller's* file, not against testUtils.ts):
 *
 *   import { captureHandler, req, jsonBody } from "../_shared/testUtils.ts";
 *   const { handler, restore } = await captureHandler(
 *     import.meta.url,
 *     "./index.ts",
 *     { OPENAI_API_KEY: "k" },
 *   );
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
 *
 * @param callerUrl       Pass `import.meta.url` from the test file. Relative
 *                        `moduleSpecifier` values are resolved against this
 *                        URL so e.g. `./index.ts` lands on the function under
 *                        test, not on `_shared/index.ts`.
 * @param moduleSpecifier Module path/URL to import. May be relative
 *                        (`./index.ts`) or absolute (`https://…`, `file://…`).
 * @param envOverrides    Optional env overrides merged on top of the default
 *                        test environment.
 */
export async function captureHandler(
  callerUrl: string,
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

  // Resolve relative specifiers against the caller's URL so each test imports
  // the function module sitting next to it, not the one next to testUtils.ts.
  const resolved = new URL(moduleSpecifier, callerUrl).href;
  await import(resolved);

  denoForTest.serve = origServe;

  function restore() {
    envForTest.get = origEnvGet;
  }

  if (!captured) {
    throw new Error(`Deno.serve was not called by ${resolved}`);
  }

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
