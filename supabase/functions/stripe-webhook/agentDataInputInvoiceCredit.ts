export interface StripeInvoiceCreditItem {
  id: string;
  amount: number;
  currency: string;
  customer: string | { id: string } | null;
  invoice: string | { id: string } | null;
  metadata: Record<string, string> | null;
}

export interface AgentDataInputCreditReservationExpectation {
  id: string;
  stripe_credit_id: string | null;
  stripe_credit_expected_amount_cents: number | null;
  stripe_credit_operation_key: string | null;
}

interface InvoiceItemsClient {
  invoiceItems: {
    list(params: {
      invoice: string;
      limit: number;
      starting_after?: string;
    }): Promise<{
      data: StripeInvoiceCreditItem[];
      has_more: boolean;
    }>;
  };
}

function providerId(value: string | { id: string } | null): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

export async function findAgentDataInputInvoiceCredit(
  stripe: InvoiceItemsClient,
  invoiceId: string,
  operationKey: string,
): Promise<StripeInvoiceCreditItem | null> {
  const matches: StripeInvoiceCreditItem[] = [];
  let startingAfter: string | undefined;

  for (;;) {
    const page = await stripe.invoiceItems.list({
      invoice: invoiceId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const invoiceItem of page.data) {
      if (invoiceItem.metadata?.operation_key === operationKey) {
        matches.push(invoiceItem);
      }
    }
    if (!page.has_more) break;
    const finalItem = page.data.at(-1);
    if (!finalItem?.id) {
      throw new Error(
        "Stripe invoice item pagination returned an empty continuation page.",
      );
    }
    startingAfter = finalItem.id;
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple Stripe invoice credits exist for operation ${operationKey}.`,
    );
  }
  return matches[0] ?? null;
}

export function assertAgentDataInputInvoiceCreditMatches(
  credit: StripeInvoiceCreditItem,
  expected: {
    invoiceId: string;
    customerId: string;
    amountMinor: number;
    currency: string;
    operationKey: string;
    userId: string;
    appliedCount: number;
  },
): void {
  if (
    credit.amount !== -expected.amountMinor ||
    credit.currency.toLowerCase() !== expected.currency.toLowerCase() ||
    providerId(credit.customer) !== expected.customerId ||
    providerId(credit.invoice) !== expected.invoiceId ||
    credit.metadata?.operation_key !== expected.operationKey ||
    credit.metadata?.invoice_id !== expected.invoiceId ||
    credit.metadata?.user_id !== expected.userId ||
    Number(credit.metadata?.applied_count) !== expected.appliedCount ||
    Number(credit.metadata?.expected_amount_cents) !== expected.amountMinor
  ) {
    throw new Error(
      "Stripe invoice credit does not match the reserved data-input operation.",
    );
  }
}

export function assertAgentDataInputCreditReservationExpectation(
  reservations: AgentDataInputCreditReservationExpectation[],
  expected: {
    expectedCount: number;
    amountMinor: number;
    operationKey: string;
  },
): void {
  if (
    reservations.length !== expected.expectedCount ||
    reservations.some((reservation) =>
      reservation.stripe_credit_expected_amount_cents !==
        expected.amountMinor ||
      reservation.stripe_credit_operation_key !== expected.operationKey
    )
  ) {
    throw new Error(
      "Agent data-input credit reservation expectation does not match the current operation.",
    );
  }
}
