export type StripeRuntimeMode = "test" | "live";

const normalizeRuntimeMode = (value: unknown): StripeRuntimeMode | null => {
  if (value === "test" || value === "live") return value;
  return null;
};

export function getClientStripeRuntimeMode(): StripeRuntimeMode | null {
  const explicit = normalizeRuntimeMode(import.meta.env.VITE_STRIPE_RUNTIME_MODE);
  if (explicit) return explicit;

  const billingMode = normalizeRuntimeMode(import.meta.env.VITE_BILLING_MODE);
  if (billingMode) return billingMode;

  const publishableKey = String(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");
  if (publishableKey.startsWith("pk_live_")) return "live";
  if (publishableKey.startsWith("pk_test_")) return "test";
  return null;
}
