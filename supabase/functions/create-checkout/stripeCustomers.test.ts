import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCustomerCompanyInvoiceSettingsParams,
  getOrCreateOwnedStripeCustomer,
} from "./stripeCustomers.ts";

const withVatEnv = (value: string | undefined, fn: () => void | Promise<void>) => {
  const original = Deno.env.get("STRIPE_COMPANY_VAT_ID");
  if (value === undefined) Deno.env.delete("STRIPE_COMPANY_VAT_ID");
  else Deno.env.set("STRIPE_COMPANY_VAT_ID", value);
  try {
    return fn();
  } finally {
    if (original === undefined) Deno.env.delete("STRIPE_COMPANY_VAT_ID");
    else Deno.env.set("STRIPE_COMPANY_VAT_ID", original);
  }
};

Deno.test("customer invoice settings stamp the company VAT by default", () => {
  withVatEnv(undefined, () => {
    assertEquals(buildCustomerCompanyInvoiceSettingsParams(), {
      invoice_settings: {
        custom_fields: [{ name: "Company VAT", value: "EL802708301" }],
      },
    });
  });
});

Deno.test("customer invoice settings preserve non-VAT custom fields", () => {
  withVatEnv("EL802708301", () => {
    assertEquals(
      buildCustomerCompanyInvoiceSettingsParams({
        id: "cus_existing",
        invoice_settings: {
          custom_fields: [{ name: "PO", value: "1234" }],
        },
      }),
      {
        invoice_settings: {
          custom_fields: [
            { name: "Company VAT", value: "EL802708301" },
            { name: "PO", value: "1234" },
          ],
        },
      },
    );
  });
});

Deno.test("customer invoice settings skip customers that already carry company VAT", () => {
  withVatEnv("EL802708301", () => {
    assertEquals(
      buildCustomerCompanyInvoiceSettingsParams({
        id: "cus_existing",
        invoice_settings: {
          custom_fields: [{ name: "Company VAT", value: "EL802708301" }],
        },
      }),
      null,
    );
  });
});

Deno.test("owned existing Stripe customers are updated with VAT invoice settings", async () => {
  await withVatEnv("EL802708301", async () => {
    const calls: unknown[] = [];
    const stripe = {
      customers: {
        search: () =>
          Promise.resolve({
            data: [{
              id: "cus_existing",
              invoice_settings: { custom_fields: null },
            }],
          }),
        create: () => {
          throw new Error("create should not be called");
        },
        update: (customerId: string, params: unknown) => {
          calls.push([customerId, params]);
          return Promise.resolve({ id: customerId });
        },
      },
    };

    const customerId = await getOrCreateOwnedStripeCustomer(
      stripe,
      { id: "user_1", email: "buyer@example.com" },
      () => undefined,
    );

    assertEquals(customerId, "cus_existing");
    assertEquals(calls, [[
      "cus_existing",
      {
        invoice_settings: {
          custom_fields: [{ name: "Company VAT", value: "EL802708301" }],
        },
      },
    ]]);
  });
});

Deno.test("new Stripe customers are created with VAT invoice settings", async () => {
  await withVatEnv("EL802708301", async () => {
    const calls: unknown[] = [];
    const stripe = {
      customers: {
        search: () => Promise.resolve({ data: [] }),
        create: (params: unknown, options: unknown) => {
          calls.push([params, options]);
          return Promise.resolve({ id: "cus_created" });
        },
        update: () => {
          throw new Error("update should not be called");
        },
      },
    };

    const customerId = await getOrCreateOwnedStripeCustomer(
      stripe,
      { id: "user_1", email: "buyer@example.com" },
      () => undefined,
    );

    assertEquals(customerId, "cus_created");
    assertEquals(calls, [[
      {
        email: "buyer@example.com",
        metadata: { user_id: "user_1" },
        invoice_settings: {
          custom_fields: [{ name: "Company VAT", value: "EL802708301" }],
        },
      },
      { idempotencyKey: "maiprop-customer-user_1" },
    ]]);
  });
});
