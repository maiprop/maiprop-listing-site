# Packages

This directory is the landing zone for future shared packages.

Current mode is still `single-package`; shared code stays in `src/` until a package is extracted with tests, import codemods, package ownership, and CI build changes in the same migration.

Target package boundaries:

- `/packages/domain` for business rules, domain types, validation schemas, and calculations.
- `/packages/ui` for shared design-system components currently concentrated under `src/components/ui`.
- `/packages/data-access` for Supabase query adapters, React Query hooks, and API clients.
- `/packages/config` for shared runtime/config validation when multiple apps need it.
- `/packages/testing` for shared test fixtures and harnesses once multiple packages consume them.

Do not add a new package without a package owner, public API, test command, and dependency boundary documented in `docs/governance/repository-boundaries.json`.
