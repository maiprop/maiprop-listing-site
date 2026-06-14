# Open House Sale/Rental Subcategory Design

## Goal

Open-house ads keep the existing `listing_type = open_house` route, layout, registration, and offer flow, while separating the underlying transaction intent into `sale` or `rent`.

## Data Model

Add `public.listings.open_house_transaction_type text null` with values `sale` or `rent` only when `listing_type = open_house`. Existing open-house rows are backfilled to `sale`; future null values still display as sale for compatibility.

## UI Flow

In the regular listing wizard, choosing `Open House` reveals a sale/rental segmented choice. Sale open houses keep asking-price labels. Rental open houses use monthly-rent labels and show the rental-term fields already used by normal rental listings.

## Public Surfaces

Public listing, listings, homepage, and open-house API selects include the new column. Cards and detail pages display rental open houses with `/mo` pricing, while preserving the Open House badge and `/open-house/:id` route.

## Testing

Add regression coverage for the wizard payload, migration SQL, and open-house card/page behavior. Run focused tests first, then typecheck and full relevant suites before integration.
