# Secrets Rotation Policy

## Rotation cadence

| Secret | Location | Cadence | Owner |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard + Netlify env + local `.env` | **90 days** or on suspected compromise | Platform lead |
| `STRIPE_SECRET_KEY` (live) | Supabase edge functions secrets | **180 days** or on suspected compromise | Finance lead |
| `STRIPE_WEBHOOK_SECRET` | Supabase edge functions secrets | On every Stripe webhook endpoint recreate | Platform lead |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Netlify env (public) | Only if project rotated | Platform lead |
| `SUPABASE_DB_PASSWORD` | Supabase dashboard | **90 days** | Platform lead |
| `LHCI_GITHUB_APP_TOKEN` | GH repo secrets | **365 days** | CI owner |
| `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | GH repo secrets | On demo-account password change | CI owner |
| OpenAI / Anthropic keys | Supabase edge functions secrets | **90 days** | AI lead |
| Mapbox token | Netlify env | **365 days** | Platform lead |

## Rotation log

Record each rotation here. Entries are append-only.

| Date (UTC) | Secret | Rotated by | Reason |
|---|---|---|---|
| _none yet_ | | | |

## Procedure

1. Generate new secret in the upstream provider (Supabase / Stripe / etc.).
2. Update the secret in **all** consumer locations (Netlify, Supabase edge fn secrets, local `.env.example` if the key name changed).
3. Redeploy the affected surface (Netlify build, `supabase functions deploy`).
4. **Verify** the old secret is revoked upstream. For Stripe: dashboard → API keys → roll. For Supabase service role: regenerate in Settings → API.
5. Append a row to the log above in the same commit as the config change.

## Incident response (suspected leak)

1. Immediately roll the affected secret in the upstream provider.
2. Run `trufflehog git file://. --since-commit <N-months-ago>` locally to look for the committed secret in history.
3. If found in history, do a BFG repo-wide rewrite + force-push and notify all collaborators to re-clone.
4. Audit relevant logs (Stripe dashboard, Supabase logs) for unauthorised calls during the exposure window.
5. File an incident record under `docs/incidents/YYYY-MM-DD-<slug>.md`.

## Automated scanning

- GitHub → Settings → Code security → enable **Secret scanning** and **Push protection** for this repo.
- Dependabot is already enabled (`.github/dependabot.yml`).
