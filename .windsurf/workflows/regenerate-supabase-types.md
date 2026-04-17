---
description: Regenerate Supabase TypeScript types from the live database schema
---

This workflow regenerates `src/integrations/supabase/types.ts` to match the current
Supabase database schema. Run this whenever migrations are applied or schema changes.

## Prerequisites

1. **Supabase CLI** installed: `npm install -g supabase` (or `npx supabase`)
2. **Logged into Supabase**: `supabase login`
3. **Project ID**: `qvvicunqcrwpioqnvzxf` (from supabase/config.toml)

## Steps

### 1. Ensure you are logged in
// turbo
```powershell
npx supabase login
```

### 2. Generate types from the remote (production) DB
// turbo
```powershell
npx supabase gen types typescript --project-id qvvicunqcrwpioqnvzxf --schema public > src/integrations/supabase/types.ts
```

### 3. Alternative: generate from local DB (requires `supabase start`)
```powershell
npx supabase gen types typescript --local --schema public > src/integrations/supabase/types.ts
```

### 4. Verify TypeScript compiles
// turbo
```powershell
npx tsc -p tsconfig.app.json --noEmit
```

### 5. Remove stale `as any` casts
Search for `(supabase.from as any)` and `as unknown as` patterns that may no
longer be needed once the generated types include previously-missing tables:
```powershell
Get-ChildItem src -Recurse -Include *.ts,*.tsx | Select-String "supabase.from as any"
```

### 6. Run tests and lint
// turbo
```powershell
npm run lint; npm test -- --run
```

## Common Issues

- **"Column does not exist"** errors → types.ts is stale; re-run step 2.
- **Auth errors** → run `supabase login` again.
- **Migration drift** → run `supabase db push` first, then regenerate types.

## Schema-to-Code drift detection

Run this periodically (e.g. in CI) to detect when types.ts is out of sync:
```powershell
npx supabase gen types typescript --project-id qvvicunqcrwpioqnvzxf | Compare-Object (Get-Content src/integrations/supabase/types.ts)
```
If there is any diff, types.ts should be regenerated.
