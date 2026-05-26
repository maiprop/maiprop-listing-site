# maiProp OS ↔ Listing Site Integration

The **listing site** (this repo) integrates with **maiProp OS** ([app.os.maiprop.co](https://app.os.maiprop.co)) for:

**If you see "Edge Function unreachable" or "Failed to send a request to the Edge Function" when running Full sync:**  
The Edge Functions must be deployed to the **same** Supabase project as your app. Deploy them via Supabase Dashboard → Edge Functions (or `supabase functions deploy full-sync-from-os`). Ensure `VITE_SUPABASE_URL` in your app points to that project.

- **Full sync OS → Listing** – Auctions (and extensible: reports, ML) are synced **from** OS into the Hub via `full-sync-from-os`.
- **Firesale → OS** – Left as-is: listing site **sends** Quick Sale™ requests to OS via `sync-firesale-to-os`.
- **Reports & ML** – OS holds the database; the listing site consumes it via the OS API (full sync covers auctions; more APIs can be added when available).

API reference: **[OS Swagger UI](https://app.os.maiprop.co/swagger-ui/index.html#/)**

---

## Data flow

| Direction        | What                         | How |
|-----------------|------------------------------|-----|
| **OS → Listing** | **Full sync** (auctions, extensible) | `full-sync-from-os` – all pages of POST `/api/v1/auctions/filter/details` |
| **OS → Listing** | Single page of auctions       | `poll-os-auctions` (POST `/api/v1/auctions/filter/details`) |
| **OS → Listing** | Webhooks (listings, leads)   | `receive-from-os` (OS calls Hub Supabase function) |
| **OS → Listing** | Report by listing (valuation / neighbourhood) | `fetch-report-from-os` → listing site uses OS report when available, else AI |
| **Listing → OS** | Hub listings to backoffice   | `sync-to-os` (POST `/bo/auctions/save`) |
| **Listing → OS** | Firesale requests (unchanged) | `sync-firesale-to-os` (POST `/api/v1/auctions/create`) |

---

## 1. `full-sync-from-os` – Full sync from OS → Hub (recommended)

**Purpose:** One-shot sync of **all relevant** OS data into the Hub. Currently syncs **auctions** (all pages); designed to be extended with reports, professionals, or other OS APIs when available. **Firesale → OS is unchanged** (use `sync-firesale-to-os` for that).

**OS API:** Same as poll: `POST /api/v1/auctions/filter/details?page={page}&pageSize={pageSize}` in a loop until an empty page or `maxPages` is reached.

**Auth:** `POST /auth/login` → Bearer token (reused for all requests).

**Env:** `MAIPROP_OS_URL`, `MAIPROP_OS_EMAIL`, `MAIPROP_OS_PASSWORD`. Optional: `GOOGLE_MAPS_API_KEY`.

**Invocation:**  
`body: { pageSize?: number, maxPages?: number, auctionDateFrom?, auctionDateTo? }`  
- Default `pageSize`: 100; max 500.  
- Default `maxPages`: 200 (safety cap).

**Response:**  
`{ ok, status, sync: { auctions: { imported, updated, errors, pages, totalAvailableInOS } } }`

**UI:** OSSyncPanel “Full sync (OS → Hub)” button; AdminPanel edge function list. Suggested cron: nightly `full-sync-from-os` with `pageSize: 100`, `maxPages: 200`.

---

## 2. `poll-os-auctions` – Single-page auction fetch (OS → Hub)

**Purpose:** Import future auctions from OS into the Hub `listings` table (`listing_type='auction'`, `status='active'`).

**OS API:**  
`POST /api/v1/auctions/filter/details?page={page}&pageSize={pageSize}`
Body: `AuctionFilterRequest` (e.g. `auctionDateFrom`, `auctionDateTo`, `propertyCategories`, `prefectureId`, …).

**Auth:** `POST /auth/login` with `email` / `password` → use returned token as `Authorization: Bearer <token>`.

**Env:** `MAIPROP_OS_URL`, `MAIPROP_OS_EMAIL`, `MAIPROP_OS_PASSWORD`. Optional: `GOOGLE_MAPS_API_KEY` for Street View cover images.

**Behaviour:**
- Builds filter from request body (default: from today).
- Maps OS `AuctionOutputDto` → Hub listing (including `os_auction:<id>` tag, ownership tags, Street View URL when coords + key exist).
- Upserts by tag: existing listings updated, new ones inserted.
- Writes to `sync_log` (`direction: os_to_hub`, `entity_type: auction`).

**Invocation (e.g. from Admin/OSSyncPanel):**  
`body: { page, size?: number, pageSize?: number, auctionDateFrom?, auctionDateTo?, ...filter }`

---

## 3. `sync-to-os` – Push Hub listing to OS

**Purpose:** Send a single Hub listing to OS backoffice.

**OS API:**  
`POST /bo/auctions/save`  
Body: Hub listing mapped to OS field names (`externalId`, `title`, `firstPriceOffer`, `propertyCategory`, `imageUrls`, etc.).

**Auth:** Same as above (`/auth/login` → Bearer token).

**Env:** Same `MAIPROP_OS_*` credentials.

**Invocation:**  
`body: { listing_id: string, entity_type?: "listing" }`

---

## 4. `sync-firesale-to-os` – Send Firesale deal to OS (unchanged)

**Purpose:** Push a Firesale™ (Quick Sale) request from Hub to OS as an auction-creation payload.

**OS API:**  
`POST /api/v1/auctions/create`  
Body: Firesale request mapped to OS fields (`externalId`, `source: "maiprop-hub-firesale"`, `propertyCategory`, `firstPriceOffer`, `contactEmail`, etc.).

**Auth:** Same `/auth/login` → Bearer token.

**Invocation:**  
`body: { firesale_id: string }`  
Reads from Hub table `firesale_requests`.

---

## 5. `fetch-report-from-os` – Get report from OS API (report ↔ listing)

**Purpose:** Fetch a report from the OS for a given listing. For `report_type: "valuation"` the function builds the OS `PropertyFeaturesRequest` from the Hub listing and fetches the printable HTML property report from `GET /api/v1/reports/valuation/property`. The UI can download that HTML report or open it through the browser print/save-to-PDF flow. Successful OS reports are cached for 30 days in `property_report_cache`.

**Request:**  
`body: { listing_id: string, report_type: "valuation" | "neighbourhood" }`

**OS API:**

- Valuation property report: `GET /api/v1/reports/valuation/property` with flattened `PropertyFeaturesRequest` query params (`constructionYear`, `propertyLatitude`, `propertyLongitude`, `propertySquareMeters`, `propertyFloor`, `propertyCategory`, `address`) plus optional `lang`, `since`, `to`.
- Valuation AI narrative: `GET /api/v1/reports/valuation/property/ai` with the same query params.
- Legacy non-valuation fallback: `GET /api/v1/reports/listing/:listingId?type=neighbourhood` or an override path via `MAIPROP_OS_REPORT_PATH`.

**Auth:** Same as other OS functions (`POST /auth/login` → Bearer token).

**Response:**  

- Valuation success: `{ ok: true, report: { kind: "valuation-property-html", html, ai, features, fileName }, source: "os" }` where `fileName` is an `.html` file name.
- Legacy success: `{ ok: true, report: <payload>, source: "os" }` when the OS returns a report.
- `{ ok: true, report: null, source: "os" }` when the OS has no report (e.g. 404).  
- `{ ok: false, error }` on failure.

**Frontend:**  

- `PropertyReportCard` calls `fetch-report-from-os`. If OS returns printable report HTML, the user gets `Download HTML` and browser `Print / Save PDF` actions. If OS has no report, the card enters a disabled "Report unavailable" state.
- Charging is handled server-side by `fetch-report-from-os`: the first user fetch for a cached report generation inserts `usage_property_reports`; repeated fetches by the same user for that cached generation are not charged. Other users who fetch the same cached report are charged once.

---

## 6. `receive-from-os` – Webhook: OS → Hub

**Purpose:** Receive events from OS (listings, leads, profiles) and upsert into Hub.

**Endpoint:**  
`POST https://<supabase-project>.supabase.co/functions/v1/receive-from-os`

**Expected body:**  
`{ event, entity_type, data }`  
- `event`: e.g. `"created"`, `"upsert"`, `"deleted"`.  
- `entity_type`: `"listing"` | `"lead"` | `"consultation"` | `"profile"`.  
- `data`: payload (OS field names; mapped to Hub inside the function).

**Security:** Optional `MAIPROP_OS_WEBHOOK_SECRET`; if set, request must include header `x-os-signature` equal to the secret.

**Behaviour:**
- **listing:** Map OS → Hub listing; insert or update by `os_id:<externalId>` tag; on `deleted` set status `expired`.
- **lead / consultation:** Insert into `consultation_requests`.
- **profile:** Update `profiles` by `userId`.
- All outcomes logged to `sync_log` (`direction: os_to_hub`).

---

## Environment variables (Supabase secrets)

| Variable                   | Used by                    | Purpose |
|---------------------------|----------------------------|---------|
| `MAIPROP_OS_URL`          | All sync functions         | Base URL of OS API (e.g. `https://app.os.maiprop.co:8080`) |
| `MAIPROP_OS_EMAIL`        | full-sync, poll, sync-to-os, sync-firesale | OS login for token |
| `MAIPROP_OS_PASSWORD`     | full-sync, poll, sync-to-os, sync-firesale | OS login for token |
| `MAIPROP_OS_WEBHOOK_SECRET` | receive-from-os         | Validate webhook calls from OS |
| `GOOGLE_MAPS_API_KEY`     | full-sync-from-os, poll-os-auctions | Optional; Street View cover images for auction listings |
| `MAIPROP_OS_REPORT_PATH`  | fetch-report-from-os                | Optional legacy non-valuation report URL override (default: `/api/v1/reports/listing`) |

---

## UI / Admin

- **OSSyncPanel** – **“Full sync (OS → Hub)”** (recommended), “Poll OS Auctions” (single page range), “Sync to OS”, “Sync Firesale → OS”, plus sync log.
- **AdminPanel** – Invokes `full-sync-from-os`, `poll-os-auctions`, and other edge functions; cron suggestions for nightly full sync.

Ensure OS credentials are set in the Supabase project (e.g. Lovable Cloud Secrets or Dashboard) so the functions can authenticate against the [OS API](https://app.os.maiprop.co:8080/swagger-ui/index.html#/).
