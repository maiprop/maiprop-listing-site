# Standards Control Matrix

This matrix maps the current repo controls to the audit frameworks used for procurement and due diligence. It is intentionally evidence-first: each row must point to a source-controlled artifact, a verification command, and an owner.

| Framework | Control | Evidence | Verification | Owner | Status |
|---|---|---|---|---|---|
| OWASP ASVS 5.0 | Authentication, session, authorization, and deletion controls | `src/contexts/AuthContext.tsx`, `docs/RLS_ACCESS_MATRIX.md`, `e2e/rls-security.spec.ts`, `e2e/onboarding-role-selection.spec.ts`, `e2e/gdpr-delete-account.spec.ts` | `npm run check:live-security-posture`; exact-SHA `staging-live-security` release job with non-skipped minimized evidence in the final attestation | Platform | Implemented; destructive proof is restricted to the allowlisted isolated staging project |
| OWASP ASVS 5.0 | API and Edge Function security | `docs/api/edge-functions.openapi.yaml`, `docs/EDGE_FUNCTION_AUTH_RATIONALE.md`, `docs/public-edge-function-inventory.json` | `npm run check:public-functions`; `npm run check:openapi-coverage` | Platform | Implemented |
| OWASP ASVS 5.0 | Input validation and mutation validation | `src/lib/mutationSchemas.ts`, `src/test/mutationSchemas.test.ts`, schema-first mutation inventory | `npm run check:mutation-validation`; `npm test` | App | Implemented |
| OWASP ASVS 5.0 | Security headers and browser hardening | `public/_headers`, `functions/_middleware.ts`, `docs/WEBHOOK_VERIFICATION.md` | `npm run check:production-deploy -- https://portal.maiprop.co --browser --public-api` | Platform | Implemented; live deploy proof in CI |
| NIST SSDF 1.1 | Prepare the organization and define secure development practices | `.github/CODEOWNERS`, `docs/DEVELOPER_ONBOARDING.md`, `docs/BRANCH_PROTECTION.md` | `npm run check:github-governance` | Platform | Implemented; GitHub API proof depends on plan/permissions |
| NIST SSDF 1.1 | Protect code and build pipeline | `.github/workflows/ci.yml`, `.github/dependabot.yml`, `SECURITY.md` | `npm audit --omit=dev --audit-level=high`; `npm run check:secrets`; CodeQL | Platform | Implemented |
| NIST SSDF 1.1 | Produce well-secured software | `npm sbom --sbom-format cyclonedx`, license gate, pinned workflows | `npm run check:release-safety`; `npm run check:slsa-readiness` | Platform | Implemented |
| NIST SSDF 1.1 | Respond to vulnerabilities | `SECURITY.md`, `docs/incidents/`, `docs/SECRETS_ROTATION.md` | Incident template review; Dependabot/CodeQL runs | Security | Implemented; operational evidence grows per incident |
| CIS Controls v8.1 | Inventory and control of software assets | `package-lock.json`, SBOM artifact, dependency override rationale | `npm run check:dependency-overrides`; CI SBOM upload | Platform | Implemented |
| CIS Controls v8.1 | Secure configuration and access control | `docs/BRANCH_PROTECTION.md`, `.github/CODEOWNERS`, `docs/governance/main-branch-protection.expected.json` | `npm run check:github-governance`; compliance evidence workflow | Platform | Implemented; live API proof can be plan-limited |
| CIS Controls v8.1 | Continuous vulnerability management | Dependabot, CodeQL, npm audit, gitleaks | GitHub Actions CI; `npm audit --omit=dev --audit-level=high` | Security | Implemented |
| CIS Controls v8.1 | Audit log and monitoring | `docs/OBSERVABILITY.md`, Sentry integration, UptimeRobot runbook | Sentry read-only query when `SENTRY_AUTH_TOKEN` is available | Platform | Partially implemented; live Sentry query is token-gated |
| DORA | ICT risk management | `docs/compliance/dora/ICT_RISK_REGISTER.md`, `docs/SLO.md`, `docs/ON_CALL.md` | `npm run check:dora-readiness` | Operations | Implemented as source-controlled evidence pack |
| DORA | Incident classification and reporting | `docs/compliance/dora/INCIDENT_REPORTING_TAXONOMY.md`, `SECURITY.md`, `docs/incidents/` | `npm run check:dora-readiness` | Operations | Implemented; regulator-specific filing is customer/legal dependent |
| DORA | Digital operational resilience testing | `docs/compliance/dora/RESTORE_DRILL_LOG.md`, `docs/compliance/dora/TABLETOP_EXERCISES.md`, `docs/DR_RUNBOOK.md` | `npm run check:dora-readiness`; recorded drill result | Operations | Partially implemented; live restore drills require operator execution |
| DORA | ICT third-party risk | `docs/compliance/dora/THIRD_PARTY_REGISTER.md`, `docs/compliance/dora/THIRD_PARTY_EXIT_PLANS.md`, `docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md` | `npm run check:dora-readiness` | Operations | Implemented; vendor attestations remain external |
| SLSA 1.2 | Source integrity and reviewed changes | GitHub PR process, CODEOWNERS, pinned workflows | `npm run check:github-governance`; CI status checks | Platform | Implemented |
| SLSA 1.2 | Build provenance | `.github/workflows/ci.yml`, `.github/workflows/stage-release.yml`, `docs/compliance/SLSA_PROVENANCE.md` | `npm run check:slsa-readiness`; mandatory GitHub Artifact Attestation verification before staging | Platform | Implemented for immutable release candidates; production remains disabled |
| SLSA 1.2 | Dependency transparency | CI SBOM, dependency override gate, Dependabot | `npm run check:dependency-overrides`; CI SBOM artifact | Platform | Implemented |
| WCAG 2.2 | Keyboard navigation, landmarks, and image names | `e2e/accessibility.spec.ts`, `src/components/Navbar.tsx` | `npm run check:wcag-coverage`; Playwright accessibility tests | Frontend | Implemented |
| WCAG 2.2 | Automated a11y and Lighthouse gates | `.lighthouserc.json`, `docs/LIGHTHOUSE_CI_SETUP.md`, `e2e/accessibility.spec.ts` | `npm run lighthouse`; `npm run check:wcag-coverage` | Frontend | Implemented |
| WCAG 2.2 | Manual assistive-technology pass | `docs/compliance/WCAG_MANUAL_TEST_PLAN.md` | Manual release checklist and screenshots | Frontend | External blocker for full audit-grade proof |

## External Blockers

- Supabase leaked-password protection requires enabling the Supabase Auth feature; the live advisor currently reports `Supabase leaked-password protection` as disabled.
- Branch protection live proof depends on GitHub API access and repository plan capability. The repo keeps expected settings in source control and collects best-effort evidence in CI.
- Sentry live telemetry proof requires a locally configured `SENTRY_AUTH_TOKEN`; tokens must not be pasted into chat.
- Full DORA-grade restore drills and tabletop exercises require operator execution against approved non-production or restored environments.
