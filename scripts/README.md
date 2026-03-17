# Seed Scripts

## Mock Users (All Types)

Creates **21 accounts** – 3 of each participant type – with cross-type interactions to test end-to-end flows.

### Types

| Type | Role | Count | Indices |
|------|------|-------|---------|
| Buyer | individual | 3 | 0–2 |
| Seller | seller_landlord | 3 | 3–5 |
| Investor | investor | 3 | 6–8 |
| Agent | agent | 3 | 9–11 |
| Institutional | institutional | 3 | 12–14 |
| Developer | developer | 3 | 15–17 |
| Professional | professional | 3 | 18–20 |

### Interactions

- **Listings**: agents (3), sellers (2), developer (1) – sale + rent
- **Messages**: buyer↔agent, buyer↔seller, investor↔agent, institutional↔agent, investor↔agent
- **Viewings**: buyers/investors/institutional request viewings on agent/seller listings
- **Favorites**: buyers, investors, institutional save listings
- **Contacts (CRM)**: agents have contacts from buyer/investor inquiries
- **Professionals**: 3 in directory (architect, lawyer, valuer)
- **Consultation requests**: buyers/investors request from professionals

### Prerequisites

- Supabase project with migrations applied
- **Service role key** from Supabase Dashboard → Project Settings → API → `service_role`

### Run

```bash
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run seed:users
```

### Login

All accounts use password: **`Demo2025!`**
