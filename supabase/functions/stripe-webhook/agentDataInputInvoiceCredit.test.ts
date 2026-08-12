import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  assertAgentDataInputCreditReservationExpectation,
  assertAgentDataInputInvoiceCreditMatches,
  findAgentDataInputInvoiceCredit,
} from "./agentDataInputInvoiceCredit.ts";

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "ii_credit",
    amount: -500,
    currency: "eur",
    customer: "cus_1",
    invoice: "in_1",
    metadata: {
      operation_key: "op_1",
      invoice_id: "in_1",
      user_id: "user_1",
      applied_count: "1",
      expected_amount_cents: "500",
    },
    ...overrides,
  };
}

Deno.test("invoice credit reconciliation follows pagination and finds the exact operation", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const stripe = {
    invoiceItems: {
      list(params: Record<string, unknown>) {
        calls.push(params);
        return Promise.resolve(
          calls.length === 1
            ? {
              data: [item({ metadata: { operation_key: "other" } })],
              has_more: true,
            }
            : { data: [item()], has_more: false },
        );
      },
    },
  };

  const found = await findAgentDataInputInvoiceCredit(
    stripe,
    "in_1",
    "op_1",
  );

  assertEquals(found?.id, "ii_credit");
  assertEquals(calls[0], { invoice: "in_1", limit: 100 });
  assertEquals(calls[1], {
    invoice: "in_1",
    limit: 100,
    starting_after: "ii_credit",
  });
});

Deno.test("invoice credit reconciliation rejects duplicate provider objects", async () => {
  const stripe = {
    invoiceItems: {
      list() {
        return Promise.resolve({
          data: [item(), item({ id: "ii_duplicate" })],
          has_more: false,
        });
      },
    },
  };

  await assertRejects(
    () => findAgentDataInputInvoiceCredit(stripe, "in_1", "op_1"),
    Error,
    "Multiple Stripe invoice credits",
  );
});

Deno.test("invoice credit reconciliation validates the immutable provider amount and ownership", () => {
  assertAgentDataInputInvoiceCreditMatches(item(), {
    invoiceId: "in_1",
    customerId: "cus_1",
    amountMinor: 500,
    currency: "eur",
    operationKey: "op_1",
    userId: "user_1",
    appliedCount: 1,
  });

  for (
    const invalid of [
      item({ amount: -499 }),
      item({ currency: "usd" }),
      item({ customer: "cus_other" }),
      item({ invoice: "in_other" }),
    ]
  ) {
    assertRejects(
      async () =>
        assertAgentDataInputInvoiceCreditMatches(invalid, {
          invoiceId: "in_1",
          customerId: "cus_1",
          amountMinor: 500,
          currency: "eur",
          operationKey: "op_1",
          userId: "user_1",
          appliedCount: 1,
        }),
      Error,
      "does not match",
    );
  }
});

Deno.test("invoice credit reservation expectation is complete and immutable across retries", () => {
  const reservations = [
    {
      id: "row_1",
      stripe_credit_id: null,
      stripe_credit_expected_amount_cents: 500,
      stripe_credit_operation_key: "op_1",
    },
    {
      id: "row_2",
      stripe_credit_id: null,
      stripe_credit_expected_amount_cents: 500,
      stripe_credit_operation_key: "op_1",
    },
  ];

  assertAgentDataInputCreditReservationExpectation(reservations, {
    expectedCount: 2,
    amountMinor: 500,
    operationKey: "op_1",
  });

  for (
    const invalid of [
      reservations.slice(0, 1),
      reservations.map((row, index) =>
        index === 0 ? { ...row, stripe_credit_expected_amount_cents: 499 } : row
      ),
      reservations.map((row, index) =>
        index === 0 ? { ...row, stripe_credit_operation_key: "op_other" } : row
      ),
    ]
  ) {
    assertRejects(
      async () =>
        assertAgentDataInputCreditReservationExpectation(invalid, {
          expectedCount: 2,
          amountMinor: 500,
          operationKey: "op_1",
        }),
      Error,
      "reservation expectation",
    );
  }

});
