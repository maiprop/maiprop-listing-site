export const MAIPROP_STRIPE_SANDBOX_ACCOUNT_ID = "acct_1TnuLbGfkWWBWEyh";

export function isStageReleaseCatalogMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.staging_catalog_initialized_by_stage_release === true;
}

export function assertMarkedStagingCatalogBoundary(
  metadata: Record<string, unknown> | null | undefined,
  stripeKey: string,
  expectedAccountId: string | null | undefined,
): boolean {
  if (!isStageReleaseCatalogMetadata(metadata)) return false;
  if (!/^sk_test_[A-Za-z0-9]+$/.test(stripeKey)) {
    throw new Error(
      "Stage-release catalog initialization requires a Stripe test-mode secret.",
    );
  }
  if (expectedAccountId !== MAIPROP_STRIPE_SANDBOX_ACCOUNT_ID) {
    throw new Error(
      "Stage-release catalog initialization requires the exact MaiProp sandbox account.",
    );
  }
  return true;
}

type StagingCatalogCreateKind = "product" | "monthly" | "annual";

export function stagingCatalogIdempotencyKey({
  configId,
  kind,
  currency,
  amount,
  interval,
}: {
  configId: string;
  kind: StagingCatalogCreateKind;
  currency: string;
  amount: number;
  interval: string;
}): string {
  if (
    !configId || !/^[a-z]+$/.test(currency) || !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new Error("Staging catalog idempotency inputs are invalid.");
  }
  return [
    "maiprop-stage-catalog-v1",
    kind,
    configId,
    currency,
    String(amount),
    interval,
  ].join(":");
}
