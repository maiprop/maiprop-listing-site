export const REQUIRED_STRIPE_SECRET_MESSAGE =
  "STRIPE_SECRET_KEY is required. Export it only in the secure CI/provider shell; never commit it to .env files.";

export const REQUIRED_STRIPE_READ_ONLY_MESSAGE =
  "STRIPE_RESTRICTED_KEY=rk_live_... is required for live Stripe readiness; standard, test, alias, and fallback keys are rejected.";

const STRIPE_READINESS_ALIASES = [
  "STRIPE_READ_ONLY_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_API_KEY",
  "STRIPE_LIVE_SECRET_KEY",
  "STRIPE_SECRET_KEY_LIVE",
];

export function getStripeSecretKey(env = process.env) {
  const key = env.STRIPE_SECRET_KEY ?? env.STRIPE_API_KEY ?? "";
  if (!key) throw new Error(REQUIRED_STRIPE_SECRET_MESSAGE);
  if (!/^sk_(test|live)_/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key.");
  }
  return key;
}

export function getStripeReadOnlyKey(env = process.env) {
  const configuredAliases = STRIPE_READINESS_ALIASES.filter((name) =>
    String(env[name] ?? "").trim().length > 0
  );
  if (configuredAliases.length > 0) {
    throw new Error(
      `${REQUIRED_STRIPE_READ_ONLY_MESSAGE} Remove Stripe alias/fallback variables: ${configuredAliases.join(", ")}.`,
    );
  }
  const key = String(env.STRIPE_RESTRICTED_KEY ?? "").trim();
  if (!key) throw new Error(REQUIRED_STRIPE_READ_ONLY_MESSAGE);
  if (!/^rk_live_[A-Za-z0-9]+$/.test(key)) {
    throw new Error(REQUIRED_STRIPE_READ_ONLY_MESSAGE);
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
