# Live Evidence Fail-Closed Policy

The Standards Evidence workflow treats missing live-security credentials as a
failed control. It does not replace a missing Supabase, Sentry, or Cloudflare
credential with an "unverifiable" artifact.

GitHub branch protection is an exception only when the API returns a documented
private-repository plan limitation. The captured JSON preserves the HTTP 403
and provider message, then records the outcomes of these compensating controls:

- the source-controlled main-branch policy check;
- the repository governance and SHA-pinned workflow gate.

Any other GitHub API failure, a missing credential, a failed compensating
control, malformed Sentry response, or incomplete Cloudflare Pages project
record fails the strict evidence rollup.
