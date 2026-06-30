import {
  STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
  buildCompanyVatInvoiceCustomFields,
  getStripeCompanyVatId,
} from "../_shared/stripeClient.ts";

type CheckoutUser = {
  id: string;
  email: string;
};

type LogStep = (step: string, details?: unknown) => void;

type StripeCustomer = {
  id: string;
  invoice_settings?: {
    custom_fields?: StripeInvoiceCustomField[] | null;
  } | null;
};

type StripeInvoiceCustomField = {
  name: string;
  value: string;
};

type StripeCustomerInvoiceSettingsParams = {
  invoice_settings: {
    custom_fields: StripeInvoiceCustomField[];
  };
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
        invoice_settings?: {
          custom_fields?: StripeInvoiceCustomField[];
        };
      },
      options: { idempotencyKey: string },
    ): Promise<StripeCustomer>;
    update(
      customerId: string,
      params: StripeCustomerInvoiceSettingsParams,
    ): Promise<StripeCustomer>;
  };
};

export const buildCustomerCompanyInvoiceSettingsParams = (
  customer?: StripeCustomer | null,
): StripeCustomerInvoiceSettingsParams | null => {
  const vatId = getStripeCompanyVatId();
  if (!vatId) return null;
  const existing = customer?.invoice_settings?.custom_fields ?? [];
  const alreadyStamped = existing.some((field) =>
    field.name === STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME &&
    field.value === vatId
  );
  if (alreadyStamped) return null;

  const customFields = buildCompanyVatInvoiceCustomFields(existing);
  if (!customFields?.length) return null;
  return { invoice_settings: { custom_fields: customFields } };
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
    const invoiceSettings = buildCustomerCompanyInvoiceSettingsParams(existing);
    if (invoiceSettings) {
      await stripe.customers.update(existing.id, invoiceSettings);
      logStep("Stamped Stripe customer invoice VAT settings", {
        customerId: existing.id,
      });
    }
    logStep("Existing Stripe customer found by user metadata", {
      customerId: existing.id,
    });
    return existing.id;
  }

  const invoiceSettings = buildCustomerCompanyInvoiceSettingsParams();
  const created = await stripe.customers.create({
    email: user.email,
    metadata: { user_id: user.id },
    ...(invoiceSettings ?? {}),
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
