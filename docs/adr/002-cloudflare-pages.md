# ADR-002: Cloudflare Pages for Frontend Hosting

**Date:** 2025 (migrated from Netlify)  
**Status:** Accepted  
**Context:** Need a static hosting platform for Vite-built React SPA  

## Decision

Host the frontend on **Cloudflare Pages** using immutable artifacts deployed by
the reviewed release train. Cloudflare Git production and preview automatic
deployments are disabled and API-attested for both staging and production.
Production mutation remains hard-disabled.

## Rationale

- Free tier generous for current scale
- Built-in DDoS protection (Cloudflare network)
- Global CDN with edge caching
- Pages Functions for server-side logic (sitemap, middleware)
- Immutable deployment URLs for exact staging candidates
- Custom domain support (`portal.maiprop.co`)

## Consequences

- CSP headers managed in `public/_headers` (Cloudflare-specific format)
- Pages Functions in `functions/` directory (separate from Supabase edge functions)
- Environment variables set via Cloudflare Dashboard or CI (`PATCH /projects/<name>`)
- Build artifacts deployed via `wrangler pages deploy`
- Source-controlled `wrangler.toml` contains no environment-specific `[vars]`
- No server-side rendering (SSR) — app is a client-rendered SPA
- Vite env vars (`VITE_*`) are baked into the bundle at build time

## DNS Authority

The accepted current mode is **registrar-authoritative DNS**. The domain's
authoritative nameservers remain at the registrar, while `portal.maiprop.co`
points to Cloudflare Pages. The Cloudflare zone may therefore remain
`initializing`; this is intentional and is not evidence of active Cloudflare
zone security controls.

In this mode:

- Cloudflare Pages deployment, CDN delivery, managed HTTPS, and the custom
  `portal.maiprop.co` domain remain in use.
- Cloudflare zone-level WAF, Bot Management, and authoritative DNS controls are
  not claimed as active.
- Mail, DKIM, SPF, apex, and `www` records remain under registrar DNS ownership.
- A nameserver migration requires the separate runbook in
  `docs/operations/CLOUDFLARE_DNS_POSTURE.md`; it must not be performed as a
  side effect of an application deployment.
