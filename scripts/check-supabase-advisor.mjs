#!/usr/bin/env node
import localEnvLoader from "./_load-local-env.cjs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import {
  assertAdvisorDebtIsActionable,
  buildUnusedIndexReview,
  classifyAdvisorDebt,
  loadAdvisorDebtPolicy,
} from "./supabase-advisor-debt.mjs";
import {
  buildAdvisorStepSummary,
  computeAdvisorActionability,
} from "./supabase-advisor-summary.mjs";
import {
  isPerformanceAdvisorInternalSyntaxFailure,
  isTransientAdvisorFailure,
} from "./supabase-advisor-http.mjs";

localEnvLoader.loadLocalEnv();

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
const indexStatsPath = readArg("--index-stats");
const failOnError = args.includes("--fail-on-error");
const failOnUnknown = args.includes("--fail-on-unknown");
const allowTransientUnavailable = args.includes("--allow-transient-unavailable");
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

function advisorErrorDetail(payload, body) {
  if (payload && typeof payload === "object") {
    return String(payload.message ?? payload.error ?? payload.detail ?? body);
  }
  return String(body);
}

function buildTransientAdvisorUnavailableResult(category, status, detail) {
  const statusLabel = status ? `HTTP ${status}` : "network timeout";
  const unavailableReason = `${category} advisor request failed with ${statusLabel}: ${detail}`;
  console.warn(`[supabase-advisor] ${unavailableReason}`);
  return {
    category,
    lint_count: 0,
    lints: [],
    unavailable: true,
    unavailable_reason: unavailableReason,
    http_status: status,
  };
}

async function fetchAdvisor(category) {
  const url = `${apiBase}/projects/${encodeURIComponent(projectRef)}/advisors/${category}`;
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    const cause = error?.cause?.code ? ` (${error.cause.code})` : "";
    const detail = `${error?.message ?? error}${cause}`;
    if (allowTransientUnavailable && isTransientAdvisorFailure(0, detail)) {
      return buildTransientAdvisorUnavailableResult(category, 0, detail);
    }
    throw error;
  }

  const body = await response.text();
  let payload;
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    payload = { raw: body };
  }

  if (!response.ok) {
    const detail = advisorErrorDetail(payload, body);
    if (isPerformanceAdvisorInternalSyntaxFailure(response.status, detail, category)) {
      return buildTransientAdvisorUnavailableResult(category, response.status, detail);
    }
    if (allowTransientUnavailable && isTransientAdvisorFailure(response.status, detail)) {
      return buildTransientAdvisorUnavailableResult(category, response.status, detail);
    }
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

async function readIndexStats(path) {
  if (!path) return [];
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  if (Array.isArray(parsed?.data)) return parsed.data;
  fail(`Index stats file ${path} must be a JSON array or object with rows/data array.`);
}

const results = [];
for (const category of categories) {
  results.push(await fetchAdvisor(category));
}

const transientAdvisorUnavailable = results
  .filter((result) => result.unavailable)
  .map((result) => ({
    category: result.category,
    http_status: result.http_status,
    reason: result.unavailable_reason,
  }));

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
const advisorDebt = classifyAdvisorDebt(
  { results },
  await loadAdvisorDebtPolicy(),
);
const unusedIndexReview = buildUnusedIndexReview(
  { results },
  await readIndexStats(indexStatsPath),
);
const advisorActionability = computeAdvisorActionability({
  failingLintCount,
  advisorDebt,
});

const summary = {
  generated_at: new Date().toISOString(),
  project_ref: projectRef,
  api_base: apiBase,
  fail_on_error: failOnError,
  fail_on_unknown: failOnUnknown,
  allow_transient_unavailable: allowTransientUnavailable,
  totals,
  failing_lint_count: failingLintCount,
  actionable_lint_count: advisorActionability.actionable_lint_count,
  known_debt_count: advisorActionability.known_debt_count,
  transient_advisor_unavailable: transientAdvisorUnavailable,
  advisor_debt: advisorDebt,
  unused_index_review: unusedIndexReview,
  results,
};

const json = `${JSON.stringify(summary, null, 2)}\n`;
if (outPath) await writeFile(outPath, json);
console.log(json);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    buildAdvisorStepSummary({
      projectRef,
      results,
      failingLintCount,
      advisorDebt,
      unusedIndexReview,
      transientAdvisorUnavailable,
    }),
  );
}

if (failOnError && failingLintCount > 0) {
  fail(`Found ${failingLintCount} advisor lint(s) at ERROR/CRITICAL/HIGH severity.`);
}

if (failOnUnknown) {
  try {
    assertAdvisorDebtIsActionable(advisorDebt);
  } catch (error) {
    fail(error.message);
  }
}
