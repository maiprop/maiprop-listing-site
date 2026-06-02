type CheckoutUser = {
  id: string;
  email: string;
};

type LogStep = (step: string, details?: unknown) => void;

type StripeCustomer = {
  id: string;
};

type StripeCustomerClient = {
  customers: {
    search(params: {
      query: string;
      limit: number;
    }): Promise<{ data: StripeCustomer[] }>;
    create(
      params: {
        email: string;
        metadata: { user_id: string };
      },
      options: { idempotencyKey: string },
    ): Promise<StripeCustomer>;
  };
};

const findOwnedStripeCustomer = async (
  stripe: StripeCustomerClient,
  userId: string,
): Promise<StripeCustomer | null> => {
  const search = await stripe.customers.search({
    query: `metadata['user_id']:'${userId}'`,
    limit: 1,
  });
  return search.data[0] ?? null;
};

export const getOrCreateOwnedStripeCustomer = async (
  stripe: StripeCustomerClient,
  user: CheckoutUser,
  logStep: LogStep,
): Promise<string> => {
  const existing = await findOwnedStripeCustomer(stripe, user.id);
  if (existing) {
    logStep("Existing Stripe customer found by user metadata", {
      customerId: existing.id,
    });
    return existing.id;
  }

  const created = await stripe.customers.create({
    email: user.email,
    metadata: { user_id: user.id },
  }, {
    idempotencyKey: `maiprop-customer-${user.id}`,
  });
  logStep("Created Stripe customer with user_id metadata", {
    customerId: created.id,
  });
  return created.id;
};

export const shortSha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
};
