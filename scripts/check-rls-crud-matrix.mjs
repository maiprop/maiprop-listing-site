#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  assertRlsCrudMatrix,
  buildRlsCrudMatrix,
} from "./rls-crud-matrix.mjs";

const args = process.argv.slice(2);
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.RELEASE_SAFETY_SUPABASE_PROJECT_REF ||
  process.env.STAGING_SUPABASE_PROJECT_ID ||
  process.env.VITE_SUPABASE_PROJECT_ID;
const apiBase = process.env.SUPABASE_MANAGEMENT_API_BASE || "https://api.supabase.com/v1";

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function fail(message) {
  console.error(`[rls-crud-matrix] ${message}`);
  process.exit(1);
}

function warnAndExit(message) {
  console.warn(`[rls-crud-matrix] ${message}`);
  process.exit(0);
}

const query = `
WITH public_tables AS (
  SELECT
    n.nspname AS schemaname,
    c.relname AS tablename,
    c.relrowsecurity AS rowsecurity,
    c.relforcerowsecurity AS forcerowsecurity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
),
public_policies AS (
  SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    permissive,
    roles,
    qual,
    with_check
  FROM pg_policies
  WHERE schemaname = 'public'
),
browser_table_grants AS (
  SELECT
    table_schema,
    table_name,
    grantee,
    privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')
)
SELECT jsonb_build_object(
  'tables', COALESCE((SELECT jsonb_agg(to_jsonb(public_tables) ORDER BY tablename) FROM public_tables), '[]'::jsonb),
  'policies', COALESCE((SELECT jsonb_agg(to_jsonb(public_policies) ORDER BY tablename, policyname) FROM public_policies), '[]'::jsonb),
  'grants', COALESCE((SELECT jsonb_agg(to_jsonb(browser_table_grants) ORDER BY table_name, grantee, privilege_type) FROM browser_table_grants), '[]'::jsonb)
) AS metadata;
`;

function parseManagementRows(text) {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  return [];
}

async function captureLiveMatrix() {
  if (!accessToken) fail("Missing SUPABASE_ACCESS_TOKEN. Use --input <matrix.json> for offline validation.");
  if (!projectRef) fail("Missing Supabase project ref.");

  const res = await fetch(`${apiBase}/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) {
    fail(`Supabase Management API returned ${res.status}: ${text.slice(0, 500)}`);
  }

  const [row] = parseManagementRows(text);
  const metadata = row?.metadata ?? row?.jsonb_build_object ?? row;
  return buildRlsCrudMatrix(metadata);
}

export async function loadRlsCrudMatrixFromInput(inputPath) {
  const raw = await readFile(inputPath, "utf8");
  return JSON.parse(raw);
}

export async function checkRlsCrudMatrix() {
  const inputPath = readArg("--input") || readArg("--in");
  const allowUnconfigured = args.includes("--allow-unconfigured");

  if (allowUnconfigured && !inputPath && (!accessToken || !projectRef)) {
    warnAndExit("Supabase live credentials are not configured; skipping live matrix check.");
  }

  const matrix = inputPath
    ? await loadRlsCrudMatrixFromInput(inputPath)
    : await captureLiveMatrix();

  assertRlsCrudMatrix(matrix);
  console.log(
    `[rls-crud-matrix] passed for ${matrix.summary?.public_table_count ?? matrix.tables.length} public table(s)`,
  );
  return matrix;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  checkRlsCrudMatrix().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
