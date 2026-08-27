# Release Provenance Evidence

Target: fail-closed release provenance for a private repository on GitHub Free.
This control set is SLSA-aligned, but it does not claim Sigstore-backed SLSA
provenance because private-repository artifact attestations are unavailable on
the repository's current GitHub plan.

## Implemented Controls

| Area | Evidence | Verification |
|---|---|---|
| Source integrity | `.github/CODEOWNERS`, `docs/BRANCH_PROTECTION.md`, pinned GitHub Actions | `npm run check:github-governance` |
| Build reproducibility guard | Node pinned through `.node-version`, `packageManager`, and runtime checks | `npm run check:runtime` |
| Dependency transparency | CycloneDX SBOM generated in CI | `npm sbom --sbom-format cyclonedx` |
| Artifact binding | Main CI records the GitHub artifact ID and digest, hashes every payload file, and signs the repository, exact release SHA, source tree, workflow identity, attempt-one actor tuple, and artifact metadata with a domain-separated HMAC | `npm run check:slsa-readiness`; `scripts/verify-release-artifact-binding.mjs` |
| Staging provenance enforcement | The staging workflow downloads the immutable payload and signed binding, queries the producer run and artifact through the GitHub API, and verifies the HMAC, API metadata, exact `main` SHA, source tree, workflow path, and attempt-one actor before any staging mutation | `npm run check:slsa-readiness`; staging binding artifact |
| Temporary Release A authorization | Each Stripe, Pages, approval, and coordinated deployment proof carries one normalized exact-SHA authorization grant. Only the lowercase reason SHA-256 persists; the plaintext reason is excluded from evidence and summaries. Standard and break-glass grants cannot be mixed. | `scripts/production-break-glass-validation.mjs`; signed attempt-qualified artifacts |
| One-shot mutation consumption | Staging Pages, production Pages, and coordinated production deployment each upload an immutable 7-day action receipt with `overwrite=false`, verify its same-run HMAC binding against the GitHub artifact ID and digest, and reject an existing or duplicate exact-name receipt before mutation. | `scripts/production-break-glass-consumption.mjs`; receipt and `-binding` artifacts |
| Production authorization continuity | Signed database, Edge, Cloudflare, and aggregate payloads contain identical lowercase `authorization_sha256` values and, only in break-glass mode, the same lowercase receipt-payload `consumption_sha256`. Schema-version-3 leases preserve the exact authorization and consumption tuples through every renewal. | `npm run check:slsa-readiness`; provider and aggregate bindings |
| Release safety | Release inventory checks workflow, env, and function drift | `npm run check:release-safety` |

## Verification

Main CI creates the immutable release candidate only after all static gates
pass. Binding creation is mandatory: missing artifact API metadata, a rerun,
an actor substitution, a non-current workflow SHA, a payload change, a wrong
key ID, or an invalid HMAC fails closed. Staging and production independently
re-query GitHub metadata and verify the downloaded payload against the signed
binding before using it.

For coordinated break-glass evidence, readiness validates the complete
production-deploy authorization record with the real central validator,
recomputes its canonical SHA-256, validates the strict eight-field consumption
tuple, and requires the database, Edge, Cloudflare, and aggregate attestations
to use the same mode and exact hashes. Missing, malformed, uppercase, changed,
partial, extra, or mixed fields fail closed. Readiness output may report only
the normalized mode and incident ID; it never reports the reason hash's
plaintext preimage, provider credentials, signing key, user token, or Stripe
restricted key.

The direct Cloudflare recovery aggregate remains the legacy standard evidence
shape. It must not contain break-glass mode, incident, authorization hash,
consumption hash, authorization object, or consumption object. The reusable
Cloudflare boundary accepts its empty standard sentinel for this caller only;
standalone recovery and direct reusable invocation have no break-glass
validator route.

For the one-time Release A incident, record every workflow run ID/attempt plus
each immutable payload artifact ID, GitHub digest, binding artifact ID, and
binding verification. Receipt artifacts and bindings are retained 7 days;
Pages and provider evidence/bindings 30 days; Stripe and final aggregate
evidence/bindings 90 days; approval evidence/bindings 7 days; mutation leases
and bindings 1 day. Retention never authorizes replay. An uploaded receipt
burns its action, a retry requires a new incident and fresh expiry, and reruns
are prohibited.

## External blocker

The signed candidate does not authorize production deployment. Production also
requires a different allowlisted approval actor, an allowlisted deployer, exact
current-`main` selection, successful staging evidence, Stripe live readiness,
short-lived mutation leases, and ordered Supabase database, Edge Function, and
Cloudflare Pages promotion. Repository variables keep production disabled until
those controls are configured and independently verified.

Incident `PERF-BOOTSTRAP-20260826-01` temporarily waives only actor separation
and approval allowlist membership for `krenios` after the exact central
authorization succeeds. It does not waive exact current-`main` identity,
attempt one, actor/triggering-actor equality, deployer membership, signed
provider evidence, release-enabled coordinated gates, immutable source
archival, leases, N-1 checks, ordered health verification, or automatic
rollback. Delete the four temporary break-glass variables after final proof and
return to the ordinary two-person release train.
