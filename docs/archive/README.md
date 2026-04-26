# Documentation Archive

Historical documents kept for audit trail and reference. **Do not treat anything in this folder as current guidance.**

These files were moved here during the 2026-04 markdown cleanup because they fall into one of three categories:

1. **Dated point-in-time audit reports** — the conclusions reflect the codebase at the date in the file's header, not today.
2. **Completed migration / setup checklists** — the steps have already been executed against the live database (the migrations they reference live in `supabase/migrations/` and have been applied).
3. **Implementation proposals that have shipped** — superseded by the actual implementation in code.

## Contents

### Audits & verifications (point-in-time snapshots)

| File | Date | Topic |
|---|---|---|
| `ADMIN_ACCESS_VERIFICATION.md` | 2025-03-12 | Admin role access verification |
| `COMPREHENSIVE_AUDIT_REPORT_2026-04-17.md` | 2026-04-17 | Full repo audit (B+ grade) |
| `COMPREHENSIVE_AUDIT_REPORT_2026-04-17_COMPARISON.md` | 2026-04-17 | Reaudit comparison (A- grade) |
| `ISSUE_TYPE_AUDIT_REPORT_2026-04-15.md` | 2026-04-15 | Lint / TS / dep issue inventory |
| `PORTAL_AUDIT_REPORT.md` | 2026-03 | portal.maiprop.co audit |
| `REAUDIT_VERIFICATION.md` | 2025-03-17 | Verification of audit fixes |
| `SECURITY_AUDIT.md` | 2026-03 | Full-stack security audit |
| `SECURITY_AUDIT_2024.md` | 2024-04 | sync_log fake-entry fix |
| `SECURITY_REPORT.md` | 2026-03-18 | Auth / RLS / secrets scan |
| `UX_AUDIT_REPORT.md` | 2025-03-12 | UX audit (auth, listings, etc.) |
| `UX_AUDIT_ROLES_AND_MODULES.md` | — | UX audit of roles & modules |
| `project_audit_2026-04-06.md` | 2026-04-06 | Open-issue inventory (39 issues) |

### Completed setup / migration instructions

| File | Status |
|---|---|
| `COPY_PASTE_INSTRUCTIONS.md` | Migration `20260319` / `20260320` already applied |
| `LOVABLE_ONLY_INSTRUCTIONS.md` | Same migrations — already applied |
| `MARKETING_FILES_TO_REMOVE.md` | Cleanup completed (see commit history) |
| `SECURE_ALL_DATA.md` | Pre-deployment checklist — completed |
| `SECURITY_REMEDIATIONS.md` | Migration references — already applied |

### Proposals that shipped

| File | Implemented as |
|---|---|
| `UX_USER_TYPES_PROPOSAL.md` | Current participant flow in `src/lib/participantConfig.ts` + `Onboarding.tsx` |

## Active documentation

For current guidance, see:

- `../../README.md` — entry point
- `../PLATFORM_REFERENCE.md` — canonical roles, pricing, routes
- `../QA_CHECKLIST.md` — release smoke checklist
- `../UNDEVELOPED_FEATURES.md` — live gap list (plan limits not yet enforced)
- `../security-audit.md` — current security status dashboard
