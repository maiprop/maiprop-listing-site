# DORA Third-Party Register

| Provider | Service | Data handled | Criticality | Exit plan | Evidence owner |
|---|---|---|---|---|---|
| Supabase | Postgres, Auth, Storage, Edge Functions | User profiles, listings, messages, leads, payments metadata | Critical | `docs/compliance/dora/THIRD_PARTY_EXIT_PLANS.md` | Platform |
| Cloudflare | Pages, CDN, DNS, DDoS, runtime env vars | Public site traffic, deployment metadata, runtime env bindings | Critical | `docs/compliance/dora/THIRD_PARTY_EXIT_PLANS.md` | Platform |
| Stripe | Checkout, subscriptions, customer portal, webhooks | Billing identifiers and payment status; card data remains with Stripe | High | `docs/compliance/dora/THIRD_PARTY_EXIT_PLANS.md` | Payments |
| Sentry | Error and performance telemetry | Error traces, URLs, release metadata, redacted diagnostics | Medium | `docs/compliance/dora/THIRD_PARTY_EXIT_PLANS.md` | Operations |
| OpenAI | AI valuation/report generation | Prompt inputs and generated responses, subject to app minimization controls | Medium | `docs/compliance/dora/THIRD_PARTY_EXIT_PLANS.md` | AI owner |
| Brevo | Transactional email | Email recipients and transactional templates | Medium | `docs/compliance/dora/THIRD_PARTY_EXIT_PLANS.md` | Operations |

Review provider terms, subprocessors, status pages, and incident history at least every 90 days.
