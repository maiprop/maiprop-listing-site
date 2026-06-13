# Enterprise Readiness Quick Wins

This checklist tracks the low-effort ECAS remediations that can be completed
before the larger organization-tenancy and service-boundary refactors.

## Runtime Alignment

Required runtime:

- Node `20.19.5`
- npm `10.8.2`

Verification:

```powershell
npm run check:runtime
```

Use `nvm use`, Volta, or the project Dockerfile before running local checks.
On this Windows workstation, Scoop also has a compatible Node 20 install:

```powershell
$env:PATH='C:\Users\K R\scoop\apps\nodejs20\current;' + $env:PATH
npm run check:runtime
```

## Public Edge Function Inventory

Public `verify_jwt = false` functions must stay classified, sourced, and tested.

Verification:

```powershell
npm run inventory:public-functions
npm run check:public-functions
```

## Supabase Leaked-Password Protection

Supabase Auth leaked-password protection is a platform setting. Enable it in the
Supabase dashboard on a plan that supports it, then rerun the Security Advisor.

Current status, checked 2026-06-13: the live Supabase Security Advisor still
reports `auth_leaked_password_protection` as a WARN for project
`qvvicunqcrwpioqnvzxf`. This remains blocked on the platform plan/dashboard
setting.

Acceptance:

- `auth_leaked_password_protection` no longer appears as a Security Advisor WARN
- signup and password-reset flows still pass smoke testing

## Sentry Telemetry Verification

Live telemetry is unknown until a read-only Sentry audit token is available.

Current status, checked 2026-06-13: the local shell does not have
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, or `SENTRY_PROJECT`, so production Sentry
event delivery cannot be queried from this workstation.

Verification contract:

- Cloudflare build has `VITE_SENTRY_DSN`
- Supabase Edge Function secrets include `SENTRY_DSN`
- local operator shell has `SENTRY_AUTH_TOKEN`
- frontend and edge test events are visible in Sentry

Do not commit Sentry auth tokens or expose them through browser-visible
`VITE_*` variables.

## Governance Docs

The repo must include:

- `.github/PULL_REQUEST_TEMPLATE.md`
- `SECURITY.md`

Verification:

```powershell
npm run check:enterprise-readiness-basics
```
