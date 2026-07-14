import Stripe from "npm:stripe@22.3.0";

export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

export type StripeRuntimeMode = "test" | "live";

export const STRIPE_SAAS_PERSONAL_TAX_CODE = "txcd_10103000";
export const STRIPE_SAAS_BUSINESS_TAX_CODE = "txcd_10103001";
export const STRIPE_AI_PERSONAL_TAX_CODE = "txcd_10105001";
export const STRIPE_AI_BUSINESS_TAX_CODE = "txcd_10105002";
export const STRIPE_DEFAULT_PRODUCT_TAX_CODE = STRIPE_SAAS_BUSINESS_TAX_CODE;
export const STRIPE_DEFAULT_TAX_BEHAVIOR = "exclusive";
export const STRIPE_COMPANY_VAT_ID_DEFAULT = "EL802708301";
export const STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME = "Company VAT";

type StripeInvoiceCustomField = {
  name: string;
  value: string;
};

const BUSINESS_SOFTWARE_AUDIENCES = new Set([
  "agent",
  "developer",
  "professional",
  "investor",
  "institutional",
]);

const AI_SOFTWARE_KEYS = new Set([
  "valuation_single",
  "valuation_bundle",
  "neighbourhood_report_single",
  "neighbourhood_report_bundle",
]);

export type StripeSoftwareTaxCodeInput = {
  key?: string | null;
  planKey?: string | null;
  addonKey?: string | null;
  audience?: string | null;
  role?: string | null;
  module?: string | null;
};

export function resolveStripeSoftwareTaxCode(
  input: StripeSoftwareTaxCodeInput,
): string {
  const key = input.key ?? input.planKey ?? input.addonKey ?? "";
  const audience = (input.audience ?? input.role ?? "").toLowerCase();
  const isBusiness = BUSINESS_SOFTWARE_AUDIENCES.has(audience) ||
    input.module === "os_data_products";

  if (AI_SOFTWARE_KEYS.has(key)) {
    return isBusiness
      ? STRIPE_AI_BUSINESS_TAX_CODE
      : STRIPE_AI_PERSONAL_TAX_CODE;
  }

  return isBusiness
    ? STRIPE_SAAS_BUSINESS_TAX_CODE
    : STRIPE_SAAS_PERSONAL_TAX_CODE;
}

export type StripeMetadataInput = {
  checkoutType: string;
  userId?: string | null;
  planKey?: string | null;
  billingCycle?: string | null;
  addonKey?: string | null;
  audience?: string | null;
  module?: string | null;
  unit?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

const normalizeFlag = (value: string | undefined): string =>
  (value ?? "").trim().toLowerCase();

export function getStripeRuntimeMode(): StripeRuntimeMode {
  const explicit = normalizeFlag(
    Deno.env.get("STRIPE_RUNTIME_MODE") ??
      Deno.env.get("STRIPE_ENVIRONMENT") ??
      Deno.env.get("STRIPE_RUN_MODE"),
  );
  if (explicit === "live") return "live";
  if (explicit === "test") return "test";
  throw new Error(
    "STRIPE_RUNTIME_MODE must be explicitly set to test or live.",
  );
}

export function assertStripeKeyMatchesRuntimeMode(
  stripeKey: string,
  runtimeMode: StripeRuntimeMode = getStripeRuntimeMode(),
): void {
  if (runtimeMode === "test" && stripeKey.startsWith("sk_live_")) {
    throw new Error(
      "Stripe test mode is active, but STRIPE_SECRET_KEY is a live key.",
    );
  }
  if (runtimeMode === "live") {
    if (normalizeFlag(Deno.env.get("STRIPE_LIVE_MODE")) !== "true") {
      throw new Error(
        "Live Stripe mode requires STRIPE_LIVE_MODE=true as an explicit opt-in.",
      );
    }
    if (stripeKey.startsWith("sk_test_")) {
      throw new Error(
        "Stripe live mode is active, but STRIPE_SECRET_KEY is a test key.",
      );
    }
  }
}

export function createStripeClient(stripeKey?: string): Stripe {
  const key = stripeKey ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  assertStripeKeyMatchesRuntimeMode(key);
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

export function stripeLivemodeFromRuntime(
  runtimeMode: StripeRuntimeMode = getStripeRuntimeMode(),
): boolean {
  return runtimeMode === "live";
}

export const CHECKOUT_TAX_COLLECTION_PARAMS = {
  automatic_tax: { enabled: true },
  billing_address_collection: "required",
  customer_update: {
    address: "auto",
    name: "auto",
  },
  tax_id_collection: { enabled: true, required: "if_supported" },
} as const;

export function getStripeCompanyVatId(): string | null {
  const value = (
    Deno.env.get("STRIPE_COMPANY_VAT_ID") ??
      Deno.env.get("COMPANY_VAT_ID") ??
      STRIPE_COMPANY_VAT_ID_DEFAULT
  ).trim();
  return value || null;
}

export function getStripeAccountTaxId(): string | null {
  const value = (Deno.env.get("STRIPE_ACCOUNT_TAX_ID") ?? "").trim();
  return value || null;
}

export function buildCompanyVatInvoiceCustomFields(
  existing: StripeInvoiceCustomField[] | null | undefined = undefined,
): StripeInvoiceCustomField[] | undefined {
  const vatId = getStripeCompanyVatId();
  if (!vatId) return existing?.length ? existing : undefined;

  const withoutCompanyVat = (existing ?? []).filter((field) =>
    field.name !== STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME
  );
  return [
    { name: STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME, value: vatId },
    ...withoutCompanyVat,
  ].slice(0, 4);
}

export function buildPaymentModeInvoiceCreationParams(
  metadata: Stripe.MetadataParam,
): Pick<Stripe.Checkout.SessionCreateParams, "invoice_creation"> {
  const accountTaxId = getStripeAccountTaxId();
  const customFields = buildCompanyVatInvoiceCustomFields();
  return {
    invoice_creation: {
      enabled: true,
      invoice_data: {
        metadata,
        ...(accountTaxId ? { account_tax_ids: [accountTaxId] } : {}),
        ...(customFields ? { custom_fields: customFields } : {}),
      },
    },
  };
}

const stripeObjectId = (
  value: string | { id?: string | null } | null | undefined,
): string | null => {
  if (typeof value === "string") return value;
  return value?.id ?? null;
};

export function buildSubscriptionCompanyInvoiceSettingsUpdateParams(
  sub: Pick<Stripe.Subscription, "invoice_settings">,
): Stripe.SubscriptionUpdateParams | null {
  const invoiceSettings = sub.invoice_settings;
  const accountTaxId = getStripeAccountTaxId();
  const existingAccountTaxIds = (invoiceSettings?.account_tax_ids ?? [])
    .map(stripeObjectId)
    .filter((id): id is string => Boolean(id));
  const existingCustomFields = (invoiceSettings?.custom_fields ?? []) as
    | StripeInvoiceCustomField[]
    | null;
  const customFields = buildCompanyVatInvoiceCustomFields(existingCustomFields);
  const vatId = getStripeCompanyVatId();

  const needsAccountTaxId = Boolean(accountTaxId) &&
    !existingAccountTaxIds.includes(accountTaxId as string);
  const needsVatField = Boolean(vatId) &&
    !(existingCustomFields ?? []).some((field) =>
      field.name === STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME &&
      field.value === vatId
    );

  if (!needsAccountTaxId && !needsVatField) return null;

  return {
    invoice_settings: {
      ...(accountTaxId ? { account_tax_ids: [accountTaxId] } : {}),
      ...(customFields ? { custom_fields: customFields } : {}),
    },
  };
}

export async function ensureSubscriptionCompanyInvoiceSettings(
  stripe: Stripe,
  sub: Stripe.Subscription,
): Promise<Stripe.Subscription> {
  const params = buildSubscriptionCompanyInvoiceSettingsUpdateParams(sub);
  if (!params) return sub;
  try {
    return await stripe.subscriptions.update(sub.id, params);
  } catch (error) {
    const customFields = buildCompanyVatInvoiceCustomFields(
      (sub.invoice_settings?.custom_fields ?? []) as StripeInvoiceCustomField[],
    );
    if (!getStripeAccountTaxId() || !customFields) throw error;
    return await stripe.subscriptions.update(sub.id, {
      invoice_settings: { custom_fields: customFields },
    });
  }
}

const metadataValue = (
  value: string | number | boolean | null | undefined,
): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
};

export function stripeMetadata(
  input: StripeMetadataInput,
): Stripe.MetadataParam {
  const raw: Record<string, string | undefined> = {
    checkout_type: metadataValue(input.checkoutType),
    user_id: metadataValue(input.userId),
    plan_key: metadataValue(input.planKey),
    billing_cycle: metadataValue(input.billingCycle),
    addon_key: metadataValue(input.addonKey),
    audience: metadataValue(input.audience),
    module: metadataValue(input.module),
    unit: metadataValue(input.unit),
    target_type: metadataValue(input.targetType),
    target_id: metadataValue(input.targetId),
  };

  for (const [key, value] of Object.entries(input.extra ?? {})) {
    raw[key] = metadataValue(value);
  }

  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] =>
      Boolean(entry[1])
    ),
  );
}

export async function shortSha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function buildIdempotencyKey(
  scope: string,
  parts: Array<string | number | boolean | null | undefined>,
): Promise<string> {
  const normalized = parts
    .map((part) => metadataValue(part) ?? "none")
    .join("|");
  const hash = await shortSha256(normalized);
  return `maiprop-${scope}-${hash}`;
}
