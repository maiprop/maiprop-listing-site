export const REQUIRED_STRIPE_SECRET_MESSAGE =
  "STRIPE_SECRET_KEY is required. Export it only in the secure CI/provider shell; never commit it to .env files.";

export function getStripeSecretKey(env = process.env) {
  const key = env.STRIPE_SECRET_KEY ?? env.STRIPE_API_KEY ?? "";
  if (!key) throw new Error(REQUIRED_STRIPE_SECRET_MESSAGE);
  if (!/^sk_(test|live)_/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }
  return key;
}

export function stripeKeyMetadata(key) {
  return {
    mode: key.startsWith("sk_live_") ? "live" : "test",
    keyPrefix: key.startsWith("sk_live_") ? "sk_live_..." : "sk_test_...",
  };
}

export function formatStripeKeyEvidence(key) {
  const metadata = stripeKeyMetadata(key);
  return [
    `Stripe mode: ${metadata.mode}`,
    `Stripe key prefix: ${metadata.keyPrefix}`,
  ].join("\n");
}
