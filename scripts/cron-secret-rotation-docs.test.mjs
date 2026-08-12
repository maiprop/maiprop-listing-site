import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const docs = readFileSync(
  resolve(process.cwd(), "docs", "SECRETS_ROTATION.md"),
  "utf8",
);

describe("CRON_SECRET rotation documentation", () => {
  it("keeps every Vault-backed ECAS worker in the synchronized rotation set", () => {
    for (const worker of [
      "send-saved-search-alerts",
      "poll-os-auctions",
      "scheduled-followups",
      "process-storage-cleanup",
      "reconcile-role-switch-billing",
    ]) {
      expect(docs, worker).toContain(worker);
    }
    expect(docs).toContain("Supabase Vault");
    expect(docs).toContain("staging and production");
    expect(docs).toContain("x-cron-secret");
    expect(docs).toContain("Do not rotate only one copy");
  });

  it("uses independent environment credentials and supported cron controls", () => {
    expect(docs).toContain("$stagingNew");
    expect(docs).toContain("$productionNew");
    expect(docs).toContain("cron.alter_job");
    expect(docs).toContain("vault.update_secret");
    expect(docs).not.toContain("foreach ($ref");
    expect(docs).not.toContain("UPDATE cron.job");
    expect(docs).not.toContain("supabase functions deploy send-saved-search-alerts");
  });

  it("documents the exact header contract for every consumer", () => {
    for (const worker of ["send-saved-search-alerts", "poll-os-auctions"]) {
      expect(docs).toMatch(
        new RegExp(`${worker}[^\\n]*Authorization: Bearer`, "i"),
      );
    }
    for (const worker of [
      "scheduled-followups",
      "process-storage-cleanup",
      "reconcile-role-switch-billing",
    ]) {
      expect(docs).toMatch(new RegExp(`${worker}[^\\n]*x-cron-secret`, "i"));
    }
  });
});
