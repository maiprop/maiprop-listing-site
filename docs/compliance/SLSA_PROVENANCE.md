# SLSA Provenance Evidence

Target: SLSA 1.2 practical readiness for a GitHub Actions and Cloudflare Pages deployment pipeline.

## Implemented Controls

| Area | Evidence | Verification |
|---|---|---|
| Source integrity | `.github/CODEOWNERS`, `docs/BRANCH_PROTECTION.md`, pinned GitHub Actions | `npm run check:github-governance` |
| Build reproducibility guard | Node pinned through `.node-version`, `packageManager`, and runtime checks | `npm run check:runtime` |
| Dependency transparency | CycloneDX SBOM generated in CI | `npm sbom --sbom-format cyclonedx` |
| Artifact Attestations | Production deploy workflow packs `dist` and `sbom.cdx.json` into `maiprop-production-dist.tgz` and attempts a GitHub Artifact Attestation when the repository plan supports it | `npm run check:slsa-readiness` |
| Release safety | Release inventory checks workflow, env, and function drift | `npm run check:release-safety` |

## Verification

Production deploys on `main` generate a packaged production build and SBOM before deployment. GitHub Artifact Attestation upload is best-effort because private repositories require organization/repository support for attestation storage. If GitHub rejects attestation storage, the deploy emits a workflow warning and continues with the generated SBOM/package evidence.

## External blocker

This repository can produce build provenance and SBOM evidence, but organization-level SLSA guarantees still depend on GitHub branch protection, environment approvals, and repository security settings being enabled in GitHub.
