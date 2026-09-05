import type { Page } from "@playwright/test";

export async function fillStripeTestTaxInformation(page: Page) {
  await page.getByRole("textbox", { name: "Business name", exact: true })
    .fill("Codex Stripe Test Business");
  // Stripe's documented Greek sandbox example; never a real customer's VAT ID.
  // https://docs.stripe.com/tax/checkout/tax-ids#test-your-integration
  await page.getByRole("textbox", { name: "Tax ID", exact: true })
    .fill("EL123456789");
}
