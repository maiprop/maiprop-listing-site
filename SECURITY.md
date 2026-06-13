# Security Policy

## Supported Versions

Security fixes are prioritized for the production `main` branch and the latest
deployed release of MaiProp.

## Reporting a Vulnerability

Report suspected vulnerabilities privately to `security@maiprop.co`.

Include:

- affected URL, function, table, or workflow
- steps to reproduce
- expected and observed behavior
- potential impact
- whether any tenant, user, billing, or private document data may be exposed

Do not publicly disclose the vulnerability before the MaiProp team has had a
reasonable opportunity to investigate and remediate it.

## Response Target

The response target is:

- initial acknowledgement within 2 business days
- severity triage within 5 business days
- remediation plan for confirmed high-risk issues within 10 business days

Critical reports involving service role exposure, tenant escape, privilege
escalation, payment manipulation, or public sensitive files should be escalated
immediately by the on-call/platform owner.

## Scope

In scope:

- React frontend
- Cloudflare Pages and Pages Functions
- Supabase Edge Functions
- Supabase Auth, Storage, RLS, and database policies
- GitHub Actions workflows and deployment controls

Out of scope:

- social engineering
- denial-of-service testing without written approval
- destructive testing against production
- reports requiring access to accounts or data not owned by the reporter

## Safe Harbor

Good-faith testing that avoids privacy violations, data destruction, service
disruption, and public disclosure will be treated as authorized security
research.
