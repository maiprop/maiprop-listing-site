# Address Autosuggest Bulletproof Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every address/location autocomplete field produce specific, user-friendly, searchable Greek addresses or municipalities, never broad prefecture/region filters that hide valid listings.

**Architecture:** Centralize provider normalization and listing-search semantics in one location domain layer. Google/Mapbox/Nominatim predictions become a single `AddressPrediction` shape, broad administrative regions are rejected for listing searches, and listing search moves from exact-ish `city` matching to indexed normalized location text across city, municipality/region, address, title, and postal code.

**Tech Stack:** React, TypeScript, Vite, Supabase/Postgres, Cloudflare Pages Functions, Google Places Autocomplete Data API, Vitest, Playwright.

## Global Constraints

- Target branch: `codex/address-autosuggest-deep-audit-20260709`.
- Do not push, merge, or squash until all local and live verification gates pass.
- Preserve existing `city` URL compatibility for old links and saved searches.
- Do not expose server-only keys in frontend code.
- Google predictions rendered in custom UI must show Google attribution.
- Listing search must support Greek accented and unaccented typing.
- Listing search must not accept prefecture-only or region-only Google predictions as final filters.
- Address fields in create/edit flows must keep address, city, municipality/region, postal code, latitude, and longitude wired separately.

---

## File Structure

- Modify: `src/lib/location/addressFormat.ts`
  - Owns provider-neutral `AddressPrediction` and presentation formatting.
- Create: `src/lib/location/locationSearchSemantics.ts`
  - Owns broad-region rejection, search/display value selection, and Greek text normalization helpers used by UI tests.
- Modify: `src/lib/location/googlePlacePredictions.ts`
  - Adds Google place type capture, stricter request hints, and no `administrative_area_level_1` fallback as municipality.
- Modify: `src/hooks/useAddressAutocomplete.ts`
  - Filters/merges predictions using canonical semantics and avoids stale dropdown races.
- Modify: `src/components/listings/LocationSearchField.tsx`
  - Uses canonical listing search value and keeps display text user-friendly.
- Modify: `src/components/index/LocationInput.tsx`
  - Uses the same canonical listing search value as listings page.
- Modify: `src/components/location/LocationAutocompleteInput.tsx`
  - Keeps create/edit address fields structured and prevents accidental broad-region auto-application.
- Modify: `src/hooks/useListings.ts`
  - Filters through normalized location search column while preserving `city` param.
- Modify: `functions/api/public/listings.ts`
  - Mirrors frontend fallback query semantics in Cloudflare public API.
- Create migration: `supabase/migrations/<cli_timestamp>_add_listing_location_search_text.sql`
  - Adds normalized location search function/column/index.
- Update generated types if needed: `src/integrations/supabase/types.ts`.
- Tests:
  - Modify: `src/test/addressAutocompleteFormatting.test.ts`
  - Modify: `src/test/locationAddressSuggestions.test.tsx`
  - Modify: `src/test/useListings.filters.test.ts`
  - Modify: `functions/api/public/public-api.test.ts`
  - Add: `src/test/locationSearchSemantics.test.ts`
  - Add or extend E2E: `e2e/listings.spec.ts`

---

### Task 1: Define Canonical Location Search Semantics

**Files:**
- Create: `src/lib/location/locationSearchSemantics.ts`
- Test: `src/test/locationSearchSemantics.test.ts`

**Interfaces:**
- Produces:
  - `normalizeGreekLocationText(value: string): string`
  - `isBroadAdministrativePrediction(prediction: AddressPrediction): boolean`
  - `getListingLocationSearchValue(prediction: AddressPrediction): string`
  - `getAddressInputDisplayValue(prediction: AddressPrediction): string`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getAddressInputDisplayValue,
  getListingLocationSearchValue,
  isBroadAdministrativePrediction,
  normalizeGreekLocationText,
} from "@/lib/location/locationSearchSemantics";
import type { AddressPrediction } from "@/lib/location/addressFormat";

const prediction = (overrides: Partial<AddressPrediction>): AddressPrediction => ({
  id: "test",
  provider: "google",
  value: overrides.value ?? "test",
  title: overrides.title ?? overrides.value ?? "test",
  ...overrides,
});

describe("location search semantics", () => {
  it("normalizes Greek accents and punctuation for search", () => {
    expect(normalizeGreekLocationText("Άγιοι Αναργύρων – Καματερού")).toContain("αγιοι αναργυρων καματερου");
    expect(normalizeGreekLocationText("Αγιοι Αναργυροι, Αττικης")).toContain("αγιοι αναργυροι αττικης");
  });

  it("rejects region-only Google predictions for listing filters", () => {
    expect(isBroadAdministrativePrediction(prediction({
      title: "Περιφέρεια Αττικής",
      region: "Περιφέρεια Αττικής",
      googleTypes: ["administrative_area_level_1", "political"],
    }))).toBe(true);
  });

  it("uses municipality or city before region for listing filters", () => {
    expect(getListingLocationSearchValue(prediction({
      title: "Άγιοι Ανάργυροι Αττικής",
      city: "Άγιοι Ανάργυροι",
      municipality: "Δήμος Αγίων Αναργύρων - Καματερού",
      region: "Περιφέρεια Αττικής",
    }))).toBe("Δήμος Αγίων Αναργύρων - Καματερού");
  });

  it("keeps street address display separate from listing search value", () => {
    const selected = prediction({
      addressLine: "Υμηττού 6",
      city: "Άγιοι Ανάργυροι",
      municipality: "Δήμος Αγίων Αναργύρων - Καματερού",
    });
    expect(getAddressInputDisplayValue(selected)).toBe("Υμηττού 6");
    expect(getListingLocationSearchValue(selected)).toBe("Δήμος Αγίων Αναργύρων - Καματερού");
  });
});
```

- [ ] **Step 2: Run failing test**

Run: `npx vitest run src/test/locationSearchSemantics.test.ts`

- [ ] **Step 3: Implement helpers**

Implement with deterministic text normalization:
- lowercase Greek
- remove tonos/diacritics
- map final sigma consistently
- replace punctuation/dashes with spaces
- collapse whitespace
- broad prediction detection when Google types include only `administrative_area_level_1`, `country`, or region-only text.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/test/locationSearchSemantics.test.ts`

---

### Task 2: Harden Google Place Prediction Mapping

**Files:**
- Modify: `src/lib/location/addressFormat.ts`
- Modify: `src/lib/location/googlePlacePredictions.ts`
- Test: `src/test/locationAddressSuggestions.test.tsx`

**Interfaces:**
- Extend `AddressPrediction` with:
  - `placeId?: string`
  - `googleTypes?: string[]`
  - `isBroadAdministrativeArea?: boolean`

- [ ] **Step 1: Add tests for Agioi Anargyroi and broad Attica**

Add Google mock predictions:
- one municipality/address prediction: `Άγιοι Ανάργυροι Αττικής`
- one broad region prediction: `Περιφέρεια Αττικής`

Expected:
- broad region is not selectable in listing dropdown
- municipality/address option remains
- Google attribution still renders

- [ ] **Step 2: Run failing test**

Run: `npx vitest run src/test/locationAddressSuggestions.test.tsx`

- [ ] **Step 3: Implement mapping**

In `googlePlacePredictions.ts`:
- capture `prediction.placeId`
- capture `prediction.types` / `place.types` where available
- request tighter fields: `formattedAddress`, `location`, `addressComponents`, `displayName`, `types`
- for `mode === "city"`, do not set `municipality` from `administrative_area_level_1`
- mark region-only results as broad using `isBroadAdministrativePrediction`
- prefer locality/postal town/admin level 3/admin level 2; keep level 1 only as `region`

- [ ] **Step 4: Verify**

Run:
`npx vitest run src/test/locationSearchSemantics.test.ts src/test/locationAddressSuggestions.test.tsx`

---

### Task 3: Fix Listing Search Field Selection

**Files:**
- Modify: `src/components/listings/LocationSearchField.tsx`
- Modify: `src/components/index/LocationInput.tsx`
- Test: `src/test/locationAddressSuggestions.test.tsx`

**Interfaces:**
- Consume `getListingLocationSearchValue()`.
- Keep display value and filter value aligned for listing search.

- [ ] **Step 1: Write tests**

Add tests that:
- selecting `Άγιοι Ανάργυροι Αττικής` calls `onChange("Δήμος Αγίων Αναργύρων - Καματερού")`
- selecting `Περιφέρεια Αττικής` is ignored or not shown
- manual typed `Αγιοι Αναργυροι, Αττικης` remains editable and searchable
- homepage location input follows the same rules

- [ ] **Step 2: Run failing tests**

Run: `npx vitest run src/test/locationAddressSuggestions.test.tsx`

- [ ] **Step 3: Implement**

Replace:
```ts
const filterValue = selection.city || selection.municipality || selection.region || selection.value;
```

with:
```ts
const filterValue = getListingLocationSearchValue(selection);
if (!filterValue) return;
```

Use the same helper in homepage `LocationInput`.

- [ ] **Step 4: Verify**

Run: `npx vitest run src/test/locationAddressSuggestions.test.tsx`

---

### Task 4: Fix Shared Address Form Inputs

**Files:**
- Modify: `src/components/location/LocationAutocompleteInput.tsx`
- Verify callers:
  - `src/components/listings/StepLocation.tsx`
  - `src/pages/CreateNewBuildingListing.tsx`
  - `src/pages/ProjectDetail.tsx`
  - `src/pages/dashboard/DataInputTab.tsx`
  - `src/components/dashboard/ProfileEditor.tsx`
  - `src/components/dashboard/ProfessionalProfileEditor.tsx`
  - `src/components/AuctionAlertModal.tsx`
  - `src/pages/OpenHouses.tsx`

**Interfaces:**
- `mode="address"` display uses street address.
- `mode="city"` display uses city/municipality, not broad region.
- `onSuggestionSelect` receives the full structured prediction.

- [ ] **Step 1: Add tests**

Extend existing tests to cover:
- new building address selection fills `address`, `city`, `municipality`, `latitude`, `longitude`
- agent data input address selection fills structured fields
- profile city does not accept `Περιφέρεια Αττικής` as final city

- [ ] **Step 2: Run failing tests**

Run:
`npx vitest run src/test/CreateNewBuildingListing.test.tsx src/test/DataInputTab.test.tsx src/test/profileLocationInputs.test.tsx src/test/locationAddressSuggestions.test.tsx`

- [ ] **Step 3: Implement**

In `LocationAutocompleteInput`:
- use `getAddressInputDisplayValue(selection)` for `mode="address"`
- use `getListingLocationSearchValue(selection) || selection.city || selection.value` for `mode="city"`
- do not auto-apply first suggestion on blur if it is broad administrative
- never disable or mutate the native input through Google widgets

- [ ] **Step 4: Verify**

Run:
`npx vitest run src/test/CreateNewBuildingListing.test.tsx src/test/DataInputTab.test.tsx src/test/profileLocationInputs.test.tsx src/test/locationAddressSuggestions.test.tsx`

---

### Task 5: Add Indexed Normalized Listing Location Search

**Files:**
- Create migration with Supabase CLI: `supabase migration new add_listing_location_search_text`
- Modify generated Supabase types if needed.
- Test: add `src/test/listingLocationSearchMigration.test.ts`

**Interfaces:**
- DB produces `public.normalize_location_text(input text) returns text`.
- DB column: `listings.location_search_text`.

- [ ] **Step 1: Generate migration**

Run:
`supabase migration new add_listing_location_search_text`

- [ ] **Step 2: Add migration SQL**

Use an immutable normalizer with `lower`, `translate`, `regexp_replace`, and `concat_ws`:

```sql
CREATE OR REPLACE FUNCTION public.normalize_location_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(regexp_replace(
    translate(
      lower(coalesce(input, '')),
      'άέήίϊΐόύϋΰώΆΈΉΊΪΌΎΫΏς–—,-.',
      'αεηιιιο包υυυωαεηιιο包υυωσ      '
    ),
    '\s+',
    ' ',
    'g'
  ));
$$;
```

Then add a stored generated column or trigger-maintained column containing:
`title`, `address`, `city`, `region`, `postal_code`.

Add GIN trigram index:
```sql
CREATE INDEX IF NOT EXISTS idx_listings_location_search_text_trgm
  ON public.listings USING gin (location_search_text extensions.gin_trgm_ops);
```

Note: fix the `translate` character lists carefully during implementation so source and destination lengths match exactly.

- [ ] **Step 3: Add migration test**

Assert migration contains:
- `normalize_location_text`
- `location_search_text`
- `gin_trgm_ops`
- `address`
- `city`
- `region`

- [ ] **Step 4: Verify**

Run:
`npm run lint:migrations`
`npm run lint:migrations:chronology`
`npx vitest run src/test/listingLocationSearchMigration.test.ts`

---

### Task 6: Wire Frontend and Public API Queries to Normalized Search

**Files:**
- Modify: `src/hooks/useListings.ts`
- Modify: `functions/api/public/listings.ts`
- Tests:
  - `src/test/useListings.filters.test.ts`
  - `functions/api/public/public-api.test.ts`

**Interfaces:**
- Existing `city` param remains accepted.
- Search applies normalized location matching rather than city-only matching.

- [ ] **Step 1: Update tests**

Frontend query should filter `location_search_text` instead of only `city`.

Public API should send:
`location_search_text=ilike.*<normalized>*`

Add test for `Αγιοι Αναργυροι` expecting normalized value to match stored municipality text.

- [ ] **Step 2: Run failing tests**

Run:
`npx vitest run src/test/useListings.filters.test.ts`
`npm run test:functions -- functions/api/public/public-api.test.ts`

- [ ] **Step 3: Implement frontend**

In `buildListingsQuery`, replace city-only branch with normalized location branch:
```ts
if (filters?.city) query = query.ilike("location_search_text", `%${normalizeGreekLocationText(filters.city)}%`);
```

- [ ] **Step 4: Implement public API**

In `functions/api/public/listings.ts`, normalize `city` param and map it to `location_search_text`.

- [ ] **Step 5: Verify**

Run:
`npx vitest run src/test/useListings.filters.test.ts functions/api/public/public-api.test.ts`

---

### Task 7: Fix Dropdown UX and Race Conditions

**Files:**
- Modify: `src/hooks/useAddressAutocomplete.ts`
- Modify: `src/components/listings/LocationSearchField.tsx`
- Modify: `src/components/index/LocationInput.tsx`
- Modify: `src/components/location/LocationAutocompleteInput.tsx`
- Tests: `src/test/locationAddressSuggestions.test.tsx`

**Required behavior:**
- No concatenated title/subtitle text.
- No grey exclamation/broken provider artifacts.
- Loading state is visible but not spammy.
- Dropdown does not close before the first selectable row can be clicked.
- Stale Google/Nominatim responses cannot replace newer typed suggestions.

- [ ] **Step 1: Add stale-response test**

Mock two delayed provider responses:
- first query returns late
- second query returns fast
- UI must show only second query results.

- [ ] **Step 2: Implement**

Add request sequence id in `useAddressAutocomplete`.
Only apply provider results when the sequence id matches the latest query.

- [ ] **Step 3: Verify**

Run:
`npx vitest run src/test/locationAddressSuggestions.test.tsx`

---

### Task 8: E2E Test Every Address Bar

**Files:**
- Modify or add: `e2e/address-autocomplete.spec.ts`

**Coverage matrix:**
- Homepage omnibox.
- Listings page desktop search.
- Listings page mobile search.
- Create listing address step.
- Agent data input property address.
- Developer new building city/address/municipality.
- Project edit address.
- Profile city.
- Professional profile city.
- Open houses city filter.

- [ ] **Step 1: Add E2E fixtures**

Use test addresses:
- `Αγιοι Αναργυροι, Αττικης`
- `Υμηττού 6, Άγιοι Ανάργυροι`
- `11 Δημάρχου Άγγελου Μεταξά, Γλυφάδα`
- `Voukourestiou 14, Athens`

- [ ] **Step 2: Run local E2E**

Run:
`npm run test:e2e -- e2e/address-autocomplete.spec.ts`

- [ ] **Step 3: Run live-safe browser probes**

Use Browser/Playwright against `https://portal.maiprop.co/listings?listing_type=sale`.
Verify:
- typing `Αγιοι Αναργυροι, Αττικης` does not select `Περιφέρεια Αττικής`
- selecting the top valid municipality returns the active new-build listing
- no console errors from Google Places
- Google attribution visible when Google predictions are shown

---

### Task 9: Full Verification and Deployment Gate

**Files:** no code files.

- [ ] **Step 1: Run focused tests**

```bash
npx vitest run src/test/locationSearchSemantics.test.ts src/test/addressAutocompleteFormatting.test.ts src/test/locationAddressSuggestions.test.tsx src/test/useListings.filters.test.ts src/test/CreateNewBuildingListing.test.tsx src/test/DataInputTab.test.tsx src/test/profileLocationInputs.test.tsx functions/api/public/public-api.test.ts
```

- [ ] **Step 2: Run broad gates**

```bash
npm run check:secrets
npm run typecheck
npm run test
npm run test:deno
npm run test:e2e
npm run lint:migrations
npm run lint:migrations:chronology
```

- [ ] **Step 3: Verify production after deploy**

After merge/deploy only:
- open `/listings?listing_type=sale`
- search `Αγιοι Αναργυροι, Αττικης`
- confirm no broad `Περιφέρεια Αττικής` final selection
- confirm the Agioi Anargyroi new-build listing appears
- verify homepage, listings, create listing, new building, data input, and profile address bars still work.

---

## Self-Review

- Spec coverage: all address/autosuggest surfaces are covered through shared component wiring plus explicit caller verification.
- Main root cause covered: broad Google region predictions are rejected, and city-only filtering is replaced with normalized location search.
- Backward compatibility covered: existing `city` URL param remains supported.
- Performance covered: normalized indexed DB column avoids scanning raw address/city text.
- Compliance covered: Google attribution remains required for custom Google prediction dropdowns.

