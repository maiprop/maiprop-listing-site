# Apps

This directory is the landing zone for future deployable applications.

Current mode is still `single-package`: the production web app remains at the repository root with source in `src/`, public assets in `public/`, Cloudflare Pages Functions in `functions/`, and Supabase Edge Functions in `supabase/functions/`.

Target layout:

- `/apps/web` for the Vite React app once imports, build scripts, Cloudflare Pages settings, Capacitor sync, Playwright, and Lighthouse are migrated together.
- Additional apps only after they have a separate deploy/runtime contract.

Do not move runtime code into this directory without a dedicated migration PR and full deploy-path verification.
