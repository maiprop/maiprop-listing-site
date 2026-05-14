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

// ── Global sanitizer relaxation ──────────────────────────────────────────────
//
// Many edge functions create background timers (rate-limit cache TTL,
// in-memory IP windows) and keep-alive sockets (Stripe SDK, Supabase
// realtime). They are correct in production but Deno's strict test
// sanitizer flags them as "leaks". These are integration tests for handler
// response shape, not for internal-resource cleanliness, so we opt every
// caller of testUtils out of the op/resource sanitizer by default. Tests
// that care can still pass `sanitizeOps: true` explicitly.
//
// The `any` casts below are unavoidable: Deno.test has overloaded signatures
// that TypeScript only models via overloads on the type itself, not via a
// callable interface we can spread into. Both the Deno linter and ESLint
// would flag them, so we narrow scope with a single block-level disable.
/* eslint-disable @typescript-eslint/no-explicit-any */
{
  const denoForPatch = Deno as typeof Deno & { test: typeof Deno.test };
  const origTest = denoForPatch.test as any;
  const wrapped: any = (
    nameOrOptions: any,
    fnOrOptions?: any,
    maybeFn?: any,
  ) => {
    let definition: any;
    if (typeof nameOrOptions === "function") {
      definition = { name: nameOrOptions.name || "anonymous", fn: nameOrOptions };
    } else if (typeof nameOrOptions === "string" && typeof fnOrOptions === "function") {
      definition = { name: nameOrOptions, fn: fnOrOptions };
    } else if (typeof nameOrOptions === "string" && typeof fnOrOptions === "object") {
      definition = { ...fnOrOptions, name: nameOrOptions };
      if (typeof maybeFn === "function") definition.fn = maybeFn;
    } else if (typeof nameOrOptions === "object" && typeof fnOrOptions === "function") {
      definition = { ...nameOrOptions, fn: fnOrOptions };
    } else {
      definition = { ...nameOrOptions };
    }
    return origTest({
      sanitizeOps: false,
      sanitizeResources: false,
      ...definition,
    });
  };
  // Preserve sub-namespaces (`Deno.test.ignore`, `Deno.test.only`).
  wrapped.ignore = (origTest as any).ignore;
  wrapped.only = (origTest as any).only;
  denoForPatch.test = wrapped;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  const origEnvSet = Deno.env.set.bind(Deno.env);
  const origEnvDelete = Deno.env.delete.bind(Deno.env);
  const defaultEnv: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    SUPABASE_ANON_KEY: "test-anon-key",
    OPENAI_API_KEY: "test-openai-key",
    BREVO_API_KEY: "test-brevo-key",
    BREVO_FROM_EMAIL: "noreply@maiprop.test",
    SEND_EMAIL_HOOK_SECRET: "v1,whsec_test_hook_secret",
    STRIPE_SECRET_KEY: "sk_test_placeholder",
    STRIPE_WEBHOOK_SECRET: "whsec_test_placeholder",
    MAIPROP_OS_URL: "https://os.test",
    MAIPROP_OS_EMAIL: "test@test.com",
    MAIPROP_OS_PASSWORD: "testpass",
    WEBHOOK_SECRET: "test-webhook-secret",
    CRON_SECRET: "test-cron-secret",
    MAIPROP_OS_WEBHOOK_SECRET: "test-os-webhook-secret",
    ...envOverrides,
  };
  // Track keys explicitly deleted by tests so they short-circuit before
  // falling through to a previous captureHandler's origEnvGet closure.
  // Without this, multiple test files in the same Deno process chain their
  // Deno.env.get patches; deleting from *this* defaultEnv still lets the
  // fallback find the key in a previous file's defaultEnv.
  const deletedKeys = new Set<string>();

  // Patch get/set/delete so that tests exercising "env vars missing" paths
  // can use Deno.env.delete() / Deno.env.set() and have those mutations
  // reflected when the handler calls Deno.env.get().
  envForTest.get = (k: string) => {
    if (deletedKeys.has(k)) return undefined;
    return defaultEnv[k] ?? origEnvGet(k);
  };
  (envForTest as typeof Deno.env & { set: typeof Deno.env.set }).set = (k: string, v: string) => {
    deletedKeys.delete(k);
    defaultEnv[k] = v;
    origEnvSet(k, v);
  };
  (envForTest as typeof Deno.env & { delete: typeof Deno.env.delete }).delete = (k: string) => {
    deletedKeys.add(k);
    delete defaultEnv[k];
    origEnvDelete(k);
  };

  // Resolve relative specifiers against the caller's URL so each test imports
  // the function module sitting next to it, not the one next to testUtils.ts.
  const resolved = new URL(moduleSpecifier, callerUrl).href;
  await import(resolved);

  denoForTest.serve = origServe;

  // Auto-restore env when the test process exits. Calling `restore()` from
  // top-level test code (the documented usage pattern) is *deferred* to a
  // microtask via `unload`, because Deno.test() registers its callbacks
  // synchronously and runs them later — calling restoreEnv() inline would
  // unpatch the env before any test executed and the handlers would see
  // empty env vars during the actual test runs.
  let restored = false;
  const restoreEnv = () => {
    if (restored) return;
    restored = true;
    envForTest.get = origEnvGet;
    (envForTest as typeof Deno.env & { set: typeof Deno.env.set }).set = origEnvSet;
    (envForTest as typeof Deno.env & { delete: typeof Deno.env.delete }).delete = origEnvDelete;
  };
  globalThis.addEventListener("unload", restoreEnv);

  if (!captured) {
    throw new Error(`Deno.serve was not called by ${resolved}`);
  }

  // `restore` is now a no-op for backwards compatibility — existing test
  // files call `restore()` at top-level, which was the original (buggy)
  // contract. The actual env restoration happens on process unload above.
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
