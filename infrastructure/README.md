# Infrastructure

This directory is the landing zone for infrastructure-as-code and runtime platform configuration.

Current mode is still root-oriented:

- Cloudflare Pages uses `wrangler.toml`, `public/_headers`, `public/_redirects`, and `functions/`.
- Supabase remains in `/supabase` because migrations and Edge Function deploy tooling expect that path.
- Capacitor and Android packaging remain in `/android`, `/capacitor-fallback`, and `capacitor.config.ts`.

Target infrastructure boundaries:

- `/infrastructure/cloudflare` for future Cloudflare Pages, Workers, headers, redirects, and WAF evidence.
- `/infrastructure/capacitor` for future native shell/build packaging evidence.

Do not move Cloudflare or native packaging files without proving local build, preview deploy, and rollback paths still work.
