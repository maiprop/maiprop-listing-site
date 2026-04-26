# Project Audit — maiprop-listing-site
**Date:** 2026-04-06  
**Total open issues:** 39  
**Already fixed this sprint:** 11 (see bottom)

---

## P1 — Critical / Runtime Crash

### P1-1 · Undefined `db` variable — crashes at runtime
**Files:**
- `src/hooks/useProjectMedia.ts` lines 21, 50 — `db.from(...)` in useCreateProjectMedia, useDeleteProjectMedia  
- `src/hooks/useProjectLeads.ts` lines 24, 40, 60 — `db.from(...)` in useCreateProjectLead, useUpdateProjectLead, useDeleteProjectLead  
- `src/hooks/useProjectUnits.ts` lines 40, 57, 78 — `db.from(...)` in useCreateProjectUnit, useUpdateProjectUnit, useDeleteProjectUnit  

**Issue:** `db` is never imported or defined — these mutations will throw `ReferenceError: db is not defined` at runtime.  
**Fix:** Replace every `db.from(` with `supabase.from(` in all three files.

---

## P2 — Security / IDOR

### P2-1 · useUpdateContactTask — no ownership guard
**File:** `src/hooks/useContacts.ts` lines 180–181  
**Issue:** `UPDATE contact_tasks WHERE id = ?` — no `.eq("user_id", user.id)`. Any logged-in user who knows a task `id` can overwrite another user's task.  
**Fix:** Add `useAuth`, then `.eq("user_id", user.id)` alongside `.eq("id", id)`.

### P2-2 · useDeleteProjectMedia — no project ownership guard
**File:** `src/hooks/useProjectMedia.ts` line 50  
**Issue:** `DELETE project_media WHERE id = ?` — no check that the project belongs to the current user.  
**Fix:** Add `.eq("project_id", projectId)` to the delete, where `projectId` is verified to belong to `user.id` via the project's `owner_id`.

### P2-3 · useDeleteProjectUnit — no ownership guard
**File:** `src/hooks/useProjectUnits.ts` line 78  
**Issue:** Same pattern — deletes by `id` only.  
**Fix:** Accept `projectId` in the mutation args, add `.eq("project_id", projectId)` and verify the project belongs to `user.id`.

### P2-4 · useDeleteProjectLead — no ownership guard
**File:** `src/hooks/useProjectLeads.ts` line 60  
**Issue:** Same pattern.  
**Fix:** Same as P2-3.

### P2-7 · useUpdateProjectLead — no ownership guard (once db→supabase fixed)
**File:** `src/hooks/useProjectLeads.ts` lines 56–72  
**Issue:** `UPDATE project_leads WHERE id = ?` — `projectId` is accepted as a param but not used in the query (it's only used for cache invalidation). Once the `db` crash is fixed, this becomes an IDOR: any user can overwrite any lead.  
**Fix:** Add `.eq("project_id", projectId)` to the update query after the `db→supabase` fix.

### P2-8 · useUpdateProjectUnit — no ownership guard (once db→supabase fixed)
**File:** `src/hooks/useProjectUnits.ts` lines 75–95  
**Issue:** Same pattern — `projectId` is `_projectId` (ignored). Once the `db` crash is fixed, becomes IDOR.  
**Fix:** Add `.eq("project_id", projectId)` to the update query.

### P2-9 · ViewingDialog.tsx — `images[0]` without null/empty guard
**File:** `src/components/ViewingDialog.tsx` line 143  
**Issue:** `<img src={property.images[0]} />` — if `images` is `undefined` or empty array, this crashes with a type error / renders broken image.  
**Fix:** `property.images?.[0]`

### P2-5 · Stripe webhook correlates by email instead of user_id
**File:** `supabase/functions/stripe-webhook/index.ts` lines 116, 143  
**Issue:** `UPDATE profiles WHERE email = customer.email` — email can be changed or spoofed; subscription state should be tied to the immutable `user_id` stored in Stripe customer metadata.  
**Fix:** At checkout creation (`create-checkout`), store `user_id` in Stripe customer metadata. In the webhook, retrieve `customer.metadata.user_id` and use `.eq("user_id", ...)` instead of email.

### P2-6 · create-checkout does not store user_id in Stripe metadata
**File:** `supabase/functions/create-checkout/index.ts`  
**Issue:** Related to P2-5 — the checkout flow does not write `user_id` into Stripe customer metadata, making email the only link between Stripe and Supabase profiles.  
**Fix:** Add `metadata: { user_id: user.id }` when creating or retrieving the Stripe customer.

---

## P3 — Performance / Quality

### P3-1 · Client-side sort in useAuctionListings
**File:** `src/hooks/useAuctionListings.ts` lines 48–62  
**Issue:** After fetching all auctions, result is sorted client-side by `is_featured`, `priority_placement`, `auction_date`. This cannot be paginated and loads all rows into memory.  
**Fix:** Add `.order("is_featured", { ascending: false }).order("priority_placement", { ascending: false })` to the Supabase query and remove the client-side `.sort()`.

### P3-2 · Admin: AdminSubscribers still uses useState/useEffect
**File:** `src/components/AdminSubscribers.tsx` line 99  
**Issue:** `useEffect(() => { void loadAllSubs(); }, [])` pattern — no cache, no background refetch, no loading state management via React Query.  
**Fix:** Migrate to `useQuery` + `useMutation`.

### P3-3 · Admin: AdminInvitationRequests still uses useState/useEffect
**File:** `src/components/AdminInvitationRequests.tsx` line 110  
**Issue:** Same pattern.  
**Fix:** Migrate to `useQuery` + `useMutation`.

### P3-4 · Admin: AdminReports still uses useState/useEffect (2 effects)
**File:** `src/components/AdminReports.tsx` lines 151, 328  
**Issue:** Two separate `useEffect` data-fetching blocks. Complex manual state.  
**Fix:** Migrate to React Query with separate `useQuery` calls per data type.

### P3-5 · Large monolithic page: Firesale.tsx (1258 lines)
**File:** `src/pages/Firesale.tsx`  
**Issue:** Handles photo upload/compression, AI estimation, form validation, address geocoding, and submission all in one file.  
**Fix:** Extract: `FiresalePhotoUpload`, `FiresaleAIEstimate`, `FiresaleAddressStep` components + a `useFiresaleForm` hook.

### P3-6 · Large monolithic page: PropertyDetail.tsx (1230 lines)
**File:** `src/pages/PropertyDetail.tsx`  
**Issue:** Mixes gallery, features, owner card, viewing booking, messages, valuation, and map into one file. (Partially split in session 2 — continued reduction still needed.)  
**Fix:** Extract remaining inline sections: `PropertyValuationSection`, `PropertyViewingSection`, `PropertyMapSection`.

### P3-7 · Large monolithic page: Listings.tsx (1167 lines)
**File:** `src/pages/Listings.tsx`  
**Issue:** Map mode and list mode, all filters, mobile/desktop layouts, and AI search all in one file.  
**Fix:** Extract `ListingsMapView`, `ListingsGridView`, `ListingsFilterSidebar` components.

### P3-9 · InvestorDashboard.tsx — useEffect for subscription fetch
**File:** `src/pages/InvestorDashboard.tsx` line 88  
**Issue:** `useEffect(() => { loadSubscription(); }, [...])` manually manages subscription state instead of using React Query. No background refetch, no caching.  
**Fix:** Replace with `useQuery` (or reuse `useSubscription` hook if it exists).

### P3-10 · Dashboard.tsx — useEffect for invitation_requests with `as any` table
**File:** `src/pages/Dashboard.tsx` lines 82–98  
**Issue:** Manual `useEffect` + `setState` fetching from `"invitation_requests" as any` (table not in generated types). No error handling shown to user.  
**Fix:** Extract to `useInvitationStatus()` hook using `useQuery`; add the table to Supabase types.

### P3-8 · Large page: Dashboard.tsx (803 lines)
**File:** `src/pages/Dashboard.tsx`  
**Issue:** Mixes multiple tab panes inline.  
**Fix:** Extract inline tab content into `src/pages/dashboard/` subcomponents (pattern already started there).

---

## P4 — Tests

### P4-1 · Zero hook unit tests
**Issue:** 8 test files exist, all testing pure utility functions (`format.ts`, `compressImage.ts`, `authUtils.ts`, etc.). No tests for any React Query hooks.  
**Coverage gaps:** `useListings`, `useContacts`, `useLeads`, `useFavorites`, `useViewings`, `usePortfolios`, `useProjects` — all zero coverage.  
**Fix:** Add hook tests using `renderHook` + `makeMockSupabase()` from `src/test/utils.tsx`.

### P4-2 · Zero component tests
**Issue:** No `*.test.tsx` files for any component or page.  
**Priority targets:** `PropertyCard`, `AdminPanel`, `ProtectedRoute`, `AuthContext` (login/logout flows).  
**Fix:** Use `renderWithProviders` from `src/test/utils.tsx`.

### P4-3 · Zero IDOR regression tests
**Issue:** All the ownership-guard fixes added in this sprint have no tests — a future refactor could silently remove them.  
**Fix:** Add mutation tests that assert the `.eq("user_id", ...)` filter is always included.

---

## P5 — Minor Cleanup

### P5-1 · MIME type validation uses `.startsWith("image/")` instead of allowlist
**File:** `src/pages/Firesale.tsx` lines 256, 303  
**Issue:** `.startsWith("image/")` admits `image/svg+xml`, `image/x-xbitmap`, etc. which could be problematic.  
**Fix:** Use the explicit allowlist already in `compressImage.ts`: `["image/jpeg", "image/png", "image/webp", "image/gif"]`.

### P5-2 · Non-UUID placeholder IDs in upload flows
**Files:**
- `src/hooks/useListingForm.ts` line 216 — `placeholder-${Date.now()}-${Math.random()}`
- `src/pages/CreateNewBuildingListing.tsx` lines 145, 169 — same pattern

**Issue:** These generate non-unique, predictable IDs for local optimistic items. Violates the `crypto.randomUUID()` convention.  
**Fix:** Replace with `crypto.randomUUID()`.

### P5-3 · `as any` casts in hooks (weaker type safety)
**Files:**
- `src/hooks/useListings.ts` lines 106, 127, 186 — feature column filter and profile map
- `src/hooks/useOpenHouseAssetControl.ts` lines 190, 235, 315
- `src/hooks/usePrivateOwnerAdAlert.ts` lines 15, 28, 35 — table name not in generated types
- `src/hooks/useProfessionals.ts` lines 8, 14 — RPC + category enum
- `src/hooks/useSimilarListings.ts` lines 26, 31, 32, 43
- `src/hooks/useConsultations.ts` line 50

**Issue:** These suppress type errors rather than fixing them. Increases chance of silent runtime bugs.  
**Fix:** Where the table/column exists in the DB schema, regenerate types (`supabase gen types`). Where it's a legitimate workaround (e.g. `private_owner_ad_alerts` not yet in generated types), add a `// TODO: regenerate types` comment.

### P5-5 · ViewingDialog.tsx — `as any` cast + fire-and-forget promise
**File:** `src/components/ViewingDialog.tsx` lines 86, 104  
**Issue (a):** `} as any)` on the lead insert payload hides type errors.  
**Issue (b):** `.then(({ error: leadErr }) => ...)` — promise is not awaited in an error path; failure is only `console.warn`'d and user still sees success.  
**Fix:** Type the payload properly; use `await` with a try/catch.

### P5-6 · `onError: (e: any)` in useAuctionAlerts + usePrivateOwnerAdAlert
**Files:**  
- `src/hooks/useAuctionAlerts.ts` lines 50, 70, 90  
- `src/hooks/usePrivateOwnerAdAlert.ts` line 45  
**Issue:** `onError: (e: any)` — should be `(e: Error)` (React Query always passes an `Error`).  
**Fix:** Change all four to `onError: (e: Error) => toast.error(e.message)`.

### P5-4 · Dead code: `isBuySideRole` always returns `false`
**File:** `src/lib/authUtils.ts` line 27  
**Issue:** Function body is a stub returning `false` — never returns `true`. No callers exist outside the file.  
**Fix:** Remove the function entirely.

### P5-5 · TypeScript compiler too loose
**File:** `tsconfig.app.json`  
**Issue:** `"strict": false`, `"noImplicitAny": false`, `"noUnusedLocals": false`, `"noUnusedParameters": false` all disabled.  
**Risk:** Silently allows implicit `any`, unused variables, and missing null checks. Makes the P2/P3 issues above harder to catch statically.  
**Fix (incremental):**
1. First enable `"noUnusedLocals": true` + `"noUnusedParameters": true` (low blast radius)
2. Then `"noImplicitAny": true` (medium — fixes needed)
3. Finally `"strict": true` (large — full null/undefined checking)

---

## Already Fixed This Sprint (do not re-open)

| # | What | File(s) |
|---|------|---------|
| ✅ | IDOR: useUpdateListing, useDeleteListing | `useListings.ts` |
| ✅ | IDOR: useUpdatePortfolio, useDeletePortfolio | `usePortfolios.ts` |
| ✅ | IDOR: useUpdateProject, useDeleteProject | `useProjects.ts` |
| ✅ | IDOR: useUpdateViewingStatus, useUpdateViewing | `useViewings.ts` |
| ✅ | IDOR: useUpdateProfessional + upsert hooks | `useProfessionalServices.ts` |
| ✅ | N+1: useIsFavorited → derive from useFavorites cache | `useFavorites.ts` |
| ✅ | React Query: AdminFiresalePipeline | `AdminFiresalePipeline.tsx` |
| ✅ | React Query: AdminInvestorScreening | `AdminInvestorScreening.tsx` |
| ✅ | React Query: AdminProfessionalVerification + missing Button import | `AdminProfessionalVerification.tsx` |
| ✅ | `as any` → `Record<string, unknown>` in useUpdateViewing | `useViewings.ts` |
| ✅ | Stale query key invalidations removed from useToggleFavorite | `useFavorites.ts` |
