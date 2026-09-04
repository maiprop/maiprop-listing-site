import {
  assertMarkedStagingCatalogBoundary,
  MAIPROP_STRIPE_SANDBOX_ACCOUNT_ID,
  stagingCatalogIdempotencyKey,
} from "./stagingCatalog.ts";
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("marked staging catalog rejects live and wrong-account credentials before mutation", () => {
  const metadata = { staging_catalog_initialized_by_stage_release: true };
  assertThrows(
    () =>
      assertMarkedStagingCatalogBoundary(
        metadata,
        "sk_live_forbidden",
        MAIPROP_STRIPE_SANDBOX_ACCOUNT_ID,
      ),
    Error,
    "test-mode secret",
  );
  assertThrows(
    () =>
      assertMarkedStagingCatalogBoundary(
        metadata,
        "sk_test_synthetic",
        "acct_wrong",
      ),
    Error,
    "sandbox account",
  );
  assertEquals(
    assertMarkedStagingCatalogBoundary(
      metadata,
      "sk_test_synthetic",
      MAIPROP_STRIPE_SANDBOX_ACCOUNT_ID,
    ),
    true,
  );
  assertEquals(
    assertMarkedStagingCatalogBoundary(
      {},
      "sk_live_allowed_for_unmarked",
      "acct_other",
    ),
    false,
  );
});

Deno.test("marked staging catalog idempotency keys are stable and input-bound", () => {
  const input = {
    configId: "6f0b9f70-6ff0-4ed1-a35a-c629e73418fd",
    kind: "monthly" as const,
    currency: "eur",
    amount: 2900,
    interval: "month",
  };
  assertEquals(
    stagingCatalogIdempotencyKey(input),
    stagingCatalogIdempotencyKey(input),
  );
  assertEquals(
    stagingCatalogIdempotencyKey({
      ...input,
      kind: "annual",
      amount: 29000,
      interval: "year",
    }) ===
      stagingCatalogIdempotencyKey(input),
    false,
  );
});
