import Stripe from "npm:stripe@22.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { isStripeMockMode } from "../_shared/stripeMode.ts";
import { createVerifiedStripeClient } from "../_shared/stripeClient.ts";
import { hasProvisionedSubscriptionAccess } from "../_shared/subscriptionStatus.ts";

type PriceWithRecurring = Stripe.Price & {
  recurring?: { interval?: string | null } | null;
};

type SubscriptionWithPeriodEnd = Stripe.Subscription & {
  current_period_end?: number | null;
  trial_end?: number | null;
};

type SubscriptionItemWithPeriodEnd = Stripe.SubscriptionItem & {
  current_period_end?: number | null;
  current_period_start?: number | null;
};

type DurableBillingSubscriptionRow = {
  stripe_subscription_id?: string | null;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  plan_key?: string | null;
  status?: string | null;
  billing_cycle?: "monthly" | "annual" | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  cancel_at_period_end?: boolean | null;
};

type DurableBillingCustomerRow = {
  stripe_customer_id?: string | null;
};

type DurableBillingState = {
  subscription: Record<string, unknown> | null;
  customerFound: boolean;
};

type DurableBillingReadResult = {
  data?: unknown[] | unknown | null;
  error?: { message?: string } | null;
};

type DurableBillingReadFilter = {
  eq(column: string, value: string): DurableBillingReadFilter;
  in(column: string, values: string[]): DurableBillingReadFilter;
  order(
    column: string,
    options: { ascending: boolean },
  ): DurableBillingReadFilter;
  limit(count: number): PromiseLike<DurableBillingReadResult>;
};

type DurableBillingReadClient = {
  from(table: "billing_subscriptions" | "billing_customers"): {
    select(columns: string): DurableBillingReadFilter;
  };
};

type StripeInvoiceTaxEntry = {
  amount?: number | null;
  tax_rate?: string | {
    id?: string | null;
    display_name?: string | null;
    percentage?: number | null;
    country?: string | null;
  } | null;
  taxability_reason?: string | null;
  taxable_amount?: number | null;
};

type StripeInvoiceWithTaxDetails = Stripe.Invoice & {
  amount_tax?: number | null;
  automatic_tax?: {
    enabled?: boolean | null;
    status?: string | null;
  } | null;
  customer_tax_ids?: Array<
    string | {
      id?: string | null;
      type?: string | null;
      value?: string | null;
    }
  > | null;
  total_tax_amounts?: StripeInvoiceTaxEntry[] | null;
  total_taxes?: StripeInvoiceTaxEntry[] | null;
};

type StripeChargeLike = {
  id?: string | null;
  paid?: boolean | null;
  status?: string | null;
  receipt_url?: string | null;
};

type StripePaymentIntentLike = {
  id?: string | null;
  latest_charge?: string | StripeChargeLike | null;
  charges?: {
    data?: StripeChargeLike[] | null;
  } | null;
};

type StripeInvoicePaymentLike = {
  status?: string | null;
  payment?: {
    type?: string | null;
    charge?: string | StripeChargeLike | null;
    payment_intent?: string | StripePaymentIntentLike | null;
  } | null;
};

const log = createLogger("get-invoices");
const limiter = makeRateLimiter({
  bucket: "get-invoices",
  maxRequests: 15,
  windowMs: 60_000,
});

function isStripeSubscribed(status: string | null | undefined) {
  return hasProvisionedSubscriptionAccess(status);
}

function normalizeDurableBillingSubscription(
  row: DurableBillingSubscriptionRow | null,
): Record<string, unknown> | null {
  if (!row?.stripe_subscription_id) return null;
  const effectivePeriodEnd = row.status === "trialing"
    ? row.trial_end ?? row.current_period_end ?? null
    : row.current_period_end ?? null;
  return {
    id: row.stripe_subscription_id,
    status: row.status ?? "unknown",
    current_period_end: effectivePeriodEnd,
    cancel_at_period_end: row.cancel_at_period_end === true,
    plan_name: row.plan_key ?? row.stripe_product_id ?? "Subscription",
    amount: null,
    currency: "EUR",
    interval: row.billing_cycle === "annual" ? "year" : "month",
    product_id: row.stripe_product_id ?? null,
    price_id: row.stripe_price_id ?? null,
    subscription_item_id: null,
    source: "billing_state",
  };
}

function isValidDurableBillingSubscription(
  row: DurableBillingSubscriptionRow | null,
  now = new Date(),
): boolean {
  if (!row || !hasProvisionedSubscriptionAccess(row.status)) return false;
  const entitlementEnd = row.status === "trialing"
    ? row.trial_end ?? row.current_period_end
    : row.current_period_end;
  if (!entitlementEnd) return row.status !== "trialing";
  const periodEnd = new Date(entitlementEnd);
  return !Number.isNaN(periodEnd.getTime()) && periodEnd > now;
}

async function readDurableBillingState(
  supabase: DurableBillingReadClient,
  userId: string,
): Promise<DurableBillingState> {
  const [subscriptionResult, customerResult] = await Promise.all([
    supabase.from("billing_subscriptions")
      .select("stripe_subscription_id, stripe_product_id, stripe_price_id, plan_key, status, billing_cycle, current_period_end, trial_end, cancel_at_period_end")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"])
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase.from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);

  if (subscriptionResult.error) {
    throw new Error(subscriptionResult.error.message ?? "billing subscription lookup failed");
  }
  if (customerResult.error) {
    throw new Error(customerResult.error.message ?? "billing customer lookup failed");
  }

  const subscriptionRows = Array.isArray(subscriptionResult.data)
    ? subscriptionResult.data
    : subscriptionResult.data
    ? [subscriptionResult.data]
    : [];
  const subscription = ((subscriptionRows as DurableBillingSubscriptionRow[])
    .find((row) => isValidDurableBillingSubscription(row)) ?? null);
  const customerRows = Array.isArray(customerResult.data)
    ? customerResult.data
    : customerResult.data
    ? [customerResult.data]
    : [];
  return {
    subscription: normalizeDurableBillingSubscription(
      subscription,
    ),
    customerFound: Boolean(
      (customerRows[0] as DurableBillingCustomerRow | undefined)
        ?.stripe_customer_id,
    ),
  };
}

function durableBillingResponse(
  corsHeaders: Record<string, string>,
  durableBilling: DurableBillingState,
  billingConfigured: boolean,
): Response {
  return new Response(
    JSON.stringify({
      invoices: [],
      subscription: durableBilling.subscription,
      billing_configured: billingConfigured,
      customer_found: durableBilling.customerFound,
      portal_eligible: false,
      billing_reason: "billing_state",
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    },
  );
}

function minorToMajor(value: number | null | undefined): number | null {
  return typeof value === "number" ? value / 100 : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.id === "string") return value.id;
  return null;
}

function nestedChargeFromPaymentIntent(
  value: unknown,
): StripeChargeLike | null {
  if (!isRecord(value)) return null;
  const latestCharge = value.latest_charge;
  if (isRecord(latestCharge)) return latestCharge as StripeChargeLike;
  const charges = value.charges;
  if (isRecord(charges) && Array.isArray(charges.data)) {
    return (charges.data.find((charge) =>
      isRecord(charge) && typeof charge.receipt_url === "string"
    ) ?? charges.data[0] ?? null) as StripeChargeLike | null;
  }
  return null;
}

function extractInvoiceReceipt(inv: StripeInvoiceWithTaxDetails) {
  const rawInvoice = inv as unknown as Record<string, unknown>;
  const directCharge = isRecord(rawInvoice.charge)
    ? rawInvoice.charge as StripeChargeLike
    : null;
  const paymentIntent = isRecord(rawInvoice.payment_intent)
    ? rawInvoice.payment_intent as StripePaymentIntentLike
    : null;
  const payments = isRecord(rawInvoice.payments) &&
      Array.isArray(rawInvoice.payments.data)
    ? rawInvoice.payments.data as StripeInvoicePaymentLike[]
    : [];
  const paidPayment = payments.find((entry) => entry.status === "paid") ??
    payments[0] ?? null;
  const invoicePayment = paidPayment?.payment ?? null;
  const paymentIntentFromInvoicePayment = isRecord(
      invoicePayment?.payment_intent,
    )
    ? invoicePayment?.payment_intent as StripePaymentIntentLike
    : null;
  const chargeFromInvoicePayment = isRecord(invoicePayment?.charge)
    ? invoicePayment?.charge as StripeChargeLike
    : null;
  const nestedCharge = nestedChargeFromPaymentIntent(paymentIntent) ??
    nestedChargeFromPaymentIntent(paymentIntentFromInvoicePayment);
  const charge = directCharge ?? chargeFromInvoicePayment ?? nestedCharge;

  return {
    payment_intent_id: objectId(rawInvoice.payment_intent) ??
      objectId(invoicePayment?.payment_intent),
    charge_id: objectId(rawInvoice.charge) ??
      objectId(invoicePayment?.charge) ??
      objectId(charge),
    receipt_url: charge?.receipt_url ?? null,
  };
}

async function resolveInvoiceReceipt(
  stripe: Stripe,
  inv: StripeInvoiceWithTaxDetails,
) {
  let receipt = extractInvoiceReceipt(inv);
  if (receipt.receipt_url) return receipt;

  if (!receipt.payment_intent_id && !receipt.charge_id && inv.id) {
    try {
      const expandedInvoice = await stripe.invoices.retrieve(inv.id);
      receipt = extractInvoiceReceipt(
        expandedInvoice as StripeInvoiceWithTaxDetails,
      );
      if (receipt.receipt_url) return receipt;
    } catch (invoiceRetrieveError: unknown) {
      log.warn("expanded invoice retrieve failed", {
        invoiceId: inv.id,
        message: invoiceRetrieveError instanceof Error
          ? invoiceRetrieveError.message
          : String(invoiceRetrieveError),
      });
    }
  }

  try {
    if (receipt.payment_intent_id) {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        receipt.payment_intent_id,
        { expand: ["latest_charge"] },
      );
      const charge = nestedChargeFromPaymentIntent(paymentIntent);
      if (charge?.receipt_url) {
        return {
          payment_intent_id: paymentIntent.id,
          charge_id: objectId(charge),
          receipt_url: charge.receipt_url,
        };
      }
      const chargeId = objectId(charge) ?? receipt.charge_id;
      if (chargeId) {
        const retrievedCharge = await stripe.charges.retrieve(chargeId);
        return {
          payment_intent_id: paymentIntent.id,
          charge_id: retrievedCharge.id,
          receipt_url: retrievedCharge.receipt_url ?? null,
        };
      }
      return { ...receipt, payment_intent_id: paymentIntent.id };
    }

    if (receipt.charge_id) {
      const retrievedCharge = await stripe.charges.retrieve(receipt.charge_id);
      return {
        ...receipt,
        charge_id: retrievedCharge.id,
        receipt_url: retrievedCharge.receipt_url ?? null,
      };
    }
  } catch (receiptError: unknown) {
    log.warn("invoice receipt lookup failed", {
      invoiceId: inv.id,
      message: receiptError instanceof Error
        ? receiptError.message
        : String(receiptError),
    });
  }

  return receipt;
}

function extractInvoiceTaxAmount(inv: StripeInvoiceWithTaxDetails): number {
  if (typeof inv.amount_tax === "number") return inv.amount_tax;
  const entries = inv.total_taxes ?? inv.total_tax_amounts ?? [];
  return entries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0);
}

function normalizeInvoiceTaxes(inv: StripeInvoiceWithTaxDetails) {
  const entries = inv.total_taxes ?? inv.total_tax_amounts ?? [];
  return entries.map((entry) => {
    const taxRate = entry.tax_rate;
    return {
      amount: minorToMajor(entry.amount ?? null),
      taxable_amount: minorToMajor(entry.taxable_amount ?? null),
      taxability_reason: entry.taxability_reason ?? null,
      tax_rate_id: typeof taxRate === "string" ? taxRate : taxRate?.id ?? null,
      display_name: typeof taxRate === "string"
        ? null
        : taxRate?.display_name ?? null,
      percentage: typeof taxRate === "string" ? null : taxRate?.percentage ?? null,
      country: typeof taxRate === "string" ? null : taxRate?.country ?? null,
    };
  });
}

function normalizeInvoiceTaxIds(inv: StripeInvoiceWithTaxDetails) {
  return (inv.customer_tax_ids ?? []).map((taxId) => {
    if (typeof taxId === "string") {
      return { id: taxId, type: null, value: null };
    }
    const taxRecord = taxId as unknown as {
      id?: string | null;
      type?: string | null;
      value?: string | null;
    };
    return {
      id: taxRecord.id ?? null,
      type: taxRecord.type ?? null,
      value: taxRecord.value ?? null,
    };
  });
}

async function listOwnedCustomers(stripe: Stripe, userId: string) {
  const search = await stripe.customers.search({
    query: `metadata['user_id']:'${userId}'`,
    limit: 10,
  });
  return search.data.filter((customer) =>
    customer.metadata?.user_id === userId
  );
}

async function resolveCustomer(stripe: Stripe, userId: string) {
  const candidates = await listOwnedCustomers(stripe, userId);
  let chosenCustomer: Stripe.Customer | null = null;
  let chosenSubscription: Stripe.Subscription | null = null;

  for (const customer of candidates) {
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
    });
    const preferred = subscriptions.data.find((subscription) =>
      isStripeSubscribed(subscription.status)
    );
    if (preferred) {
      chosenCustomer = customer;
      chosenSubscription = preferred;
      break;
    }
    if (!chosenCustomer && subscriptions.data[0]) {
      chosenCustomer = customer;
      chosenSubscription = subscriptions.data[0];
    }
  }

  if (!chosenCustomer && candidates[0]) {
    chosenCustomer = candidates[0];
  }

  return { customer: chosenCustomer, subscription: chosenSubscription };
}

async function listCustomerInvoices(stripe: Stripe, customerId: string) {
  return await stripe.invoices.list({
    customer: customerId,
    limit: 12,
  });
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey,
    );
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { data: userData, error: userError } = await supabase.auth.getUser(
      token,
    );
    if (userError || !userData.user?.email) {
      return new Response(JSON.stringify({ error: "Unauthenticated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    if (isStripeMockMode()) {
      return new Response(
        JSON.stringify({
          invoices: [],
          subscription: null,
          billing_configured: true,
          customer_found: false,
          portal_eligible: false,
          billing_reason: "stripe_mock",
          billing_mode: "mock",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    let durableBilling: DurableBillingState = {
      subscription: null,
      customerFound: false,
    };
    try {
      durableBilling = await readDurableBillingState(
        supabase as unknown as DurableBillingReadClient,
        userData.user.id,
      );
    } catch (durableError: unknown) {
      log.warn("durable billing state lookup failed", {
        userId: userData.user.id,
        message: durableError instanceof Error
          ? durableError.message
          : String(durableError),
      });
    }

    if (!stripeKey) {
      if (durableBilling.subscription) {
        return durableBillingResponse(corsHeaders, durableBilling, false);
      }
      return new Response(
        JSON.stringify({
          invoices: [],
          subscription: null,
          billing_configured: false,
          customer_found: false,
          portal_eligible: false,
          billing_reason: "stripe_disabled",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    const stripe = await createVerifiedStripeClient(stripeKey);
    let customer: Stripe.Customer | null = null;
    let subscription: Stripe.Subscription | null = null;
    try {
      const resolved = await resolveCustomer(stripe, userData.user.id);
      customer = resolved.customer;
      subscription = resolved.subscription;
    } catch (customerLookupError: unknown) {
      const message = customerLookupError instanceof Error
        ? customerLookupError.message
        : String(customerLookupError);
      log.warn("customer lookup failed", {
        userId: userData.user.id,
        message,
      });
      if (durableBilling.subscription) {
        return durableBillingResponse(corsHeaders, durableBilling, true);
      }
      return new Response(
        JSON.stringify({
          invoices: [],
          subscription: null,
          billing_configured: true,
          customer_found: durableBilling.customerFound,
          portal_eligible: false,
          billing_reason: "customer_lookup_unavailable",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    if (!customer) {
      if (durableBilling.subscription) {
        return durableBillingResponse(corsHeaders, durableBilling, true);
      }
      return new Response(
        JSON.stringify({
          invoices: [],
          subscription: null,
          billing_configured: true,
          customer_found: false,
          portal_eligible: false,
          billing_reason: "no_customer",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    let invoiceErrorReason: string | null = null;
    let invoices: Array<Record<string, unknown>> = [];

    try {
      const invoiceList = await listCustomerInvoices(stripe, customer.id);
      invoices = await Promise.all(invoiceList.data.map(async (invoice) => {
        const inv = invoice as StripeInvoiceWithTaxDetails;
        const taxAmount = extractInvoiceTaxAmount(inv);
        const receipt = await resolveInvoiceReceipt(stripe, inv);
        return {
          id: inv.id,
          number: inv.number,
          status: inv.status,
          amount_paid: inv.amount_paid / 100,
          amount_due: minorToMajor(inv.amount_due),
          subtotal: minorToMajor(inv.subtotal),
          total: minorToMajor(inv.total),
          tax_amount: minorToMajor(taxAmount) ?? 0,
          currency: inv.currency.toUpperCase(),
          created: new Date(inv.created * 1000).toISOString(),
          period_start: inv.period_start
            ? new Date(inv.period_start * 1000).toISOString()
            : null,
          period_end: inv.period_end
            ? new Date(inv.period_end * 1000).toISOString()
            : null,
          hosted_invoice_url: inv.hosted_invoice_url,
          invoice_pdf: inv.invoice_pdf,
          payment_intent_id: receipt.payment_intent_id,
          charge_id: receipt.charge_id,
          receipt_url: receipt.receipt_url,
          description: inv.lines.data[0]?.description ?? null,
          automatic_tax: {
            enabled: inv.automatic_tax?.enabled ?? null,
            status: inv.automatic_tax?.status ?? null,
          },
          customer_tax_exempt: inv.customer_tax_exempt ?? null,
          customer_tax_ids: normalizeInvoiceTaxIds(inv),
          taxes: normalizeInvoiceTaxes(inv),
        };
      }));
    } catch (invoiceError: unknown) {
      invoiceErrorReason = invoiceError instanceof Error
        ? invoiceError.message
        : String(invoiceError);
      log.warn("invoice list failed", {
        customerId: customer.id,
        message: invoiceErrorReason,
      });
    }

    const subscriptionItem = subscription?.items.data[0] as
      | SubscriptionItemWithPeriodEnd
      | undefined;
    const price = subscriptionItem?.price;
    const subscriptionItemId = subscriptionItem?.id ?? null;
    const recurringInterval = (price as PriceWithRecurring | undefined)?.recurring?.interval ?? "month";
    const currentPeriodEnd =
      (subscription as SubscriptionWithPeriodEnd | null)?.current_period_end ??
        subscriptionItem?.current_period_end ??
        null;
    const trialEnd = (subscription as SubscriptionWithPeriodEnd | null)?.trial_end ?? null;
    const subscriptionDisplayEnd = subscription?.status === "trialing"
      ? trialEnd ?? currentPeriodEnd
      : currentPeriodEnd;
    const product = price?.product as Stripe.Product | null | undefined;
    const productId = typeof price?.product === "string"
      ? price.product
      : product?.id ?? null;
    const normalizedSubscription = subscription
      ? {
        id: subscription.id,
        status: subscription.status,
        current_period_end: subscriptionDisplayEnd
          ? new Date(subscriptionDisplayEnd * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
        plan_name: product?.name ?? "Pro",
        amount: price?.unit_amount ? price.unit_amount / 100 : null,
        currency: price?.currency?.toUpperCase() ?? "EUR",
        interval: recurringInterval,
        product_id: productId,
        price_id: price?.id ?? null,
        subscription_item_id: subscriptionItemId,
        plan_key: subscription.metadata?.plan_key ?? subscription.metadata?.plan ?? null,
      }
      : durableBilling.subscription;

    return new Response(
      JSON.stringify({
        invoices,
        subscription: normalizedSubscription,
        billing_configured: true,
        customer_found: true,
        portal_eligible: true,
        billing_reason: invoiceErrorReason
          ? "invoice_unavailable"
          : normalizedSubscription?.source === "billing_state"
          ? "billing_state"
          : "ok",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
