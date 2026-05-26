# 2026-05-26 Cloudflare API token exposure

## Status

Open until the exposed Cloudflare API token is revoked, the GitHub Actions
`CLOUDFLARE_API_TOKEN` secret is replaced, and a Cloudflare Pages deployment
is verified with the replacement token.

## Summary

A Cloudflare API token was pasted into the Codex chat during deployment audit
work on 2026-05-26. Treat the token as compromised. The token value is not
recorded in this repository.

## Scope

- Potentially affected surface: Cloudflare Pages deployment automation for the
  maiProp Cloudflare account/project, depending on the token's actual scopes.
- Known repository exposure: none. The token was not added to tracked files.
- Known command exposure: none in this branch's committed scripts or docs.

## Required remediation

1. Create a replacement Cloudflare API token with the minimum Pages deployment
   scope needed by GitHub Actions.
2. Replace the GitHub repository secret `CLOUDFLARE_API_TOKEN`.
3. Run a Cloudflare Pages deploy or preview deploy with the new secret.
4. Revoke the exposed token in Cloudflare.
5. Review Cloudflare Audit Logs for the exposure window.
6. Add a completed rotation row to `docs/SECRETS_ROTATION.md`.

## Verification

- `npm run check:secrets`
- `npm run check:production-deploy -- https://portal.maiprop.co --public-api`
- GitHub Actions Cloudflare Pages deploy succeeds with the replacement token.

## Lessons

- Never paste live provider tokens into chat or terminal output.
- Prefer short-lived, least-privilege deployment tokens and rotate immediately
  after any suspected exposure.
