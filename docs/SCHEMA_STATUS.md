# Schema Status

> Last updated: 2026-04-27

This document inventories all tables created across Supabase migrations and their current usage status. Tables marked **Empty / Unused** are candidates for cleanup once confirmed they have no production data.

## Active Tables (Core Business)

| Table | Purpose | Used By |
|-------|---------|---------|
| `profiles` | User profiles + subscription state | Auth, onboarding, dashboard, RLS |
| `profiles_public` | Public-facing profile view | Property detail, agent cards |
| `listings` | Property listings (102 columns) | Search, filters, detail pages, dashboard |
| `listing_images` | Listing photo gallery | Property detail, cards |
| `listing_reports` | AI property reports | Report page, compare |
| `listing_view_events` | Analytics — page views | Dashboard analytics |
| `favorites` | User saved listings | Dashboard favorites tab |
| `conversations` | Chat threads | Messaging system |
| `messages` | Chat messages | Messaging system |
| `message_attachments` | Chat file uploads | Messaging system |
| `contacts` | CRM contacts | LeadsCRM, admin panel |
| `contact_tasks` | CRM task tracking | CRM pipeline |
| `contact_submissions` | Website contact form | Public contact page |
| `notifications` | In-app notifications | Bell icon, notification panel |
| `saved_searches` | Alert criteria for new listings | Saved search alerts edge function |
| `projects` | New building developments | Developer portal, new builds page |
| `project_units` | Units within a development | Project detail page |
| `project_media` | Development photos/videos | Project gallery |
| `project_leads` | Developer lead capture | Developer CRM |
| `project_views` | Analytics — project page views | Developer dashboard |
| `professionals` | Verified professionals | Professional directory |
| `professional_services` | Service offerings | Professional profile |
| `professional_availability` | Booking calendar | Scheduling system |
| `professional_reviews` | Client reviews | Professional profile |

## Active Tables (Platform)

| Table | Purpose | Used By |
|-------|---------|---------|
| `pricing_configs` | Subscription tier configuration | Pricing page, checkout |
| `investor_subscriptions` | Active subscriptions | Paywall, feature gates |
| `email_send_log` | Email delivery tracking | Process-email-queue |
| `email_send_state` | Email queue state | Process-email-queue |
| `email_unsubscribe_tokens` | Unsubscribe link tokens | Email footer |
| `suppressed_emails` | Bounce/complaint suppression | Email sending guard |
| `sync_log` | OpenStreetMap sync history | Admin sync dashboard |
| `rate_limit_counters` | Edge function rate limiting | Rate limiter utility |
| `role_switch_history` | Audit trail for role changes | Security audit |
| `admin_audit_log` | Admin action audit trail | Security audit |

## Active Tables (Features)

| Table | Purpose | Used By |
|-------|---------|---------|
| `open_house_registrations` | Event RSVPs | Open house flow |
| `open_house_offers` | Offers submitted at open houses | Open house CRM |
| `open_house_settings` | Per-listing open house config | Seller dashboard |
| `auction_alerts` | Auction notification preferences | Auction system |
| `firesale_requests` | Quick sale / firesale deals | Firesale pipeline |
| `firesale_interest` | Investor interest in firesales | Firesale matching |
| `firesale_requests_investor_feed` | Investor-facing firesale view | Investor dashboard |
| `invitation_requests` | Platform invitation queue | Waitlist / invite system |
| `deal_checklists` | Transaction task tracking | Deal management |
| `portfolios` | Investment portfolio tracking | Investor dashboard |
| `leads` | Marketing leads | Admin panel |
| `new_building_leads` | New build specific leads | Developer CRM |
| `consultation_requests` | Professional consultation bookings | Pro services |
| `viewings` | Property viewing appointments | Scheduling system |
| `articles` | Blog / content management | Blog pages |

## Usage Tracking Tables

| Table | Purpose | Used By |
|-------|---------|---------|
| `usage_ai_calls` | AI API call metering | Plan limits |
| `usage_ai_valuations` | AI valuation metering | Plan limits |
| `usage_priority_ads` | Premium ad metering | Plan limits |
| `ai_usage_limits` | Per-plan AI usage caps | Plan enforcement |
| `pro_product_ids` | Stripe product ID mapping | Subscription management |
| `private_owner_ad_alerts` | FSBO ad notifications | Private seller alerts |

## Vestigial / Empty Tables

| Table | Status | Notes |
|-------|--------|-------|
| `user_roles` | **Dropped** | Removed in migration `20260326120000_single_platform_admin.sql`. Role is stored in `profiles.role` column instead. |
| `properties` | **Legacy** | Created in earliest migration with permissive RLS (`USING(true)`). Superseded by `listings` table. Verify if any production data exists before dropping. |

## Schema Notes

- **`listings` has 102 columns** including 30+ `has_*` boolean feature flags. Normalization to a join table is recommended at scale but deferred due to blast radius (every query, filter, and component touches this table).
- **`profiles` is a god-row** combining user info + subscription state + onboarding progress. Splitting subscription state to `user_subscriptions` is planned but deferred due to the number of dependent queries and RLS policies.
- **Generated types** (`src/integrations/supabase/types.ts`) is auto-generated from the DB schema. Currently ~3,278 lines. Do not edit manually — run `supabase gen types typescript` to regenerate.
