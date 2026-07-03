# Address Autocomplete Provider Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragmented address/search autocomplete with one reliable, provider-backed, mobile-safe autocomplete system across Maiprop.

**Architecture:** Build a provider-neutral address autocomplete layer that normalizes Google Places, Mapbox Search Box, and the existing emergency Nominatim fallback into one internal shape. Render all predictions through one Maiprop-owned combobox UI so provider output never leaks raw, bizarre, or unstable formatting into the app.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, Playwright, Google Places JavaScript/Data API, Mapbox Search Box API, existing Nominatim fallback.

---

## Scope

This plan covers:
- public listing search and homepage search
- create/edit listing address fields
- new building create/edit address fields
- project edit address fields
- agent Data Input address field
- profile/professional city fields where the shared autocomplete is already used
- tests proving address selection updates display value, city, municipality/region, postal code, latitude, and longitude

This plan does not cover:
- map rendering provider changes
- billing/provider-cost monitoring dashboards
- production key rotation

## File Structure

- Create `src/lib/location/addressTypes.ts`: shared prediction and selection types.
- Create `src/lib/location/addressFormat.ts`: display normalization for all providers.
- Create `src/lib/location/googlePlacesProvider.ts`: Google Places adapter.
- Create `src/lib/location/mapboxSearchProvider.ts`: Mapbox Search Box adapter.
- Create `src/lib/location/nominatimProvider.ts`: emergency fallback adapter wrapping the current hook logic.
- Create `src/hooks/useAddressAutocomplete.ts`: debounced, abortable provider orchestration.
- Modify `src/components/location/LocationAutocompleteInput.tsx`: render the shared Maiprop combobox UI and remove provider-specific branching from the component.
- Modify `src/components/listings/LocationSearchField.tsx`: use the same hook/UI behavior for listing filters.
- Modify `src/components/index/LocationInput.tsx`: use the same hook/UI behavior for homepage search.
- Modify `src/components/listings/StepLocation.tsx`: keep existing field wiring, consume normalized selection payloads.
- Modify `src/pages/CreateNewBuildingListing.tsx`: verify normalized project address selection writes project coordinates and city fields.
- Modify `src/pages/ProjectDetail.tsx`: verify project edit address selection uses normalized payloads.
- Modify `src/pages/dashboard/DataInputTab.tsx`: verify Data Input address selection uses normalized payloads.
- Modify tests under `src/test/locationAddressSuggestions.test.tsx`, `src/test/StepLocation.googleFallback.test.tsx`, `src/test/CreateNewBuildingListing.test.tsx`, and add `e2e/address-autocomplete.spec.ts`.

---

### Task 1: Define the Normalized Address Contract

**Files:**
- Create: `src/lib/location/addressTypes.ts`
- Create: `src/lib/location/addressFormat.ts`
- Test: `src/test/addressFormat.test.ts`

- [ ] **Step 1: Write the failing formatter tests**

```ts
import { describe, expect, it } from "vitest";
import { formatAddressPrediction } from "@/lib/location/addressFormat";

describe("formatAddressPrediction", () => {
  it("shows a clean Greek street address with locality context", () => {
    expect(formatAddressPrediction({
      id: "google:1",
      provider: "google",
      label: "11 Δημάρχου Αγγέλου Μεταξά",
      secondary: "Γλυφάδα, Αττική, Ελλάδα",
      addressLine: "11 Δημάρχου Αγγέλου Μεταξά",
      city: "Γλυφάδα",
      municipality: "Δήμος Γλυφάδας",
      region: "Αττική",
      country: "Ελλάδα",
      postalCode: "16675",
      latitude: "37.866",
      longitude: "23.755",
    })).toEqual({
      title: "11 Δημάρχου Αγγέλου Μεταξά",
      subtitle: "Γλυφάδα, Αττική, Ελλάδα",
    });
  });

  it("does not expose raw comma-heavy provider dumps as the primary label", () => {
    expect(formatAddressPrediction({
      id: "nominatim:1",
      provider: "nominatim",
      label: "Καλύμνου, Ανάκασα, Δημοτική Ενότητα Αγίων Αναργύρων - Καματερού, Δήμος Αγίων Αναργύρων - Καματερού, Περιφερειακή Ενότητα Κεντρικού Τομέα Αθηνών, Αττική, Ελλάδα",
      secondary: "Ανάκασα, Αττική, Ελλάδα",
      addressLine: "Καλύμνου",
      city: "Ανάκασα",
      municipality: "Δήμος Αγίων Αναργύρων - Καματερού",
      region: "Αττική",
      country: "Ελλάδα",
    })).toEqual({
      title: "Καλύμνου",
      subtitle: "Ανάκασα, Αττική, Ελλάδα",
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npx vitest run src/test/addressFormat.test.ts
```

Expected: fails because `addressFormat.ts` does not exist.

- [ ] **Step 3: Implement shared types and formatting**

```ts
// src/lib/location/addressTypes.ts
export type AddressProvider = "google" | "mapbox" | "nominatim";

export interface AddressPrediction {
  id: string;
  provider: AddressProvider;
  label: string;
  secondary?: string;
  addressLine?: string;
  city?: string;
  municipality?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  latitude?: string;
  longitude?: string;
}

export interface AddressAutocompleteResult {
  predictions: AddressPrediction[];
  provider: AddressProvider | "none";
  loading: boolean;
  error: string | null;
}
```

```ts
// src/lib/location/addressFormat.ts
import type { AddressPrediction } from "@/lib/location/addressTypes";

const clean = (value?: string | null) => value?.trim().replace(/\s+/g, " ") ?? "";

export function formatAddressPrediction(prediction: AddressPrediction) {
  const title = clean(prediction.addressLine) || clean(prediction.label);
  const subtitle = clean(prediction.secondary)
    || [prediction.city, prediction.region, prediction.country || "Ελλάδα"].map(clean).filter(Boolean).join(", ");

  return {
    title: title.split(",")[0] || clean(prediction.label),
    subtitle,
  };
}
```

- [ ] **Step 4: Run the formatter test**

Run:

```bash
npx vitest run src/test/addressFormat.test.ts
```

Expected: pass.

---

### Task 2: Add Provider Adapters

**Files:**
- Create: `src/lib/location/googlePlacesProvider.ts`
- Create: `src/lib/location/mapboxSearchProvider.ts`
- Create: `src/lib/location/nominatimProvider.ts`
- Test: `src/test/addressProviders.test.ts`

- [ ] **Step 1: Write provider normalization tests**

```ts
import { describe, expect, it } from "vitest";
import { normalizeGooglePlace } from "@/lib/location/googlePlacesProvider";
import { normalizeMapboxSuggestion } from "@/lib/location/mapboxSearchProvider";
import { normalizeNominatimSuggestion } from "@/lib/location/nominatimProvider";

describe("address provider normalization", () => {
  it("normalizes Google place details", () => {
    expect(normalizeGooglePlace({
      placeId: "g1",
      formattedAddress: "11 Δημάρχου Αγγέλου Μεταξά, Γλυφάδα 166 75, Ελλάδα",
      location: { lat: 37.866, lng: 23.755 },
      addressComponents: [
        { longText: "11", types: ["street_number"] },
        { longText: "Δημάρχου Αγγέλου Μεταξά", types: ["route"] },
        { longText: "Γλυφάδα", types: ["locality"] },
        { longText: "Αττική", types: ["administrative_area_level_1"] },
        { longText: "16675", types: ["postal_code"] },
      ],
    })).toMatchObject({
      provider: "google",
      addressLine: "11 Δημάρχου Αγγέλου Μεταξά",
      city: "Γλυφάδα",
      region: "Αττική",
      postalCode: "16675",
      latitude: "37.866",
      longitude: "23.755",
    });
  });

  it("normalizes Mapbox retrieve result", () => {
    expect(normalizeMapboxSuggestion({
      mapbox_id: "m1",
      name: "11 Dimitarchou Aggelou Metaxa",
      place_formatted: "Glyfada, Attica, Greece",
      context: {
        place: { name: "Glyfada" },
        region: { name: "Attica" },
        postcode: { name: "16675" },
        country: { name: "Greece" },
      },
      coordinates: { latitude: 37.866, longitude: 23.755 },
    })).toMatchObject({
      provider: "mapbox",
      addressLine: "11 Dimitarchou Aggelou Metaxa",
      city: "Glyfada",
      region: "Attica",
      postalCode: "16675",
      latitude: "37.866",
      longitude: "23.755",
    });
  });

  it("normalizes Nominatim without exposing raw display_name as title", () => {
    expect(normalizeNominatimSuggestion({
      display_name: "Καλύμνου, Ανάκασα, Δήμος Αγίων Αναργύρων - Καματερού, Αττική, Ελλάδα",
      lat: "38.03",
      lon: "23.72",
      address: {
        road: "Καλύμνου",
        suburb: "Ανάκασα",
        municipality: "Δήμος Αγίων Αναργύρων - Καματερού",
        state: "Αττική",
      },
    })).toMatchObject({
      provider: "nominatim",
      addressLine: "Καλύμνου",
      city: "Ανάκασα",
      region: "Αττική",
    });
  });
});
```

- [ ] **Step 2: Run the failing provider tests**

Run:

```bash
npx vitest run src/test/addressProviders.test.ts
```

Expected: fails because provider files do not exist.

- [ ] **Step 3: Implement pure normalizers first**

Implement exported pure functions:
- `normalizeGooglePlace(place)`
- `normalizeMapboxSuggestion(feature)`
- `normalizeNominatimSuggestion(suggestion)`

Keep network fetch functions separate from normalizers so tests do not need real provider calls.

- [ ] **Step 4: Add network functions**

Add:
- `fetchGooglePredictions(query, options)`
- `fetchMapboxPredictions(query, options)`
- `fetchNominatimPredictions(query, options)`

Rules:
- minimum query length: 3 characters
- restrict default country to Greece
- return `AddressPrediction[]`
- never throw to the UI; return `[]` and log only in development
- Mapbox must use `/suggest` while typing and `/retrieve` only when selected
- Google must use a session token per typing session

- [ ] **Step 5: Run provider tests**

Run:

```bash
npx vitest run src/test/addressProviders.test.ts
```

Expected: pass.

---

### Task 3: Build the Shared Autocomplete Hook

**Files:**
- Create: `src/hooks/useAddressAutocomplete.ts`
- Test: `src/test/useAddressAutocomplete.test.tsx`

- [ ] **Step 1: Write hook tests**

```ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";

vi.mock("@/lib/location/googlePlacesProvider", () => ({
  fetchGooglePredictions: vi.fn(async () => [{
    id: "google:1",
    provider: "google",
    label: "11 Δημάρχου Αγγέλου Μεταξά",
    addressLine: "11 Δημάρχου Αγγέλου Μεταξά",
    city: "Γλυφάδα",
    region: "Αττική",
  }]),
}));

vi.mock("@/lib/location/mapboxSearchProvider", () => ({
  fetchMapboxPredictions: vi.fn(async () => [{
    id: "mapbox:1",
    provider: "mapbox",
    label: "Metaxa 11",
    addressLine: "Metaxa 11",
    city: "Glyfada",
  }]),
}));

describe("useAddressAutocomplete", () => {
  it("debounces queries and prefers Google when available", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAddressAutocomplete({ providerOrder: ["google", "mapbox"] }));

    act(() => result.current.setQuery("Με"));
    expect(result.current.predictions).toEqual([]);

    act(() => result.current.setQuery("Μεταξά 11"));
    await act(async () => {
      vi.advanceTimersByTime(300);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => expect(result.current.predictions[0].provider).toBe("google"));
  });
});
```

- [ ] **Step 2: Implement the hook**

Implement:
- `query`
- `setQuery`
- `predictions`
- `loading`
- `error`
- `clear`
- provider order logic
- request abort/cancellation guard
- debounce at `275ms`

- [ ] **Step 3: Run hook tests**

Run:

```bash
npx vitest run src/test/useAddressAutocomplete.test.tsx
```

Expected: pass.

---

### Task 4: Replace the Shared Address Component UI

**Files:**
- Modify: `src/components/location/LocationAutocompleteInput.tsx`
- Test: `src/test/locationAddressSuggestions.test.tsx`

- [ ] **Step 1: Update tests to expect clean rows**

Add assertions:

```ts
expect(screen.getByText("11 Δημάρχου Αγγέλου Μεταξά")).toBeInTheDocument();
expect(screen.getByText("Γλυφάδα, Αττική, Ελλάδα")).toBeInTheDocument();
expect(screen.queryByText(/Δημοτική Ενότητα.*Περιφερειακή Ενότητα/)).not.toBeInTheDocument();
```

- [ ] **Step 2: Replace internal Google/Nominatim logic**

Use `useAddressAutocomplete` inside `LocationAutocompleteInput`.

UI rules:
- rows are 48-56px high on desktop and mobile
- primary line is `formatAddressPrediction(prediction).title`
- secondary line is `formatAddressPrediction(prediction).subtitle`
- no raw provider icon spam
- no auto-select on blur when the user has not selected a prediction
- Enter selects the highlighted prediction
- Escape closes the list
- selecting a row calls `onSuggestionSelect(prediction)`

- [ ] **Step 3: Run shared component tests**

Run:

```bash
npx vitest run src/test/locationAddressSuggestions.test.tsx src/test/StepLocation.googleFallback.test.tsx
```

Expected: pass.

---

### Task 5: Wire Public Search Fields

**Files:**
- Modify: `src/components/listings/LocationSearchField.tsx`
- Modify: `src/components/index/LocationInput.tsx`
- Test: `src/test/locationAddressSuggestions.test.tsx`
- Test: `src/test/Listings.interactions.test.tsx`

- [ ] **Step 1: Add tests for search selection**

Assert that selecting a prediction writes the readable search term, not the raw provider dump:

```ts
expect(input).toHaveValue("Καλύμνου");
expect(onSearch).toHaveBeenCalledWith("Καλύμνου");
```

- [ ] **Step 2: Refactor both fields to shared autocomplete**

Rules:
- search field can accept city/neighbourhood/street
- selected prediction writes `addressLine || city || label`
- no coordinates are required for search filter
- dropdown width tracks the input
- mobile uses full-width popover behavior if the input is narrower than 360px

- [ ] **Step 3: Run public search tests**

Run:

```bash
npx vitest run src/test/locationAddressSuggestions.test.tsx src/test/Listings.interactions.test.tsx
```

Expected: pass.

---

### Task 6: Verify All Form Wiring

**Files:**
- Modify: `src/components/listings/StepLocation.tsx`
- Modify: `src/pages/CreateNewBuildingListing.tsx`
- Modify: `src/pages/ProjectDetail.tsx`
- Modify: `src/pages/dashboard/DataInputTab.tsx`
- Test: `src/test/CreateNewBuildingListing.test.tsx`
- Test: `src/test/ProjectsTab.test.tsx`
- Test: `src/test/DataInputTab.test.tsx`

- [ ] **Step 1: Add/adjust tests for address payload wiring**

For every form, assert selected prediction updates:
- address
- city
- region/municipality
- postal code
- latitude
- longitude where the model stores coordinates

- [ ] **Step 2: Update form handlers to accept `AddressPrediction`**

Use:

```ts
const applyAddressSelection = (selection: AddressPrediction) => {
  set("address", selection.addressLine || selection.label);
  if (selection.city) set("city", selection.city);
  if (selection.municipality || selection.region) set("region", selection.municipality || selection.region);
  if (selection.postalCode) set("postal_code", selection.postalCode);
  if (selection.latitude) set("latitude", selection.latitude);
  if (selection.longitude) set("longitude", selection.longitude);
};
```

Adapt field-specific setters for project and data input state.

- [ ] **Step 3: Run form tests**

Run:

```bash
npx vitest run src/test/CreateNewBuildingListing.test.tsx src/test/ProjectsTab.test.tsx src/test/DataInputTab.test.tsx src/test/StepLocation.googleFallback.test.tsx
```

Expected: pass.

---

### Task 7: Add Browser E2E Coverage

**Files:**
- Create: `e2e/address-autocomplete.spec.ts`
- Modify: `playwright.config.ts` only if the existing config needs route mocks for provider requests

- [ ] **Step 1: Add route mocks for provider APIs**

Mock:
- Google script load if needed
- Mapbox `/suggest`
- Mapbox `/retrieve`
- Nominatim fallback

- [ ] **Step 2: Add desktop flow**

Test:
- `/for-sale`
- type `Καλύμνου`
- select clean suggestion
- verify filter value and no horizontal overflow

- [ ] **Step 3: Add mobile flow**

Test:
- mobile viewport
- `/dashboard/data-input` or the closest authenticated mocked route already supported by the e2e harness
- type `Ermou 12`
- select suggestion
- verify no repeated warning-chip UI and no visual overflow

- [ ] **Step 4: Run E2E file**

Run:

```bash
npx playwright test e2e/address-autocomplete.spec.ts --project=chromium
```

Expected: pass.

---

### Task 8: Documentation and Env Contract

**Files:**
- Modify: `docs/ENV_SETUP.md`
- Modify: `docs/CLOUDFLARE_PAGES_SETUP.md`
- Modify: `.env.example` if present

- [ ] **Step 1: Document provider order**

Add:
- `VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE=true`
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_MAPBOX_TOKEN`
- provider order: Google → Mapbox → emergency fallback
- key restrictions: browser referrer restrictions for Google and Mapbox

- [ ] **Step 2: Run docs-sensitive checks**

Run:

```bash
npm run check:secrets
npm run typecheck
```

Expected: pass.

---

### Task 9: Full Verification Before PR

**Files:**
- All files changed above

- [ ] **Step 1: Run focused tests**

```bash
npx vitest run src/test/addressFormat.test.ts src/test/addressProviders.test.ts src/test/useAddressAutocomplete.test.tsx src/test/locationAddressSuggestions.test.tsx src/test/StepLocation.googleFallback.test.tsx src/test/CreateNewBuildingListing.test.tsx src/test/DataInputTab.test.tsx
```

Expected: pass.

- [ ] **Step 2: Run app gates**

```bash
npm run check:secrets
npm run typecheck
npm run test
npm run test:e2e
npm run test:perf
```

Expected: pass.

- [ ] **Step 3: Run live-safe browser verification after deploy**

Verify:
- desktop `/for-sale`
- mobile `/for-sale`
- authenticated listing create/edit
- authenticated new-build create/edit
- authenticated Data Input

Manual acceptance:
- suggestions are readable
- no raw provider dump
- no repeated warning icons
- selection updates expected fields
- mobile dropdown is not an endless list
- address entry does not crash after one suggestion

---

## Self-Review

- Spec coverage: provider selection, shared UI, all app address surfaces, and tests are covered.
- Placeholder scan: no deferred implementation placeholders are present.
- Type consistency: all later tasks use `AddressPrediction` from `src/lib/location/addressTypes.ts`.
- Risk control: provider keys remain public browser keys with referrer restrictions; no service-role or secret key is added to the client.
