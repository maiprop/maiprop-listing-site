# SLSA Provenance Evidence

Target: SLSA 1.2 practical readiness for a GitHub Actions and Cloudflare Pages deployment pipeline.

## Implemented Controls

| Area | Evidence | Verification |
|---|---|---|
| Source integrity | `.github/CODEOWNERS`, `docs/BRANCH_PROTECTION.md`, pinned GitHub Actions | `npm run check:github-governance` |
| Build reproducibility guard | Node pinned through `.node-version`, `packageManager`, and runtime checks | `npm run check:runtime` |
| Dependency transparency | CycloneDX SBOM generated in CI | `npm sbom --sbom-format cyclonedx` |
| Artifact Attestations | Production deploy workflow packs `dist` and `sbom.cdx.json` into `maiprop-production-dist.tgz` and attests it | `npm run check:slsa-readiness` |
| Release safety | Release inventory checks workflow, env, and function drift | `npm run check:release-safety` |

## Verification

Production deploys on `main` should create a GitHub Artifact Attestation for the packaged production build. A release reviewer can verify the attestation from GitHub's release/deployment evidence and compare it to the commit SHA deployed by Cloudflare Pages.

## External blocker

This repository can produce build provenance and SBOM evidence, but organization-level SLSA guarantees still depend on GitHub branch protection, environment approvals, and repository security settings being enabled in GitHub.
