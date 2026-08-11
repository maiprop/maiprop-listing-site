export const REQUIRED_STRIPE_SECRET_MESSAGE =
  "STRIPE_SECRET_KEY is required. Export it only in the secure CI/provider shell; never commit it to .env files.";

export const REQUIRED_STRIPE_READ_ONLY_MESSAGE =
  "A live Stripe restricted key is required. Export STRIPE_RESTRICTED_KEY=rk_live_... only in the secure CI/provider shell.";

export function getStripeSecretKey(env = process.env) {
  const key = env.STRIPE_SECRET_KEY ?? env.STRIPE_API_KEY ?? "";
  if (!key) throw new Error(REQUIRED_STRIPE_SECRET_MESSAGE);
  if (!/^sk_(test|live)_/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }
  return key;
}

export function getStripeReadOnlyKey(env = process.env) {
  const key = env.STRIPE_RESTRICTED_KEY ?? "";
  if (!key) throw new Error(REQUIRED_STRIPE_READ_ONLY_MESSAGE);
  if (!/^rk_live_/.test(key)) {
    throw new Error("Stripe read-only checks require STRIPE_RESTRICTED_KEY=rk_live_....");
  }
  return key;
}

export function stripeKeyMetadata(key) {
  const [, kind = "", mode = ""] = String(key).match(/^(sk|rk)_(test|live)_/) ?? [];
  return {
    mode: mode || "unknown",
    keyPrefix: kind && mode ? `${kind}_${mode}_...` : "unknown",
  };
}

export function formatStripeKeyEvidence(key) {
  const metadata = stripeKeyMetadata(key);
  return [
    `Stripe mode: ${metadata.mode}`,
    `Stripe key prefix: ${metadata.keyPrefix}`,
  ].join("\n");
}
