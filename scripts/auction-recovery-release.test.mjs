import { describe, expect, it } from "vitest";
import { mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,readdirSync,rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AUCTION_RECOVERY_MIGRATION,
  validateAuctionRecoverySource,
  validateAuctionRecoveryHistory,
  validateAuctionRecoveryControl,
  verifyAuctionMigration,
} from "./auction-recovery-release.mjs";
import { validateDryRun } from "./catalogue-hotfix-workflow-helpers.mjs";
import { AUCTION_LIVE_BASE, AUCTION_SOURCE_OVERLAYS } from "./prepare-auction-only-source.mjs";

const sha = "a".repeat(40);
const source = () => ({ schema_version: 1, scope: "auction-only-source-preparation", base_sha: AUCTION_LIVE_BASE, source_sha: sha, source_sha256: "b".repeat(64), changed_paths: [...AUCTION_SOURCE_OVERLAYS].sort(), files: [] });
describe("scoped auction release gates", () => {
  it("prepares only the fixed migration and non-executable historical placeholders",()=>{
    const root=mkdtempSync(join(tmpdir(),"auction-database-workspace-"));
    try {
      const artifact=join(root,"artifact"),work=join(root,"database");mkdirSync(join(artifact,"supabase/migrations"),{recursive:true});
      copyFileSync(AUCTION_RECOVERY_MIGRATION.path,join(artifact,AUCTION_RECOVERY_MIGRATION.path));
      const history=[{version:"20260707000000",name:"historical_alias"},{version:"20260801000000",name:"another"}];
      const historyPath=join(root,"history.json");writeFileSync(historyPath,JSON.stringify(history));
      const result=spawnSync(process.execPath,["scripts/auction-recovery-release.mjs","prepare-db",artifact,historyPath,work],{encoding:"utf8",windowsHide:true});expect(result.status,result.stderr).toBe(0);
      const files=readdirSync(join(work,"supabase/migrations"));expect(files).toHaveLength(3);
      for(const row of history)expect(readFileSync(join(work,"supabase/migrations",`${row.version}_remote_history_placeholder.sql`),"utf8")).toMatch(/^-- Existing remote history only; never pending SQL\.\n$/);
      expect(verifyAuctionMigration(work)).toEqual(readFileSync(AUCTION_RECOVERY_MIGRATION.path));
      const contract=JSON.parse(readFileSync(join(work,"contract.json"),"utf8"));
      const remoteHistory=history.map(row=>row.version).join("\n");
      const output=`Would push these migrations:\n • ${AUCTION_RECOVERY_MIGRATION.version}_${AUCTION_RECOVERY_MIGRATION.name}.sql\n`;
      expect(()=>validateDryRun({contract,remoteHistory,output})).not.toThrow();
      expect(()=>validateDryRun({contract,remoteHistory,output:output+" • 20260701000000_unrelated.sql\n"})).toThrow();
      writeFileSync(join(work,AUCTION_RECOVERY_MIGRATION.path),"select 'tampered';");expect(()=>verifyAuctionMigration(work)).toThrow(/digest/);
    } finally {rmSync(root,{recursive:true});}
  });
  it("binds the approved overlay to the exact source", () => {
    expect(validateAuctionRecoverySource(source(), sha).source_sha).toBe(sha);
    expect(() => validateAuctionRecoverySource({ ...source(), base_sha: "c".repeat(40) }, sha)).toThrow(/baseline/);
    expect(() => validateAuctionRecoverySource({ ...source(), source_sha: "c".repeat(40) }, sha)).toThrow(/source/);
    expect(() => validateAuctionRecoverySource({ ...source(), changed_paths: [...AUCTION_SOURCE_OVERLAYS, "src/pages/Pricing.tsx"] }, sha)).toThrow(/overlay/);
  });
  it("allows exactly one new history row and preserves every old record", () => {
    const before = [{ version: "20260707000000", name: "historical_alias", statements_sha256: "old", statement_count: 1 }];
    const added = { version: AUCTION_RECOVERY_MIGRATION.version, name: AUCTION_RECOVERY_MIGRATION.name, statements_sha256: "new", statement_count: 12 };
    expect(validateAuctionRecoveryHistory(before, [...before, added])).toBe(true);
    expect(() => validateAuctionRecoveryHistory(before, [{ ...before[0], name: "repaired" }, added])).toThrow(/history/);
    expect(() => validateAuctionRecoveryHistory(before, [...before, added, { ...added, version: "99999999999999" }])).toThrow(/history/);
    expect(() => validateAuctionRecoveryHistory(before, before)).toThrow(/migration/);
  });
  it("requires successful original main CI and fresh exact control", () => {
    const input = { sha, currentMain: sha, checkout: sha, workflowSha: sha, ref: "refs/heads/main", event: "workflow_dispatch", attempt: "1", actor: "krenios", triggeringActor: "krenios", ci: { conclusion: "success", event: "push", head_branch: "main", head_sha: sha, run_attempt: 1, path: ".github/workflows/ci.yml", actor: { login: "krenios" }, triggering_actor: { login: "krenios" } } };
    expect(validateAuctionRecoveryControl(input)).toBe(true);
    for (const altered of [{ attempt: "2" }, { currentMain: "b".repeat(40) }, { triggeringActor: "another" }, { ci: { ...input.ci, conclusion: "failure" } }]) {
      expect(() => validateAuctionRecoveryControl({ ...input, ...altered })).toThrow();
    }
  });
});
