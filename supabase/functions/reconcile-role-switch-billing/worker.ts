import {
  type RoleSwitchBillingResult,
  unknownRoleSwitchBillingResult,
} from "../log-role-switch/billing.ts";

export const RECONCILIATION_CLAIM_RPC =
  "claim_role_switch_reconciliation_batch" as const;
export const RECONCILIATION_RELEASE_RPC =
  "release_role_switch_reconciliation_claims" as const;
export const RECONCILIATION_COMPLETE_RPC =
  "complete_role_switch_reconciliation_attempt" as const;
export const DEFAULT_RECONCILIATION_REQUEST_DEADLINE_MS = 50_000;
export const DEFAULT_RECONCILIATION_COMPLETION_RESERVE_MS = 8_000;

export class ReconciliationDeadlineError extends Error {
  constructor(message = "Role-switch reconciliation deadline exceeded") {
    super(message);
    this.name = "ReconciliationDeadlineError";
  }
}

export type ReconciliationClaim = {
  audit_id: string;
  user_id: string;
  lock_token: string;
  attempt_count: number;
};

export type ReconciliationCompletion = {
  auditId: string;
  userId: string;
  lockToken: string;
  billingOutcome: RoleSwitchBillingResult["billingOutcome"];
  billingError: string | null;
  hadActiveSub: boolean | null;
  subscriptionCount: number | null;
  cancelledCount: number | null;
};

type ReconciliationWorkerDependencies = {
  claim: (signal: AbortSignal) => Promise<ReconciliationClaim[]>;
  loadUser: (
    userId: string,
    signal: AbortSignal,
  ) => Promise<{ id: string; email: string }>;
  reconcile: (
    claim: ReconciliationClaim,
    user: { id: string; email: string },
    signal: AbortSignal,
  ) => Promise<RoleSwitchBillingResult>;
  complete: (
    completion: ReconciliationCompletion,
    signal: AbortSignal,
  ) => Promise<void>;
  release?: (
    claims: ReconciliationClaim[],
    signal: AbortSignal,
  ) => Promise<void>;
  onError?: (claim: ReconciliationClaim, error: unknown) => void;
};

type ReconciliationWorkerOptions = {
  requestDeadlineMs?: number;
  completionReserveMs?: number;
};

const deadlineReason = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new ReconciliationDeadlineError();

async function awaitWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw deadlineReason(signal);
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(deadlineReason(signal));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function processReconciliationBatch(
  dependencies: ReconciliationWorkerDependencies,
  options: ReconciliationWorkerOptions = {},
): Promise<{
  claimed: number;
  completed: number;
  retryable: number;
  failed: number;
  deferred: number;
  deadlineReached: boolean;
}> {
  const requestDeadlineMs = options.requestDeadlineMs ??
    DEFAULT_RECONCILIATION_REQUEST_DEADLINE_MS;
  const completionReserveMs = options.completionReserveMs ??
    DEFAULT_RECONCILIATION_COMPLETION_RESERVE_MS;
  if (
    !Number.isFinite(requestDeadlineMs) || requestDeadlineMs < 2 ||
    !Number.isFinite(completionReserveMs) || completionReserveMs < 1 ||
    completionReserveMs >= requestDeadlineMs
  ) {
    throw new Error("Invalid reconciliation deadline configuration");
  }

  const workController = new AbortController();
  const requestController = new AbortController();
  const workTimer = setTimeout(
    () => workController.abort(new ReconciliationDeadlineError()),
    requestDeadlineMs - completionReserveMs,
  );
  const requestTimer = setTimeout(
    () => requestController.abort(new ReconciliationDeadlineError()),
    requestDeadlineMs,
  );

  let claims: ReconciliationClaim[] = [];
  let completed = 0;
  let retryable = 0;
  let failed = 0;
  let deferred = 0;
  let deferredClaims: ReconciliationClaim[] = [];
  let deadlineReached = false;

  try {
    claims = await awaitWithAbort(
      dependencies.claim(workController.signal),
      workController.signal,
    );

    for (let index = 0; index < claims.length; index += 1) {
      if (workController.signal.aborted) {
        deadlineReached = true;
        deferredClaims = claims.slice(index);
        deferred = deferredClaims.length;
        break;
      }

      const claim = claims[index];
      let billingResult: RoleSwitchBillingResult;
      try {
        const user = await awaitWithAbort(
          dependencies.loadUser(claim.user_id, workController.signal),
          workController.signal,
        );
        billingResult = await awaitWithAbort(
          dependencies.reconcile(claim, user, workController.signal),
          requestController.signal,
        );
        if (workController.signal.aborted) {
          deadlineReached = true;
          deferredClaims = claims.slice(index);
          deferred = deferredClaims.length;
          break;
        }
      } catch (error: unknown) {
        dependencies.onError?.(claim, error);
        if (
          workController.signal.aborted || requestController.signal.aborted
        ) {
          deadlineReached = true;
          deferredClaims = claims.slice(index);
          deferred = deferredClaims.length;
          break;
        }
        billingResult = unknownRoleSwitchBillingResult(error);
      }

      try {
        await awaitWithAbort(
          dependencies.complete({
            auditId: claim.audit_id,
            userId: claim.user_id,
            lockToken: claim.lock_token,
            billingOutcome: billingResult.billingOutcome,
            billingError: billingResult.billingError,
            hadActiveSub: billingResult.hadActiveSub,
            subscriptionCount: billingResult.subscriptionCount,
            cancelledCount: billingResult.cancelledCount,
          }, requestController.signal),
          requestController.signal,
        );
        if (billingResult.billingOutcome === "unknown") retryable += 1;
        else completed += 1;
      } catch (error: unknown) {
        dependencies.onError?.(claim, error);
        failed += 1;
        if (requestController.signal.aborted) deadlineReached = true;
      }

      if (deadlineReached || requestController.signal.aborted) {
        deadlineReached = true;
        deferredClaims = claims.slice(index + 1);
        deferred = deferredClaims.length;
        break;
      }
    }

    if (deferredClaims.length > 0 && dependencies.release) {
      try {
        await awaitWithAbort(
          dependencies.release(deferredClaims, requestController.signal),
          requestController.signal,
        );
      } catch (error: unknown) {
        dependencies.onError?.(deferredClaims[0], error);
        failed += 1;
        if (requestController.signal.aborted) deadlineReached = true;
      }
    }
  } finally {
    clearTimeout(workTimer);
    clearTimeout(requestTimer);
  }

  return {
    claimed: claims.length,
    completed,
    retryable,
    failed,
    deferred,
    deadlineReached,
  };
}
