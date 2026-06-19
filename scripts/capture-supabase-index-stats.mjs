#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function fail(message) {
  console.error(`[capture-supabase-index-stats] ${message}`);
  process.exit(1);
}

function writeEmptyArtifact(message) {
  writeFileSync(outPath, "[]\n");
  console.warn(`[capture-supabase-index-stats] ${message}`);
}

function isTransientQueryFailure(detail) {
  return /status 544|connection terminated|connection timeout|i\/o timeout|timed out|timeout|econnreset|etimedout|IPv6 is not supported|network is unreachable/i
    .test(detail);
}

function firstJsonValue(text) {
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;
  if (start < 0) return null;
  const opener = text[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const outPath = readArg("--out");
if (!outPath) fail("Missing --out <path>.");

const allowEmptyWhenUnconfigured = args.includes("--allow-empty-when-unconfigured");
const dbUrl = readArg("--db-url") ||
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_STAGING_EFFECTIVE_DB_URL ||
  process.env.SUPABASE_PRODUCTION_DB_URL;
const projectRef = process.env.SUPABASE_PROJECT_REF ||
  process.env.RELEASE_SAFETY_SUPABASE_PROJECT_REF ||
  process.env.VITE_SUPABASE_PROJECT_ID;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;

if (!dbUrl && allowEmptyWhenUnconfigured && (!projectRef || !dbPassword)) {
  writeEmptyArtifact("No DB URL/password configured; wrote an empty index stats artifact.");
  process.exit(0);
}

const tempDir = mkdtempSync(join(tmpdir(), "maiprop-index-stats-"));
const sqlPath = join(tempDir, "index-stats.sql");

try {
  writeFileSync(
    sqlPath,
    `
select
  s.schemaname,
  s.relname,
  s.indexrelname,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_relation_size(s.indexrelid) as index_bytes,
  coalesce(t.n_tup_ins, 0) + coalesce(t.n_tup_upd, 0) + coalesce(t.n_tup_del, 0) as table_writes,
  t.seq_scan as table_seq_scan,
  t.n_live_tup as table_live_rows,
  i.indisprimary as is_primary,
  i.indisunique as is_unique,
  i.indisexclusion as is_exclusion,
  coalesce(c.has_constraint, false) as has_constraint,
  c.contype as constraint_type,
  pg_get_indexdef(s.indexrelid) as indexdef
from pg_stat_user_indexes s
join pg_index i on i.indexrelid = s.indexrelid
left join lateral (
  select
    count(*) > 0 as has_constraint,
    string_agg(distinct con.contype::text, ',' order by con.contype::text) as contype
  from pg_constraint con
  where con.conindid = s.indexrelid
) c on true
left join pg_stat_user_tables t on t.relid = s.relid
order by s.schemaname, s.relname, s.indexrelname;
`.trimStart(),
    "utf8",
  );

  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  if (!dbUrl && projectRef && dbPassword) {
    const linkResult = spawnSync(
      npx,
      ["supabase", "link", "--project-ref", projectRef, "--password", dbPassword, "--yes"],
      {
        cwd: process.cwd(),
        env: process.env,
        encoding: "utf8",
        shell: process.platform === "win32",
      },
    );
    if (linkResult.status !== 0) {
      const detail = [
        linkResult.error ? `error=${linkResult.error.message}` : "",
        linkResult.signal ? `signal=${linkResult.signal}` : "",
        linkResult.stdout,
        linkResult.stderr,
      ].filter(Boolean).join("\n").replaceAll(dbPassword, "[redacted]");
      fail(`supabase link failed with exit ${linkResult.status}.\n${detail}`);
    }
  }

  const queryArgs = ["supabase", "db", "query"];
  if (dbUrl) {
    queryArgs.push("--db-url", dbUrl);
  } else {
    queryArgs.push("--linked");
  }
  queryArgs.push("--output", "json", "--file", sqlPath);

  const result = spawnSync(
    npx,
    queryArgs,
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    const detail = [
      result.error ? `error=${result.error.message}` : "",
      result.signal ? `signal=${result.signal}` : "",
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n");
    if (allowEmptyWhenUnconfigured && isTransientQueryFailure(detail)) {
      writeEmptyArtifact(
        `Supabase index stats query was transiently unavailable; wrote an empty artifact.\n${detail}`,
      );
    } else {
      fail(`supabase db query failed with exit ${result.status}.\n${detail}`);
    }
  } else {
    const jsonText = firstJsonValue(`${result.stdout}\n${result.stderr}`);
    if (!jsonText) fail("Could not parse JSON from supabase db query output.");
    const payload = JSON.parse(jsonText);
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.rows)
        ? payload.rows
        : Array.isArray(payload.data)
          ? payload.data
          : [];
    writeFileSync(outPath, `${JSON.stringify(rows, null, 2)}\n`);
    console.log(`[capture-supabase-index-stats] Wrote ${rows.length} index row(s) to ${outPath}.`);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
