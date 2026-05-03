# ADR-002: Cloudflare Pages for Frontend Hosting

**Date:** 2025 (migrated from Netlify)  
**Status:** Accepted  
**Context:** Need a static hosting platform for Vite-built React SPA  

## Decision

Host the frontend on **Cloudflare Pages** with automatic deployments from GitHub.

## Rationale

- Free tier generous for current scale
- Built-in DDoS protection (Cloudflare network)
- Global CDN with edge caching
- Pages Functions for server-side logic (sitemap, middleware)
- Preview deployments per PR (`<branch>.maiprop-listing-site.pages.dev`)
- Custom domain support (`portal.maiprop.co`)

## Consequences

- CSP headers managed in `public/_headers` (Cloudflare-specific format)
- Pages Functions in `functions/` directory (separate from Supabase edge functions)
- Environment variables set via Cloudflare Dashboard or CI (`PATCH /projects/<name>`)
- Build artifacts deployed via `wrangler pages deploy`
- No server-side rendering (SSR) — app is a client-rendered SPA
- Vite env vars (`VITE_*`) are baked into the bundle at build time
