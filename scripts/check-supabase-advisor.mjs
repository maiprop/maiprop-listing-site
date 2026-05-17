#!/usr/bin/env node
import { appendFile, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);

function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : "";
}

function fail(message) {
  console.error(`[supabase-advisor] ${message}`);
  process.exit(1);
}

const outPath = readArg("--out");
const failOnError = args.includes("--fail-on-error");
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  process.env.RELEASE_SAFETY_SUPABASE_PROJECT_REF ||
  process.env.STAGING_SUPABASE_PROJECT_ID ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  "";
const apiBase = (process.env.SUPABASE_MANAGEMENT_API_BASE || "https://api.supabase.com/v1")
  .replace(/\/+$/, "");

if (!accessToken) fail("Missing SUPABASE_ACCESS_TOKEN.");
if (!projectRef || projectRef === "abcdefghijklmnop") {
  fail("Missing a real Supabase project ref. Set SUPABASE_PROJECT_REF or RELEASE_SAFETY_SUPABASE_PROJECT_REF.");
}

const categories = ["security", "performance"];

function extractLints(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const key of ["lints", "advisors", "data", "result"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return Object.values(payload).flatMap((value) => (Array.isArray(value) ? value : []));
}

function lintLevel(lint) {
  return String(lint.level ?? lint.severity ?? lint.status ?? "UNKNOWN").toUpperCase();
}

function lintName(lint) {
  return String(lint.name ?? lint.title ?? lint.cache_key ?? lint.id ?? "unnamed_lint");
}

async function fetchAdvisor(category) {
  const url = `${apiBase}/projects/${encodeURIComponent(projectRef)}/advisors/${category}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const body = await response.text();
  let payload;
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = { raw: body };
  }

  if (!response.ok) {
    const detail = typeof payload === "object" && payload ? payload.message ?? payload.error ?? body : body;
    throw new Error(`${category} advisor request failed with HTTP ${response.status}: ${detail}`);
  }

  const lints = extractLints(payload).map((lint) => ({
    name: lintName(lint),
    title: lint.title ?? lintName(lint),
    level: lintLevel(lint),
    categories: lint.categories ?? [category.toUpperCase()],
    cache_key: lint.cache_key ?? null,
    metadata: lint.metadata ?? null,
  }));

  return { category, lint_count: lints.length, lints };
}

const results = [];
for (const category of categories) {
  results.push(await fetchAdvisor(category));
}

const totals = results.reduce(
  (acc, result) => {
    acc.lints += result.lint_count;
    for (const lint of result.lints) {
      acc.by_level[lint.level] = (acc.by_level[lint.level] ?? 0) + 1;
    }
    return acc;
  },
  { lints: 0, by_level: {} },
);

const failingLevels = new Set(["ERROR", "CRITICAL", "HIGH"]);
const failingLintCount = results.reduce(
  (count, result) => count + result.lints.filter((lint) => failingLevels.has(lint.level)).length,
  0,
);

const summary = {
  generated_at: new Date().toISOString(),
  project_ref: projectRef,
  api_base: apiBase,
  fail_on_error: failOnError,
  totals,
  failing_lint_count: failingLintCount,
  results,
};

const json = `${JSON.stringify(summary, null, 2)}\n`;
if (outPath) await writeFile(outPath, json);
console.log(json);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results
    .map((result) => `| ${result.category} | ${result.lint_count} |`)
    .join("\n");
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    [
      "## Supabase Advisor",
      "",
      `Project: \`${projectRef}\``,
      "",
      "| Category | Lints |",
      "|---|---:|",
      rows,
      "",
      `Failing severity lints: ${failingLintCount}`,
      "",
    ].join("\n"),
  );
}

if (failOnError && failingLintCount > 0) {
  fail(`Found ${failingLintCount} advisor lint(s) at ERROR/CRITICAL/HIGH severity.`);
}
