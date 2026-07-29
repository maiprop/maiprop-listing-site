# SLSA Provenance Evidence

Target: SLSA 1.2 practical readiness for a GitHub Actions and Cloudflare Pages deployment pipeline.

## Implemented Controls

| Area | Evidence | Verification |
|---|---|---|
| Source integrity | `.github/CODEOWNERS`, `docs/BRANCH_PROTECTION.md`, pinned GitHub Actions | `npm run check:github-governance` |
| Build reproducibility guard | Node pinned through `.node-version`, `packageManager`, and runtime checks | `npm run check:runtime` |
| Dependency transparency | CycloneDX SBOM generated in CI | `npm sbom --sbom-format cyclonedx` |
| Artifact Attestations | Main CI verifies `release-candidate/release-manifest.json` and signs that manifest with GitHub's Sigstore-backed `actions/attest-build-provenance` action pinned by commit SHA | `npm run check:slsa-readiness` |
| Staging provenance enforcement | The staging workflow uses `gh attestation verify` with the repository, signer workflow, source SHA, `main` ref, and GitHub-hosted-runner policy before any staging mutation | `npm run check:slsa-readiness`; staging provenance evidence artifact |
| Release safety | Release inventory checks workflow, env, and function drift | `npm run check:release-safety` |

## Verification

Main CI creates the immutable release candidate only after all static gates
pass. Provenance creation is mandatory: if GitHub cannot issue or store the
attestation, the candidate gate fails and staging does not run. Staging
re-verifies the downloaded manifest against GitHub's signed attestation before
using the artifact.

## External blocker

The signed candidate does not authorize production deployment. Independent
production approval, protected environment controls, and exact artifact
promotion are still required; production remains disabled until those controls
are separately implemented and reviewed.
