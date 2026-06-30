# Stripe Test Catalog Setup

This repo can provision the MaiProp Stripe test catalog without relying on the
Supabase database being healthy first. The script creates Stripe Products,
Prices, marketing features, and Entitlements Features, then emits the Supabase
metadata needed by checkout and webhook fulfillment.

## Runbook

1. Export a Stripe test secret key:

   ```powershell
   $env:STRIPE_SECRET_KEY = "sk_test_..."
   ```

2. Preview the catalog:

   ```powershell
   npm run stripe:setup-catalog -- --dry-run
   ```

   The catalog assigns Stripe Tax software codes to each Product and every Price
   uses `tax_behavior=exclusive`. Participant-facing software defaults to
   `txcd_10103000`, business software to `txcd_10103001`, participant AI
   services to `txcd_10105001`, and business AI services to `txcd_10105002`.
   Override with `STRIPE_PRODUCT_TAX_CODE`, the specific `STRIPE_*_TAX_CODE`
   variables, or `STRIPE_TAX_BEHAVIOR` only after confirming the live tax
   treatment.

3. Create or update the Stripe test catalog and write the generated wiring:

   ```powershell
   npm run stripe:setup-catalog -- --write-env .stripe.test.env --write-sql .tmp/stripe-pricing-metadata.sql
   ```

4. Push the generated public plan price IDs into Supabase Edge Function secrets:

   ```powershell
   $stripePriceSecrets = Get-Content .stripe.test.env | Where-Object { $_ -and -not $_.StartsWith("#") }
   npx supabase secrets set --project-ref qvvicunqcrwpioqnvzxf $stripePriceSecrets
   ```

5. Apply `.tmp/stripe-pricing-metadata.sql` with a service-role/admin database
   connection once Supabase database health recovers. It upserts
   `pricing_configs.metadata` with `stripe_product_id`,
   `stripe_price_id_monthly`, `stripe_price_id_annual`, and add-on
   `stripe_price_id` values.

6. Add webhook signing after creating the Stripe webhook endpoint:

   ```powershell
   npx supabase secrets set --project-ref qvvicunqcrwpioqnvzxf STRIPE_WEBHOOK_SECRET=whsec_...
   ```

## Catalog

Public subscriptions:

- `pro`: Participant Pro, EUR 29 monthly, EUR 290 annual.
- `agent_basic`: Agent Pro, EUR 149 monthly, EUR 1490 annual.
- `developer_pro`: Developer Pro, EUR 129 monthly, EUR 1290 annual.
- `professional_basic`: Professional Pro, EUR 69 monthly, EUR 690 annual.

Invite-only investor products:

- `investor_private`: product and Entitlements Features only. The
  `create-investor-payment` Edge Function creates invite-only Checkout with
  the admin-entered custom annual amount and stamps annual access metadata.
- `investor_institutional`: product and Entitlements Features only. The
  `create-investor-payment` Edge Function creates invite-only Checkout with
  the admin-entered custom annual amount and stamps annual access metadata.

Self-serve add-ons:

- Valuation/report products: `valuation_single`, `valuation_bundle`,
  `property_report_single`, `neighbourhood_report_single`,
  `neighbourhood_report_bundle`.

Cataloged contact/admin-managed add-ons and data products:

These Products/Prices are provisioned in Stripe so Admin Pricing, admin-led sales,
and future fulfillment work can reference stable Stripe IDs, but
`create-checkout` does not expose them as self-serve purchases until an
operational delivery path exists.

- Participant boosts: `extra_listing`, `featured_listing`,
  `priority_placement`, `featured_priority_bundle`.
- Agent add-ons: `agent_extra_seat`, `agency_branded_profile`,
  `agency_dedicated_manager`, `agency_white_label`.
- Professional add-ons: `featured_professional`, `extra_priority_ad`,
  `professional_api_access`, `professional_referral_network`,
  `professional_extra_seat`, `professional_branded_email`.
- B2B data products: `market_intelligence`, `avm_api`,
  `auction_intelligence`.

## Safety Notes

- The script refuses non-test keys unless `--live` is passed.
- Products are keyed by `metadata.maiprop_key`.
- Products are created with Stripe Tax software/AI `tax_code` values; Prices
  are created with explicit `tax_behavior` so Checkout invoices do not depend on
  Stripe Dashboard defaults.
- Prices are keyed by Stripe `lookup_key` values such as
  `maiprop_pro_monthly`; changed amounts create replacement immutable prices
  and archive the previous active lookup-key price.
- Hosted Checkout enables Stripe Tax, billing address collection, tax ID
  collection, customer name/address updates, and invoice creation for
  payment-mode purchases.
- Stripe is the payment source of truth. Supabase metadata mirrors the created
  IDs so the Edge Functions can start Checkout without live Stripe lookups.
