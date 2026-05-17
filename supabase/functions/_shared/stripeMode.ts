export type StripeMode = "live" | "mock";

function normalizeFlag(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getStripeMode(): StripeMode {
  const explicitMode = normalizeFlag(
    Deno.env.get("BILLING_MODE") ?? Deno.env.get("STRIPE_MODE"),
  );
  if (explicitMode === "mock") return "mock";
  if (normalizeFlag(Deno.env.get("STRIPE_MOCK_MODE")) === "true") return "mock";
  return "live";
}

export function isStripeMockMode(): boolean {
  return getStripeMode() === "mock";
}

export function withMockBillingParams(
  path: string,
  params: Record<string, string>,
): string {
  const url = new URL(path, "https://mock.local");
  url.searchParams.set("billing_mode", "mock");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
