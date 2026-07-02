import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("demo admin safety", () => {
  it("keeps the shared-password demo admin behind an explicit seed opt-in", () => {
    const seedScript = readFileSync(resolve(root, "scripts/seed-demo-accounts.ts"), "utf8");

    expect(seedScript).toContain('const INCLUDE_DEMO_ADMIN = process.env.INCLUDE_DEMO_ADMIN === "yes";');
    expect(seedScript).toContain("const BASE_ACCOUNTS: AccountDef[] = [");
    expect(seedScript).toContain("const DEMO_ADMIN_ACCOUNT: AccountDef = {");
    expect(seedScript).toContain("const ACCOUNTS: AccountDef[] = INCLUDE_DEMO_ADMIN");
    expect(seedScript).toContain("? [...BASE_ACCOUNTS, DEMO_ADMIN_ACCOUNT]");
  });

  it("repairs stale seeded demo auth users instead of leaving old passwords in place", () => {
    const seedScript = readFileSync(resolve(root, "scripts/seed-demo-accounts.ts"), "utf8");

    expect(seedScript).toContain("supabase.auth.admin.updateUserById(existingId");
    expect(seedScript).toContain("password: PASSWORD");
    expect(seedScript).toContain("email_confirm: true");
  });

  it("does not run live role-matrix admin checks from the public demo fallback", () => {
    const matrixSpec = readFileSync(resolve(root, "e2e/live-role-tier-matrix.spec.ts"), "utf8");
    const accountsHelper = readFileSync(resolve(root, "e2e/helpers/demoAccounts.ts"), "utf8");
    const supervisorNetwork = readFileSync(resolve(root, "e2e/live-supervisor-agent-network.spec.ts"), "utf8");

    expect(accountsHelper).toContain('admin: account("", "E2E_ADMIN_EMAIL")');
    expect(matrixSpec).toContain('process.env.E2E_ADMIN_SMOKE_ENABLED === "true"');
    expect(matrixSpec).toContain('account.label !== "admin" || includeAdminAccount');
    expect(supervisorNetwork).toContain('process.env.INCLUDE_DEMO_ADMIN === "yes"');
  });
});
