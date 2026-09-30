/**
 * Server-owned retry worker for role-switch billing audits.
 *
 * pg_cron invokes this boundary with a Vault-backed CRON_SECRET. PostgreSQL
 * leases exact audit rows; this function only performs Stripe verification and
 * returns the result against the same audit/user/lease tuple.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { Database } from "../../../src/integrations/supabase/types.ts";
import { createLogger } from "../_shared/logger.ts";
import { createVerifiedStripeClient } from "../_shared/stripeClient.ts";
import {
  BillingResolutionError,
  reconcileRoleSwitchBilling,
  stripeRuntimeFromKey,
} from "../log-role-switch/billing.ts";
import {
  DEFAULT_RECONCILIATION_COMPLETION_RESERVE_MS,
  DEFAULT_RECONCILIATION_REQUEST_DEADLINE_MS,
  processReconciliationBatch,
  RECONCILIATION_CLAIM_RPC,
  RECONCILIATION_COMPLETE_RPC,
  RECONCILIATION_RELEASE_RPC,
  ReconciliationDeadlineError,
} from "./worker.ts";

const log = createLogger("reconcile-role-switch-billing");
const MAX_RECONCILIATION_ATTEMPTS = 6;
const RECONCILIATION_BATCH_SIZE = 10;
export const RECONCILIATION_REQUEST_DEADLINE_MS =
  DEFAULT_RECONCILIATION_REQUEST_DEADLINE_MS;
const RECONCILIATION_COMPLETION_RESERVE_MS =
  DEFAULT_RECONCILIATION_COMPLETION_RESERVE_MS;

type FunctionDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions:
      & Omit<
        Database["public"]["Functions"],
        "complete_role_switch_reconciliation_attempt"
      >
      & {
        complete_role_switch_reconciliation_attempt: {
          Args: {
            _audit_id: string;
            _user_id: string;
            _lock_token: string;
            _billing_outcome: string;
            _billing_error: string | null;
            _had_active_sub: boolean | null;
            _subscription_count: number | null;
            _cancelled_count: number | null;
            _max_attempts?: number;
          };
          Returns: undefined;
        };
      };
  };
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const secretsEqual = (provided: string | null, expected: string): boolean => {
  if (!provided || provided.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (
    !cronSecret || !secretsEqual(req.headers.get("x-cron-secret"), cronSecret)
  ) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey || !stripeKey) {
    return jsonResponse({ error: "Service unavailable" }, 503);
  }

  let runtime: ReturnType<typeof stripeRuntimeFromKey>;
  try {
    runtime = stripeRuntimeFromKey(stripeKey);
  } catch (error: unknown) {
    log.error("Stripe runtime could not be established", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse({ error: "Service unavailable" }, 503);
  }

  try {
    const supabase = createClient<FunctionDatabase>(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const stripe = await createVerifiedStripeClient(stripeKey);
    const workerId = crypto.randomUUID();

    const result = await processReconciliationBatch({
      claim: async (signal) => {
        const { data, error } = await supabase
          .rpc(RECONCILIATION_CLAIM_RPC, {
            _worker_id: workerId,
            _batch_size: RECONCILIATION_BATCH_SIZE,
            _max_attempts: MAX_RECONCILIATION_ATTEMPTS,
          })
          .abortSignal(signal);
        if (error) throw new Error(error.message);
        return data ?? [];
      },
      loadUser: async (userId) => {
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        const email = data.user?.email;
        if (error || !data.user || !email) {
          throw new BillingResolutionError(
            "Role-switch user identity unavailable",
          );
        }
        return { id: data.user.id, email };
      },
      reconcile: async (claim, user, signal) =>
        reconcileRoleSwitchBilling({
          stripe,
          user,
          auditId: claim.audit_id,
          signal,
          lookupDurableCustomerId: async (lookupSignal) => {
            const { data, error } = await supabase
              .from("billing_customers")
              .select("stripe_customer_id")
              .eq("user_id", claim.user_id)
              .eq("runtime_mode", runtime.runtimeMode)
              .eq("livemode", runtime.livemode)
              .order("updated_at", { ascending: false })
              .limit(1)
              .abortSignal(lookupSignal ?? signal);
            if (error) {
              throw new BillingResolutionError(
                error.message || "Durable billing customer lookup failed",
              );
            }
            return data?.[0]?.stripe_customer_id ?? null;
          },
          onMetadataSearchError: (error) => {
            log.warn("Stripe metadata search failed during reconciliation", {
              auditId: claim.audit_id,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        }),
      complete: async (completion, signal) => {
        const { error } = await supabase
          .rpc(RECONCILIATION_COMPLETE_RPC, {
            _audit_id: completion.auditId,
            _user_id: completion.userId,
            _lock_token: completion.lockToken,
            _billing_outcome: completion.billingOutcome,
            _billing_error: completion.billingError,
            _had_active_sub: completion.hadActiveSub,
            _subscription_count: completion.subscriptionCount,
            _cancelled_count: completion.cancelledCount,
            _max_attempts: MAX_RECONCILIATION_ATTEMPTS,
          })
          .abortSignal(signal);
        if (error) throw new Error(error.message);
      },
      release: async (claims, signal) => {
        const { error } = await supabase
          .rpc(RECONCILIATION_RELEASE_RPC, {
            _worker_id: workerId,
            _audit_ids: claims.map((claim) => claim.audit_id),
          })
          .abortSignal(signal);
        if (error) throw new Error(error.message);
      },
      onError: (claim, error) => {
        log.error("Role-switch reconciliation attempt failed", {
          auditId: claim.audit_id,
          attempt: claim.attempt_count,
          error: error instanceof Error ? error.message : String(error),
        });
      },
    }, {
      requestDeadlineMs: RECONCILIATION_REQUEST_DEADLINE_MS,
      completionReserveMs: RECONCILIATION_COMPLETION_RESERVE_MS,
    });

    return jsonResponse(
      {
        success: result.failed === 0 && !result.deadlineReached,
        ...result,
      },
      result.deadlineReached ? 504 : result.failed === 0 ? 200 : 500,
    );
  } catch (error: unknown) {
    log.error("Role-switch reconciliation batch failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(
      {
        error: error instanceof ReconciliationDeadlineError
          ? "Reconciliation deadline exceeded"
          : "Reconciliation unavailable",
      },
      error instanceof ReconciliationDeadlineError ? 504 : 500,
    );
  }
});
