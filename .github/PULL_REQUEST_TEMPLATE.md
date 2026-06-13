## Summary

Describe the change and the user, operator, or developer impact.

## Risk Level

- [ ] Low
- [ ] Medium
- [ ] High

## Verification

- [ ] `npm run check:runtime`
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run check:public-functions`
- [ ] `npm run check:enterprise-readiness-basics`
- [ ] Relevant E2E, Deno, or manual flow tested when applicable

## Security / RLS Impact

- [ ] No auth, authorization, RLS, storage, or secret-handling change
- [ ] RLS reviewed for select/insert/update/delete behavior
- [ ] Public Edge Function exposure reviewed
- [ ] Secrets and environment variables reviewed
- [ ] Audit logging impact reviewed

## Deployment / Rollback

- [ ] No migration or infrastructure change
- [ ] Migration reviewed for idempotency and lock risk
- [ ] Rollback path documented
- [ ] Production/staging environment impact documented

## Notes

Add screenshots, logs, links, or rollout notes here when useful.
