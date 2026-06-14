import { supabase } from "@/integrations/supabase/client";
import type { FunctionInvokeOptions } from "@supabase/functions-js";

type InvokeOptions = Omit<FunctionInvokeOptions, "headers"> & {
  headers?: Record<string, string>;
};

const TOKEN_REFRESH_LEEWAY_SECONDS = 60;
const AUTH_ERROR_RE = /invalid or expired token|authentication required|jwt|unauthorized/i;

function getErrorMessage(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return [row.error, row.message, row.msg].filter(Boolean).join(" ");
  }
  return "";
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const row = error as { status?: unknown; context?: unknown };
  if (typeof row.status === "number") return row.status;
  if (row.context instanceof Response) return row.context.status;
  if (row.context && typeof row.context === "object" && typeof (row.context as { status?: unknown }).status === "number") {
    return (row.context as { status: number }).status;
  }
  return null;
}

function isAuthFailure(data: unknown, error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401 || status === 403) return true;
  return AUTH_ERROR_RE.test(`${getErrorMessage(error)} ${getErrorMessage(data)}`);
}

async function getAccessToken(forceRefresh = false): Promise<string | null> {
  const auth = (supabase as typeof supabase & {
    auth?: {
      getSession?: typeof supabase.auth.getSession;
      refreshSession?: typeof supabase.auth.refreshSession;
    };
  }).auth;
  if (!auth?.getSession || !auth.refreshSession) return null;

  const { data } = await auth.getSession();
  const session = data.session;
  const expiresAt = session?.expires_at ?? 0;
  const shouldRefresh =
    forceRefresh ||
    !session?.access_token ||
    (expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) <= TOKEN_REFRESH_LEEWAY_SECONDS);

  if (!shouldRefresh) return session.access_token;

  const refreshed = await auth.refreshSession();
  return refreshed.data.session?.access_token ?? session?.access_token ?? null;
}

async function invokeWithSession<T>(
  functionName: string,
  options: InvokeOptions,
  forceRefresh: boolean,
) {
  const accessToken = await getAccessToken(forceRefresh);
  const headers = accessToken
    ? { ...options.headers, Authorization: `Bearer ${accessToken}` }
    : options.headers;
  return supabase.functions.invoke<T>(functionName, headers ? { ...options, headers } : options);
}

export async function invokeAuthenticatedFunction<T = unknown>(
  functionName: string,
  options: InvokeOptions = {},
) {
  const first = await invokeWithSession<T>(functionName, options, false);
  if (!isAuthFailure(first.data, first.error)) return first;
  return invokeWithSession<T>(functionName, options, true);
}
