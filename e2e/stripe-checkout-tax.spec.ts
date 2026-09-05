import { expect, test } from "@playwright/test";
import { fillStripeTestTaxInformation } from "./helpers/stripe-checkout-tax";

test("sandbox fixture supplies required Greek business tax information", async ({ page }) => {
  await page.setContent(`<form>
    <label>Business name<input required name="business"></label>
    <label>Tax ID<input required name="tax" pattern="EL[0-9]{9}"></label>
  </form>`);
  expect(await page.locator("form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false);
  await fillStripeTestTaxInformation(page);
  await expect(page.getByRole("textbox", { name: "Business name", exact: true })).toHaveValue("Codex Stripe Test Business");
  await expect(page.getByRole("textbox", { name: "Tax ID", exact: true })).toHaveValue("EL123456789");
  expect(await page.locator("form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(true);
});
