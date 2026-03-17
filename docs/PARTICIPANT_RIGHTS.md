# Participant rights & access control

## Platform admin (single admin)

- **Only one** platform admin exists at any time.
- **Only** the current platform admin can grant admin to another user (via Admin Dashboard → Subscribers tab → Transfer admin).
- Granting admin **transfers** rights: the current admin loses access, the new user gains it.
- Admin capabilities: firesale pipeline, subscriber management, pricing configs, OS sync, view all profiles, grant admin.
- **Platform admin has access to all** dashboards and modules (Investor Dashboard, CRM, etc.).
- **Admin features live only at `/admin`.**

## Participant types & fixed rights

Each participant type has **fixed, non-upgradable** rights. Users cannot escalate their own rights by switching participant type. **Switching participant type** (Settings → Switch Participant Type) changes dashboard layout and feature visibility, but does **not** grant admin; only `role='admin'` does.

| Participant   | DB role          | Rights |
|---------------|------------------|--------|
| **buyer**     | individual       | Browse listings, save, viewings, auction alerts, Quick Sale application tracking |
| **seller**    | seller_landlord  | Create & manage own listings, viewings |
| **investor**  | investor         | Same as buyer + Quick Sale dashboard (deal flow, saved searches, auctions) |
| **agent**     | agent            | Listings, analytics, contacts, projects, portfolios — no admin |
| **developer** | developer        | Listings, analytics, contacts, projects, portfolios — no admin |
| **institutional** | institutional | Same as buyer + Quick Sale dashboard; can also list properties, CRM |
| **professional** | professional   | Professional directory, services, leads, **CRM/contacts**, messages |

## Role escalation rules

- Users **can** self-assign `agent`, `investor`, `institutional`, `developer` via onboarding. **Pricing is always adjusted** — after selection, users are redirected to the Pricing page to choose their plan.
- Users **cannot** set their own `role` to `professional` (platform admin only; requires pro verification).
- Users **can** upgrade to `seller_landlord` via onboarding; charges apply per plan.
- **Switch Participant Type** (Settings): Changes how the dashboard is organised; does not grant admin. After switching, users are redirected to Pricing to adjust their plan.

## Dashboard nav by type

- **buyer**: Overview (with Quick Sale application tracking), Saved, Saved Searches, Messages, Viewings, Auctions, Open Houses, Profile, Settings
- **investor**: Same as buyer + Deal Flow (Quick Sale dashboard)
- **institutional**: Same as buyer + Deal Flow + Listings, Analytics, Leads, Contacts (buy-side + sell-side)
- **seller**: Overview, Listings, Saved, Messages, Viewings, Open Houses, Profile, Settings
- **agent**: Overview, Listings, Analytics, Saved, Saved Searches, Messages, Viewings, Auctions, Leads, Contacts, Profile, Settings
- **developer**: Same as agent but no Auctions
- **professional**: Overview, Services, Booking, Leads, **Contacts** (CRM), Analytics, Messages, Viewings, Profile, Settings
- **admin**: Access to all above; full visibility across platform

## Admin access

- **Admin Dashboard** at `/admin`: Firesale pipeline, Subscribers, Pricing, OS sync. Accessible only when `role = 'admin'`.
- **Platform admin has access to all** routes and dashboards (Investor Dashboard, all participant views).
- Navbar dropdown shows "Admin" badge and link when `role = 'admin'`.
