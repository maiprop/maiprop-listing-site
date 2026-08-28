import assert from "node:assert/strict";
import test from "node:test";
import { validateDryRun, validateTarget } from "./catalogue-hotfix-workflow-helpers.mjs";

const ref = "xsiehskfgeoqyazcgauv";
const valid = {
  kind: "staging",
  ref,
  apiUrl: `https://${ref}.supabase.co/`,
  databaseUrl: `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
  key: "sb_publishable_safe_key",
};

test("catalogue hotfix target validator requires exact Supabase identities", () => {
  assert.doesNotThrow(() => validateTarget(valid));
  assert.throws(() => validateTarget({ ...valid, apiUrl: `https://user@${ref}.supabase.co/` }));
  assert.throws(() => validateTarget({ ...valid, databaseUrl: `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres?sslmode=disable` }));
  assert.throws(() => validateTarget({ ...valid, key: "sb_secret_not_allowed" }));
  assert.throws(() => validateTarget({ ...valid, ref: "qvvicunqcrwpioqnvzxf" }));
});

test("dry-run proof requires the exact approved missing set", () => {
  const contract = { hotfix: { migrations: [{ version: "20260728123058" }, { version: "20260729120405" }] } };
  assert.deepEqual(validateDryRun({ contract, remoteHistory: "20260728123058\n", output: "Would push 20260729120405 migration" }).pending_versions, ["20260729120405"]);
  assert.throws(() => validateDryRun({ contract, remoteHistory: "", output: "" }));
  assert.throws(() => validateDryRun({ contract, remoteHistory: "", output: "Would push 20260728123058" }));
});
