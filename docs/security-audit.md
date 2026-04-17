# Security Audit Status

_Last updated: 2026-04-16_

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0     | ✅     |
| High     | 0     | ✅     |
| Moderate | 2     | ⚠️ dev-only, deferred |
| Low      | 0     | ✅     |

## Production impact

**None.** All remaining vulnerabilities are in `devDependencies` that are not
shipped with the production build.

## Remaining vulnerabilities

### 1. `esbuild ≤ 0.24.2` (moderate) → via `vite@5`

- Advisory: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
- **Impact**: Dev-server only — any website visited in the same browser can
  send requests to the Vite dev server and read responses.
- **Resolution**: Upgrade to `vite@8` (breaking change). Deferred until a
  dedicated migration PR.
- **Mitigation**:
  - Do **not** run `npm run dev` while browsing untrusted sites on the same origin.
  - Use `host: 127.0.0.1` (already default) to avoid LAN exposure.
  - Production builds (`vite build`) are not affected.

## Fixed since last audit

- ✅ `@tootallnate/once < 3.0.1` — resolved by upgrading `jsdom` (dev-only).
- ✅ `http-proxy-agent` — resolved via `jsdom` upgrade.
- ✅ `jsdom 16–22` — upgraded to latest major.

## Audit commands

```powershell
# Full report
npm audit

# Production deps only (the only thing that matters for deployed code)
npm audit --omit=dev

# Moderate+ threshold for CI
npm audit --audit-level=moderate
```

## CI recommendation

Fail CI only on production-dep vulnerabilities:
```yaml
- run: npm audit --omit=dev --audit-level=high
```
