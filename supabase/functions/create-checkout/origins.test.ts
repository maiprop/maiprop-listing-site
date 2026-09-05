import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveCheckoutOrigin } from "./origins.ts";

Deno.test("staging Checkout returns to its own Pages deployment only in staging", () => {
  const names = ["ENVIRONMENT", "SITE_URL", "CHECKOUT_ALLOWED_ORIGINS", "ALLOWED_CHECKOUT_ORIGINS"];
  const previous = names.map((name) => Deno.env.get(name));
  try {
    names.forEach((name) => Deno.env.delete(name));
    for (const environment of ["staging", "production"]) {
      Deno.env.set("ENVIRONMENT", environment);
      for (const origin of [
        "https://maiprop-listing-site-staging.pages.dev",
        "https://a1b2c3d4.maiprop-listing-site-staging.pages.dev",
      ]) {
        assertEquals(resolveCheckoutOrigin(origin), environment === "staging" ? origin : "https://portal.maiprop.co");
      }
      for (const origin of [
        "https://attacker.maiprop-listing-site-staging.pages.dev",
        "https://a1b2c3d4.maiprop-listing-site-staging.pages.dev.evil.example",
        "http://maiprop-listing-site-staging.pages.dev",
      ]) {
        assertEquals(resolveCheckoutOrigin(origin), "https://portal.maiprop.co");
      }
    }
  } finally {
    names.forEach((name, index) => {
      const value = previous[index];
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    });
  }
});
