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
| Release safety | Release inventory checks workflow, env, and function drift | `npm run check:release-safety` |

## Verification

Main CI creates the immutable release candidate only after all static gates
pass. Binding creation is mandatory: missing artifact API metadata, a rerun,
an actor substitution, a non-current workflow SHA, a payload change, a wrong
key ID, or an invalid HMAC fails closed. Staging and production independently
re-query GitHub metadata and verify the downloaded payload against the signed
binding before using it.

## External blocker

The signed candidate does not authorize production deployment. Production also
requires a different allowlisted approval actor, an allowlisted deployer, exact
current-`main` selection, successful staging evidence, Stripe live readiness,
short-lived mutation leases, and ordered Supabase database, Edge Function, and
Cloudflare Pages promotion. Repository variables keep production disabled until
those controls are configured and independently verified.
